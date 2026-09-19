import { Env, ModelCandidate, ChatCompletionPayload } from './types';

/**
 * Resolves the upstream API key from environment secrets.
 */
export function getUpstreamKey(candidate: ModelCandidate, env: Env): string {
  switch (candidate.provider) {
    case 'gemini':
      return env.GEMINI_API_KEY || '';
    case 'groq':
      return env.GROQ_API_KEY || '';
    case 'openrouter':
      return env.OPENROUTER_API_KEY || '';
    case '9flare':
      return env.NINEFLARE_API_KEY || '';
    case 'cloudflare':
      return env.CLOUDFLARE_API_KEY || '';
    default:
      return '';
  }
}

/**
 * Resolves the access key to be passed in X-Proxy-Key for Cloudflare Workers.
 * CRITICAL DIRECTIVE: Every HTTP request to a Cloudflare Worker MUST ALWAYS include
 * this access key in the 'X-Proxy-Key' header to satisfy edge ingress checks.
 */
export function resolveAccessKey(candidate: ModelCandidate, env: Env, incomingProxyKey?: string): string {
  return incomingProxyKey || env.PROXY_SECRET || getUpstreamKey(candidate, env) || '';
}

/**
 * Dispatches request to the appropriate upstream Cloudflare Worker proxy.
 * ALWAYS passes the access key in the X-Proxy-Key header.
 */
export async function executeUpstreamCall(
  candidate: ModelCandidate,
  payload: ChatCompletionPayload,
  env: Env,
  timeoutMs: number,
  incomingProxyKey?: string
): Promise<Response> {
  const apiKey = getUpstreamKey(candidate, env);

  if (candidate.provider === 'gemini') {
    return callGeminiRest(candidate, payload, apiKey, env, timeoutMs, incomingProxyKey);
  }

  // OpenAI-compatible Cloudflare Worker endpoints: Groq, OpenRouter, 9Flare, Ollama, Cloudflare AI
  return callOpenAiCompatible(candidate, payload, apiKey, env, timeoutMs, incomingProxyKey);
}

/**
 * OpenAI-compatible Cloudflare Worker call.
 * Routes directly to the dedicated worker proxy (e.g. groq.nclong87.workers.dev/openai/v1)
 * ALWAYS passes the access key to header X-Proxy-Key.
 */
async function callOpenAiCompatible(
  candidate: ModelCandidate,
  payload: ChatCompletionPayload,
  apiKey: string,
  env: Env,
  timeoutMs: number,
  incomingProxyKey?: string
): Promise<Response> {
  const cleanWorkerUrl = candidate.workerUrl.replace(/\/+$/, '');
  const url = cleanWorkerUrl.endsWith('/chat/completions')
    ? cleanWorkerUrl
    : `${cleanWorkerUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  // MANDATORY: Always pass the access key to header X-Proxy-Key in the request to Cloudflare workers
  const accessKey = resolveAccessKey(candidate, env, incomingProxyKey);
  if (accessKey) {
    headers['X-Proxy-Key'] = accessKey;
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  if (candidate.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://workers.cloudflare.com';
    headers['X-Title'] = 'Cloudflare LLM Edge Router';
  }

  const upstreamBody = {
    model: candidate.model,
    messages: payload.messages,
    temperature: payload.temperature ?? 0.7,
    max_tokens: payload.max_tokens,
    stream: payload.stream ?? false,
    response_format: payload.response_format
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(upstreamBody),
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Google Gemini REST v1beta native call.
 * Routes directly to gemini.nclong87.workers.dev/v1beta.
 * ALWAYS passes the access key to header X-Proxy-Key.
 * Translates OpenAI chat messages to Gemini contents structure.
 */
async function callGeminiRest(
  candidate: ModelCandidate,
  payload: ChatCompletionPayload,
  apiKey: string,
  env: Env,
  timeoutMs: number,
  incomingProxyKey?: string
): Promise<Response> {
  const cleanWorkerUrl = candidate.workerUrl.replace(/\/+$/, '');
  let url = `${cleanWorkerUrl}/models/${candidate.model}:generateContent`;
  if (apiKey && !cleanWorkerUrl.includes('workers.dev')) {
    url += `?key=${apiKey}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  // MANDATORY: Always pass the access key to header X-Proxy-Key in the request to Cloudflare workers
  const accessKey = resolveAccessKey(candidate, env, incomingProxyKey);
  if (accessKey) {
    headers['X-Proxy-Key'] = accessKey;
  }

  if (apiKey) {
    headers['x-goog-api-key'] = apiKey;
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Extract system instruction and user/assistant messages
  let systemInstructionText = '';
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const m of payload.messages) {
    if (m.role === 'system') {
      systemInstructionText += (systemInstructionText ? '\n' : '') + m.content;
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }
  }

  const geminiPayload: any = {
    contents,
    generationConfig: {
      temperature: payload.temperature ?? 0.7,
      maxOutputTokens: payload.max_tokens
    }
  };

  if (systemInstructionText) {
    geminiPayload.systemInstruction = {
      parts: [{ text: systemInstructionText }]
    };
  }

  if (payload.response_format?.type === 'json_object') {
    geminiPayload.generationConfig.responseMimeType = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(geminiPayload),
      signal: controller.signal
    });

    if (!res.ok) {
      return res; // Bubble upstream error status to trigger failover
    }

    // Transform Gemini response format into OpenAI chat completions schema
    const geminiData: any = await res.json();
    const outputText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const openAiResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: candidate.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: outputText
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
        completion_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: geminiData.usageMetadata?.totalTokenCount || 0
      }
    };

    return new Response(JSON.stringify(openAiResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } finally {
    clearTimeout(timer);
  }
}
