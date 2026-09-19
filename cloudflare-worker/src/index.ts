import { Env, ExecutionContextLike, ChatCompletionPayload } from './types';
import { hydrateState, getAllMetrics, getAllLocks, unlockModel, clearAllLocks, recordSuccess, recordFailure } from './metricsStore';
import { getNextCandidate } from './router';
import { executeUpstreamCall } from './adapters';
import { getAllRegisteredCandidates } from './registry';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Proxy-Key, HTTP-Referer, X-Title'
};

function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // 2. Ensure In-Memory State is hydrated from KV on cold-start
    await hydrateState(env);

    const url = new URL(request.url);
    const path = url.pathname;

    // 3. Authenticate Ingress Traffic
    const authHeader = request.headers.get('Authorization') || '';
    const proxyKeyHeader = request.headers.get('X-Proxy-Key') || '';
    const expectedSecret = env.PROXY_SECRET;

    if (expectedSecret) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const isValid = token === expectedSecret || proxyKeyHeader === expectedSecret;
      if (!isValid) {
        return jsonResponse({ error: 'Unauthorized: Invalid or missing proxy key.' }, 401);
      }
    }

    // 4. Public Health Check
    if (path === '/health' || path === '/') {
      return jsonResponse({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Cloudflare LLM Edge Router'
      });
    }

    // 5. System Metrics & Status Endpoint
    if (path === '/v1/status' || path === '/status') {
      return jsonResponse({
        metrics: getAllMetrics(),
        lockedModels: getAllLocks()
      });
    }

    // 6. Manual Unlock Endpoint
    if (path === '/v1/unlock' && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      if (body.all) {
        clearAllLocks(env, ctx);
        return jsonResponse({ message: 'All model locks cleared successfully.' });
      }
      if (body.provider && body.model) {
        unlockModel(body.provider, body.model, env, ctx);
        return jsonResponse({ message: `Model ${body.provider}:${body.model} unlocked successfully.` });
      }
      return jsonResponse({ error: 'Specify { provider, model } or { all: true }' }, 400);
    }

    // 7. Models List Endpoint (OpenAI-compatible)
    if (path === '/v1/models') {
      const candidates = getAllRegisteredCandidates();
      return jsonResponse({
        object: 'list',
        data: candidates.map(c => ({
          id: `${c.provider}/${c.model}`,
          object: 'model',
          owned_by: c.provider,
          permission: []
        }))
      });
    }

    // 8. Core LLM Routing & Execution Endpoint
    if (path === '/v1/chat/completions' && request.method === 'POST') {
      let payload: ChatCompletionPayload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON request body' }, 400);
      }

      if (!payload.messages || !Array.isArray(payload.messages) || payload.messages.length === 0) {
        return jsonResponse({ error: 'Missing required field: messages' }, 400);
      }

      const timeoutMs = parseInt(env.DEFAULT_TIMEOUT_MS || '30000', 10);
      const incomingProxyKey = proxyKeyHeader || authHeader.replace(/^Bearer\s+/i, '').trim();
      const excludedKeys = new Set<string>();
      const maxRetries = 1; // Do not automatically retry immediately 4 times before showing retrying countdown
      let attempt = 0;
      let lastErrorReason = 'Unknown error';
      let lastCandidate: any = null;

      while (attempt < maxRetries) {
        attempt++;

        // Route to optimal candidate
        const routing = getNextCandidate(
          payload.preferred_provider,
          payload.preferred_models,
          excludedKeys
        );

        const candidate = routing.candidate;
        lastCandidate = candidate;
        const candidateKey = `${candidate.provider}:${candidate.model}`;
        const startTime = Date.now();

        try {
          console.log(`[Router] Attempt #${attempt}: Dispatching to ${candidateKey} (Tier ${routing.tier}, Untested: ${routing.isUntested})`);

          const upstreamRes = await executeUpstreamCall(candidate, payload, env, timeoutMs, incomingProxyKey);
          const durationMs = Date.now() - startTime;

          // If upstream succeeded (200 OK)
          if (upstreamRes.ok) {
            recordSuccess(candidate.provider, candidate.model, durationMs, env, ctx);

            // Forward response headers with routing diagnostics
            const responseHeaders = new Headers(upstreamRes.headers);
            for (const [k, v] of Object.entries(CORS_HEADERS)) {
              responseHeaders.set(k, v);
            }
            responseHeaders.set('X-Routed-Provider', candidate.provider);
            responseHeaders.set('X-Routed-Model', candidate.model);
            responseHeaders.set('X-Routed-Tier', String(routing.tier));
            responseHeaders.set('X-Response-Time-Ms', String(durationMs));
            responseHeaders.set('X-Retry-Attempts', String(attempt));

            return new Response(upstreamRes.body, {
              status: 200,
              headers: responseHeaders
            });
          }

          // Upstream failed with HTTP error code
          const errStatus = upstreamRes.status;
          const errBody = await upstreamRes.text().catch(() => 'No error body');
          lastErrorReason = `HTTP ${errStatus}: ${errBody.slice(0, 150)}`;

          console.warn(`[Router] Failure on ${candidateKey} (${errStatus}): ${lastErrorReason}`);
          recordFailure(candidate.provider, candidate.model, lastErrorReason, env, ctx);
          excludedKeys.add(candidateKey);
        } catch (err: any) {
          const durationMs = Date.now() - startTime;
          lastErrorReason = err.name === 'AbortError'
            ? `Timeout after ${Math.round(timeoutMs / 1000)}s`
            : (err.message || 'Network exception');

          console.warn(`[Router] Exception on ${candidateKey} (${durationMs}ms): ${lastErrorReason}`);
          recordFailure(candidate.provider, candidate.model, lastErrorReason, env, ctx);
          excludedKeys.add(candidateKey);
        }
      }

      // If candidate attempt failed, return error with candidate info immediately
      const failedModelName = lastCandidate ? `${lastCandidate.provider}/${lastCandidate.model}` : undefined;
      return jsonResponse({
        error: failedModelName ? `Lỗi kết nối mô hình ${failedModelName}: ${lastErrorReason}` : `Lỗi kết nối mô hình AI: ${lastErrorReason}`,
        failedModel: failedModelName,
        attempts: attempt,
        lastError: lastErrorReason,
        status: 'error'
      }, 502);
    }

    return jsonResponse({ error: `Not Found: ${path}` }, 404);
  }
};
