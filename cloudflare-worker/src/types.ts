export type LLMProviderId = 'gemini' | 'groq' | 'openrouter' | '9flare' | 'cloudflare' | 'ollama';

export interface ModelCandidate {
  provider: LLMProviderId;
  model: string;
  workerUrl: string; // Cloudflare Worker endpoint URL (nclong87.workers.dev)
}

export interface RequestOutcomeEntry {
  success: boolean;
  durationMs?: number;
  timestamp: number;
}

export interface FailureLogEntry {
  id: string;
  timestamp: number;
  reason: string;
}

export interface ModelMetricsRecord {
  provider: string;
  model: string;
  lastResponseTimeMs: number | null;
  avgResponseTimeMs: number | null;
  recentResponseTimes: number[];
  recentOutcomes: RequestOutcomeEntry[];
  lastTestedAt: number | null;
  lastError: string | null;
  totalCalls: number;
  totalSuccesses: number;
  failureLogs: FailureLogEntry[];
}

export interface LockedModelInfo {
  provider: string;
  model: string;
  lockedAt: number;
  expiresAt: number;
  reason?: string;
}

export type PerformanceTier = 1 | 2 | 4;

export interface KVNamespaceLike {
  get(key: string, type?: string): Promise<any>;
  put(key: string, value: string, options?: any): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException?(): void;
}

export interface Env {
  LLM_STATE_KV?: KVNamespaceLike;
  PROXY_SECRET?: string;
  DEFAULT_TIMEOUT_MS?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  NINEFLARE_API_KEY?: string;
  CLOUDFLARE_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI?: any; // Cloudflare Workers AI binding
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionPayload {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: string };
  preferred_provider?: LLMProviderId;
  preferred_models?: string[];
}
