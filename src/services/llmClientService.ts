import { logApiRequest } from "./requestHistoryService";
import { GatewayStatusResponse } from "../types";

/**
 * Executes a call to the Cloudflare Worker proxy and records full audit logs into IndexedDB.
 * CRITICAL MANDATE: Always pass the access key in the 'X-Proxy-Key' header on all requests
 * to Cloudflare Workers (*.workers.dev) for edge ingress authentication.
 */
export async function callCloudflareWorkerWithLogging(params: {
  workerUrl: string;
  provider: string;
  model: string;
  prompt: string;
  systemInstruction?: string;
  accessKey: string;
  action?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const startTime = Date.now();

  try {
    // 1. Prepare request payload and headers
    const cleanUrl = params.workerUrl.replace(/\/+$/, "");
    const isGeminiNative = params.provider === "gemini" && cleanUrl.includes("/v1beta");

    let fetchUrl: string;
    let payload: any;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Proxy-Key": params.accessKey, // MANDATORY Cloudflare Workers ingress header
    };

    if (params.accessKey) {
      headers["Authorization"] = `Bearer ${params.accessKey}`;
    }

    if (isGeminiNative) {
      fetchUrl = `${cleanUrl}/models/${params.model}:generateContent`;
      headers["x-goog-api-key"] = params.accessKey;

      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
        { role: "user", parts: [{ text: params.prompt }] }
      ];

      payload = {
        contents,
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          maxOutputTokens: params.maxTokens,
        }
      };

      if (params.systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: params.systemInstruction }]
        };
      }

      if (params.jsonMode) {
        payload.generationConfig.responseMimeType = "application/json";
      }
    } else {
      // Standard OpenAI Chat Completions payload for Groq, OpenRouter, 9Flare, Ollama, Cloudflare, or Router
      fetchUrl = cleanUrl.endsWith("/chat/completions")
        ? cleanUrl
        : `${cleanUrl}/chat/completions`;

      if (params.provider === "openrouter") {
        headers["HTTP-Referer"] = typeof window !== "undefined" ? window.location.origin : "https://workers.cloudflare.com";
        headers["X-Title"] = "Cloudflare LLM Edge Proxy";
      }

      payload = {
        model: params.model,
        messages: [
          ...(params.systemInstruction ? [{ role: "system", content: params.systemInstruction }] : []),
          { role: "user", content: params.prompt }
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        ...(params.jsonMode ? { response_format: { type: "json_object" } } : {})
      };
    }

    // 2. Dispatch request to Cloudflare Worker proxy with mandatory X-Proxy-Key
    const response = await fetch(fetchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const durationMs = Date.now() - startTime;
    const rawText = await response.text();

    if (!response.ok) {
      const err = new Error(`Worker HTTP ${response.status}: ${rawText}`);
      (err as any).statusCode = response.status;
      (err as any).rawResponse = rawText;
      throw err;
    }

    let content = "";
    try {
      const data = JSON.parse(rawText);
      if (isGeminiNative) {
        content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        content = data.choices?.[0]?.message?.content || "";
      }
    } catch {
      content = rawText;
    }

    // 3. Log SUCCESS into IndexedDB asynchronously (non-blocking)
    logApiRequest({
      provider: params.provider,
      model: params.model,
      prompt: params.prompt,
      systemInstruction: params.systemInstruction,
      response: content,
      rawResponse: rawText,
      responseTimeMs: durationMs,
      status: "success",
      statusCode: response.status,
      action: params.action
    }).catch(err => console.warn("Failed to persist request log:", err));

    return content;

  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    // 4. Log ERROR into IndexedDB asynchronously for auditing & circuit-breaker inspection
    logApiRequest({
      provider: params.provider,
      model: params.model,
      prompt: params.prompt,
      systemInstruction: params.systemInstruction,
      response: err.message || String(err),
      rawResponse: err.rawResponse,
      responseTimeMs: durationMs,
      status: "error",
      statusCode: err.statusCode || 500,
      errorMessage: err.message || String(err),
      action: params.action
    }).catch(e => console.warn("Failed to persist error log:", e));

    throw err;
  }
}

/**
 * Diagnostic test for any Cloudflare Worker proxy endpoint.
 */
export async function testWorkerConnection(params: {
  workerUrl: string;
  provider: string;
  model: string;
  accessKey: string;
}): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  try {
    const result = await callCloudflareWorkerWithLogging({
      workerUrl: params.workerUrl,
      provider: params.provider,
      model: params.model,
      prompt: 'Echo "status": "connected" in JSON format.',
      systemInstruction: 'You are a test agent. Output valid JSON: {"status": "connected"}',
      accessKey: params.accessKey,
      action: "Connection Test",
      temperature: 0.1,
      maxTokens: 50,
      jsonMode: true
    });

    const latencyMs = Date.now() - start;
    return {
      ok: true,
      message: result.slice(0, 100),
      latencyMs
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      ok: false,
      message: err.message || "Failed to reach Cloudflare Worker proxy",
      latencyMs
    };
  }
}

/**
 * Fetches the current edge router metrics and circuit-breaker lock statuses.
 */
export async function fetchGatewayStatus(): Promise<GatewayStatusResponse | null> {
  try {
    const res = await fetch("/v1/status");
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Could not fetch gateway status:", err);
  }
  return null;
}

/**
 * Manually unlocks a specific model or all models in the circuit breaker.
 */
export async function unlockGatewayModel(provider?: string, model?: string, all = false): Promise<boolean> {
  try {
    const res = await fetch("/v1/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { all: true } : { provider, model })
    });
    return res.ok;
  } catch (err) {
    console.error("Unlock failed:", err);
    return false;
  }
}
