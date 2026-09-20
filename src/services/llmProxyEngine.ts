import {
  LLMProviderId,
  ModelCandidate,
  ModelMetricsRecord,
  LockedModelInfo,
  PerformanceTier,
  ChatCompletionPayload,
} from "../../cloudflare-worker/src/types";
import { llmEventBus, RequestStartEvent } from "./llmEventBus";

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;
export const FIVE_DAYS_MS = 5 * ONE_DAY_MS;
export const MAX_LOCK_MS = 4 * ONE_DAY_MS; // 96 hours
export const DEFAULT_CONSERVATIVE_LATENCY_MS = 20000; // 20.0s empirical default fallback

export interface ProviderDefinition {
  id: LLMProviderId;
  name: string;
  workerUrl: string;
  models: string[];
}

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: "groq",
    name: "Groq",
    workerUrl: "https://groq.nclong87.workers.dev/openai/v1",
    models: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "openai/gpt-oss-safeguard-20b",
      "groq/compound",
      "qwen/qwen3.8-27b"
    ]
  },
  {
    id: "gemini",
    name: "Google Gemini",
    workerUrl: "https://gemini.nclong87.workers.dev/v1beta",
    models: [
      "gemini-3.6-flash",
      "gemini-3.8-flash"
    ]
  },
  {
    id: "9flare",
    name: "9Flare",
    workerUrl: "https://9flare.nclong87.workers.dev/api/v1",
    models: [
      "pro/gpt-5.6-luna",
      "pro/claude-haiku-4-5"
    ]
  },
  {
    id: "ollama",
    name: "Ollama",
    workerUrl: "https://ollama.nclong87.workers.dev/v1",
    models: [
      "gpt-oss:20b",
      "gemma4:31b",
      "nemotron-3-nano:30b-cloud"
    ]
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    workerUrl: "https://openrouter.nclong87.workers.dev/api/v1",
    models: [
      "meta-llama/llama-3.3-70b-instruct",
      "google/gemini-2.0-flash",
      "cohere/command-r-plus"
    ]
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    workerUrl: "https://cloudflare.nclong87.workers.dev",
    models: [
      "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    ]
  }
];

export function getAllRegisteredCandidates(): ModelCandidate[] {
  const candidates: ModelCandidate[] = [];
  const providers = PROVIDER_REGISTRY;
  const maxModels = Math.max(...providers.map(p => p.models.length), 0);

  for (let i = 0; i < maxModels; i++) {
    for (const p of providers) {
      if (p.models[i]) {
        candidates.push({
          provider: p.id,
          model: p.models[i],
          workerUrl: p.workerUrl
        });
      }
    }
  }
  return candidates;
}

// Persistent Storage Keys
const LOCAL_STORAGE_METRICS_KEY = "llm_metrics_v2";
const LOCAL_STORAGE_LOCKS_KEY = "llm_locks_v2";

// In-Memory store with persistent hydration
let metricsStore: Record<string, ModelMetricsRecord> = {};
let locksStore: Record<string, LockedModelInfo> = {};
let rotationIndex = 0;
let explorationCounter = 0;

function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function hydrateFromLocalStorage(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    const rawMetrics = localStorage.getItem(LOCAL_STORAGE_METRICS_KEY);
    if (rawMetrics) {
      metricsStore = JSON.parse(rawMetrics);
    }
    const rawLocks = localStorage.getItem(LOCAL_STORAGE_LOCKS_KEY);
    if (rawLocks) {
      const parsedLocks = JSON.parse(rawLocks);
      const now = Date.now();
      const validLocks: Record<string, LockedModelInfo> = {};
      for (const [k, v] of Object.entries(parsedLocks as Record<string, LockedModelInfo>)) {
        if (v && v.expiresAt > now) {
          validLocks[k] = v;
        }
      }
      locksStore = validLocks;
    }
  } catch (err) {
    console.warn("Could not hydrate LLM metrics/locks from localStorage:", err);
  }
}

function persistToLocalStorage(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.setItem(LOCAL_STORAGE_METRICS_KEY, JSON.stringify(metricsStore));
    localStorage.setItem(LOCAL_STORAGE_LOCKS_KEY, JSON.stringify(locksStore));
  } catch (err) {
    console.warn("Could not persist LLM metrics/locks to localStorage:", err);
  }
}

// Initial hydration
hydrateFromLocalStorage();

export function getConsecutiveFailures(metric?: ModelMetricsRecord, isCurrentlyFailing = false): number {
  if (!metric) return isCurrentlyFailing ? 1 : 0;
  let consecutive = 0;
  const outcomes = metric.recentOutcomes || [];

  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (!outcomes[i].success) {
      consecutive++;
    } else {
      break;
    }
  }

  if (isCurrentlyFailing) {
    const lastOutcome = outcomes[outcomes.length - 1];
    const alreadyRecorded = lastOutcome && !lastOutcome.success && (Date.now() - lastOutcome.timestamp < 2000);
    if (!alreadyRecorded) {
      consecutive++;
    }
  }

  return Math.max(isCurrentlyFailing ? 1 : 0, consecutive);
}

/**
 * Calculates dynamic adaptive lock duration based on:
 * Factor 1: Consecutive failure streak base duration (1h -> 96h)
 * Factor 2: Accumulated failure history with 5-day recency power decay (1.4 exponent)
 * Factor 3: High latency multiplier (>15s penalty)
 * Factor 4: Historical reliability multiplier (0.5x, 2.0x, 1.5x)
 * Factor 5: Boundary clamping between 1 hour and 4 days (96 hours)
 */
export function calculateLockDuration(metric?: ModelMetricsRecord, errorReason?: string): number {
  if (!metric) return ONE_HOUR_MS;

  const now = Date.now();
  const totalCalls = metric.totalCalls || 0;
  const totalSuccesses = metric.totalSuccesses || 0;
  const isCurrentlyFailing = errorReason !== undefined;

  // 1. Consecutive Failure Base Duration
  const consecutive = getConsecutiveFailures(metric, isCurrentlyFailing);
  let baseDuration = ONE_HOUR_MS;
  if (consecutive === 2) {
    baseDuration = 4 * ONE_HOUR_MS;
  } else if (consecutive === 3) {
    baseDuration = ONE_DAY_MS;
  } else if (consecutive === 4) {
    baseDuration = Math.round(2.25 * ONE_DAY_MS);
  } else if (consecutive === 5) {
    baseDuration = Math.round(3.25 * ONE_DAY_MS);
  } else if (consecutive >= 6) {
    baseDuration = MAX_LOCK_MS;
  }

  // 2. 5-Day Recency Power-Decay Penalty
  const fiveDaysAgo = now - FIVE_DAYS_MS;
  const recentFailures = (metric.failureLogs || []).filter(l => l.timestamp >= fiveDaysAgo);
  let recencyPenalty = 0;

  for (const log of recentFailures) {
    const ageMs = Math.max(0, now - log.timestamp);
    if (isCurrentlyFailing && ageMs < 2000) continue;

    const normalizedAge = Math.min(1, ageMs / FIVE_DAYS_MS);
    const recencyWeight = Math.max(0.05, Math.pow(1 - normalizedAge, 1.4));
    recencyPenalty += ONE_HOUR_MS * recencyWeight;
  }

  const accumulatedBase = baseDuration + recencyPenalty;

  // 3. Response Time Multiplier (>15s penalty)
  let latencyMultiplier = 1.0;
  const avgLatency = metric.avgResponseTimeMs || metric.lastResponseTimeMs || 0;
  if (avgLatency > 15000) {
    latencyMultiplier = Math.min(3.0, 1.0 + (avgLatency - 15000) / 10000);
  }

  // 4. Historical Reliability Multiplier
  let reliabilityMultiplier = 1.0;
  if (totalCalls >= 3) {
    const successRate = totalSuccesses / totalCalls;
    if (successRate >= 0.9 && consecutive <= 1) {
      reliabilityMultiplier = 0.5;
    } else if (successRate < 0.5) {
      reliabilityMultiplier = 2.0;
    } else if (successRate < 0.75) {
      reliabilityMultiplier = 1.5;
    }
  }

  const finalDuration = accumulatedBase * latencyMultiplier * reliabilityMultiplier;
  return Math.max(ONE_HOUR_MS, Math.min(MAX_LOCK_MS, Math.round(finalDuration)));
}

export function isModelLocked(provider: string, model: string): boolean {
  const key = `${provider}:${model}`;
  const lock = locksStore[key];
  if (!lock) return false;
  if (lock.expiresAt <= Date.now()) {
    delete locksStore[key];
    persistToLocalStorage();
    return false;
  }
  return true;
}

export function getAllMetrics(): Record<string, ModelMetricsRecord> {
  return { ...metricsStore };
}

export function getAllLocks(): Record<string, LockedModelInfo> {
  const now = Date.now();
  const active: Record<string, LockedModelInfo> = {};
  for (const [k, v] of Object.entries(locksStore)) {
    if (v.expiresAt > now) {
      active[k] = v;
    }
  }
  return active;
}

export function unlockModel(provider: string, model: string): void {
  delete locksStore[`${provider}:${model}`];
  persistToLocalStorage();
}

export function clearAllLocks(): void {
  locksStore = {};
  persistToLocalStorage();
}

/**
 * Expected Duration Hierarchy ($T_expected):
 * 1. Rolling historical average (from verified successful requests: K >= 50)
 * 2. Most recent single latency benchmark
 * 3. Default conservative fallback (20,000 ms = 20.0s)
 */
export function getExpectedResponseTimeMs(provider: string, model: string): number {
  const key = `${provider}:${model}`;
  const metric = metricsStore[key];
  if (metric) {
    if (typeof metric.avgResponseTimeMs === "number" && metric.avgResponseTimeMs > 0) {
      return metric.avgResponseTimeMs;
    }
    if (typeof metric.lastResponseTimeMs === "number" && metric.lastResponseTimeMs > 0) {
      return metric.lastResponseTimeMs;
    }
  }
  return DEFAULT_CONSERVATIVE_LATENCY_MS;
}

export function recordSuccess(provider: string, model: string, durationMs: number): void {
  const key = `${provider}:${model}`;
  delete locksStore[key];

  const existing = metricsStore[key];
  const prevCalls = existing?.totalCalls || 0;
  const prevSuccesses = existing?.totalSuccesses || 0;
  const validDuration = Math.max(1, Math.round(durationMs));

  const prevOutcomes = existing?.recentOutcomes || [];
  const updatedOutcomes = [...prevOutcomes, { success: true, durationMs: validDuration, timestamp: Date.now() }].slice(-50);
  const successDurations = updatedOutcomes
    .filter(o => o.success && typeof o.durationMs === "number")
    .map(o => o.durationMs as number);

  const avgLatency = successDurations.length > 0
    ? Math.round(successDurations.reduce((sum, d) => sum + d, 0) / successDurations.length)
    : validDuration;

  metricsStore[key] = {
    provider,
    model,
    lastResponseTimeMs: validDuration,
    avgResponseTimeMs: avgLatency,
    recentResponseTimes: successDurations,
    recentOutcomes: updatedOutcomes,
    lastTestedAt: Date.now(),
    lastError: null,
    totalCalls: prevCalls + 1,
    totalSuccesses: prevSuccesses + 1,
    failureLogs: existing?.failureLogs || []
  };

  persistToLocalStorage();
}

export function recordFailure(provider: string, model: string, reason: string): void {
  const key = `${provider}:${model}`;
  const now = Date.now();
  const existing = metricsStore[key];

  const prevCalls = existing?.totalCalls || 0;
  const prevSuccesses = existing?.totalSuccesses || 0;

  const fiveDaysAgo = now - FIVE_DAYS_MS;
  const existingLogs = existing?.failureLogs || [];
  const updatedLogs = [{ id: `${now}-${Math.random().toString(36).substring(2, 7)}`, timestamp: now, reason }, ...existingLogs]
    .filter(l => l.timestamp >= fiveDaysAgo)
    .slice(0, 50);

  const prevOutcomes = existing?.recentOutcomes || [];
  const updatedOutcomes = [...prevOutcomes, { success: false, timestamp: now }].slice(-50);

  metricsStore[key] = {
    provider,
    model,
    lastResponseTimeMs: existing?.lastResponseTimeMs || null,
    avgResponseTimeMs: existing?.avgResponseTimeMs || null,
    recentResponseTimes: existing?.recentResponseTimes || [],
    recentOutcomes: updatedOutcomes,
    lastTestedAt: now,
    lastError: reason,
    totalCalls: prevCalls + 1,
    totalSuccesses: prevSuccesses,
    failureLogs: updatedLogs
  };

  const lockMs = calculateLockDuration(metricsStore[key], reason);
  locksStore[key] = {
    provider,
    model,
    lockedAt: now,
    expiresAt: now + lockMs,
    reason
  };

  persistToLocalStorage();
}

export function getPerformanceTier(
  lastResponseTimeMs: number | null,
  totalSuccesses: number
): { tier: PerformanceTier; isUntested: boolean } {
  if (lastResponseTimeMs === null || totalSuccesses < 1) {
    return { tier: 1, isUntested: true };
  }
  if (lastResponseTimeMs < 15000) {
    return { tier: 1, isUntested: false };
  }
  if (lastResponseTimeMs < 25000) {
    return { tier: 2, isUntested: false };
  }
  return { tier: 4, isUntested: false };
}

/**
 * Non-advancing candidate lookahead:
 * Peeks at the upcoming candidate without incrementing the global round-robin rotation index or exploration counter.
 */
export function peekNextCandidate(
  preferredProvider?: string,
  preferredModels?: string[],
  excludedKeys?: Set<string>
): { candidate: ModelCandidate; tier: PerformanceTier; isUntested: boolean; isExploratory: boolean; isAutoRouting: boolean } {
  let allCandidates = getAllRegisteredCandidates();
  const isAuto = !preferredProvider || preferredProvider === "auto";

  if (!isAuto) {
    allCandidates = allCandidates.filter(c => c.provider === preferredProvider);
  }

  let available = allCandidates.filter(cand => {
    const key = `${cand.provider}:${cand.model}`;
    const locked = isModelLocked(cand.provider, cand.model);
    const excluded = excludedKeys ? excludedKeys.has(key) : false;
    return !locked && !excluded;
  });

  if (preferredModels && preferredModels.length > 0) {
    const prefAvailable = available.filter(c => preferredModels.includes(c.model));
    if (prefAvailable.length > 0) {
      available = prefAvailable;
    }
  }

  // Anti-Deadlock Check
  if (available.length === 0) {
    const fallbackList = allCandidates.filter(c => !excludedKeys || !excludedKeys.has(`${c.provider}:${c.model}`));
    const finalCand = fallbackList.length > 0 ? fallbackList[0] : allCandidates[0];
    return {
      candidate: finalCand,
      tier: 1,
      isUntested: false,
      isExploratory: false,
      isAutoRouting: isAuto
    };
  }

  const tier1Probes: ModelCandidate[] = [];
  const tier1Tested: { cand: ModelCandidate; time: number }[] = [];
  const tier2: { cand: ModelCandidate; time: number }[] = [];
  const tier4: { cand: ModelCandidate; time: number }[] = [];

  for (const cand of available) {
    const key = `${cand.provider}:${cand.model}`;
    const m = metricsStore[key];
    const time = m?.lastResponseTimeMs ?? null;
    const successes = m?.totalSuccesses || 0;
    const { tier, isUntested } = getPerformanceTier(time, successes);

    if (isUntested) {
      tier1Probes.push(cand);
    } else if (tier === 1) {
      tier1Tested.push({ cand, time: time! });
    } else if (tier === 2) {
      tier2.push({ cand, time: time! });
    } else {
      tier4.push({ cand, time: time! });
    }
  }

  // Simulated exploration check (peek only)
  const isExplorationTurn = (explorationCounter + 1) % 12 === 0;
  if (isExplorationTurn && (tier2.length > 0 || tier4.length > 0)) {
    const explorePool = [...tier2.map(t => t.cand), ...tier4.map(t => t.cand)];
    const chosen = explorePool[rotationIndex % explorePool.length];
    return {
      candidate: chosen,
      tier: tier2.some(t => t.cand === chosen) ? 2 : 4,
      isUntested: false,
      isExploratory: true,
      isAutoRouting: isAuto
    };
  }

  if (tier1Probes.length > 0) {
    const chosen = tier1Probes[rotationIndex % tier1Probes.length];
    return {
      candidate: chosen,
      tier: 1,
      isUntested: true,
      isExploratory: false,
      isAutoRouting: isAuto
    };
  }

  if (tier1Tested.length > 0) {
    const chosen = tier1Tested[rotationIndex % tier1Tested.length].cand;
    return {
      candidate: chosen,
      tier: 1,
      isUntested: false,
      isExploratory: false,
      isAutoRouting: isAuto
    };
  }

  if (tier2.length > 0) {
    const chosen = tier2[rotationIndex % tier2.length].cand;
    return {
      candidate: chosen,
      tier: 2,
      isUntested: false,
      isExploratory: false,
      isAutoRouting: isAuto
    };
  }

  const chosen = tier4[rotationIndex % tier4.length].cand;
  return {
    candidate: chosen,
    tier: 4,
    isUntested: false,
    isExploratory: false,
    isAutoRouting: isAuto
  };
}

/**
 * Resolves candidate and increments rotation index.
 * Implements Anti-Deadlock Lockout Reset if all candidates are locked.
 */
export function getNextCandidate(
  preferredProvider?: string,
  preferredModels?: string[],
  excludedKeys?: Set<string>
): { candidate: ModelCandidate; tier: PerformanceTier; isUntested: boolean; isExploratory: boolean; isAutoRouting: boolean } {
  let allCandidates = getAllRegisteredCandidates();
  const isAuto = !preferredProvider || preferredProvider === "auto";

  if (!isAuto) {
    allCandidates = allCandidates.filter(c => c.provider === preferredProvider);
  }

  let available = allCandidates.filter(cand => {
    const key = `${cand.provider}:${cand.model}`;
    const locked = isModelLocked(cand.provider, cand.model);
    const excluded = excludedKeys ? excludedKeys.has(key) : false;
    return !locked && !excluded;
  });

  if (preferredModels && preferredModels.length > 0) {
    const prefAvailable = available.filter(c => preferredModels.includes(c.model));
    if (prefAvailable.length > 0) {
      available = prefAvailable;
    }
  }

  // Anti-Deadlock Lockout Reset: If widespread outages locked all candidates, purge all active locks
  if (available.length === 0) {
    console.warn("[CircuitBreaker] Anti-deadlock triggered: all candidates were locked. Purging all active locks to restore system availability.");
    clearAllLocks();
    available = allCandidates.filter(c => !excludedKeys || !excludedKeys.has(`${c.provider}:${c.model}`));
    if (available.length === 0) {
      available = allCandidates;
    }
  }

  const tier1Probes: ModelCandidate[] = [];
  const tier1Tested: { cand: ModelCandidate; time: number }[] = [];
  const tier2: { cand: ModelCandidate; time: number }[] = [];
  const tier4: { cand: ModelCandidate; time: number }[] = [];

  for (const cand of available) {
    const key = `${cand.provider}:${cand.model}`;
    const m = metricsStore[key];
    const time = m?.lastResponseTimeMs ?? null;
    const successes = m?.totalSuccesses || 0;
    const { tier, isUntested } = getPerformanceTier(time, successes);

    if (isUntested) {
      tier1Probes.push(cand);
    } else if (tier === 1) {
      tier1Tested.push({ cand, time: time! });
    } else if (tier === 2) {
      tier2.push({ cand, time: time! });
    } else {
      tier4.push({ cand, time: time! });
    }
  }

  // 1. ε-Greedy Exploration (every 12th call)
  explorationCounter++;
  const isExplorationTurn = explorationCounter % 12 === 0;
  if (isExplorationTurn && (tier2.length > 0 || tier4.length > 0)) {
    const explorePool = [...tier2.map(t => t.cand), ...tier4.map(t => t.cand)];
    const chosen = explorePool[rotationIndex % explorePool.length];
    rotationIndex++;
    return {
      candidate: chosen,
      tier: tier2.some(t => t.cand === chosen) ? 2 : 4,
      isUntested: false,
      isExploratory: true,
      isAutoRouting: isAuto
    };
  }

  // 2. Untested Probes
  if (tier1Probes.length > 0) {
    const chosen = tier1Probes[rotationIndex % tier1Probes.length];
    rotationIndex++;
    return {
      candidate: chosen,
      tier: 1,
      isUntested: true,
      isExploratory: false,
      isAutoRouting: isAuto
    };
  }

  // 3. Regular Tier 1 Fast
  if (tier1Tested.length > 0) {
    const chosen = tier1Tested[rotationIndex % tier1Tested.length].cand;
    rotationIndex++;
    return {
      candidate: chosen,
      tier: 1,
      isUntested: false,
      isExploratory: false,
      isAutoRouting: isAuto
    };
  }

  // 4. Tier 2 Medium
  if (tier2.length > 0) {
    const chosen = tier2[rotationIndex % tier2.length].cand;
    rotationIndex++;
    return {
      candidate: chosen,
      tier: 2,
      isUntested: false,
      isExploratory: false,
      isAutoRouting: isAuto
    };
  }

  // 5. Tier 4 Demoted
  const chosen = tier4[rotationIndex % tier4.length].cand;
  rotationIndex++;
  return {
    candidate: chosen,
    tier: 4,
    isUntested: false,
    isExploratory: false,
    isAutoRouting: isAuto
  };
}

// Error Classification
export type ErrorCategory =
  | "INVALID_KEY"
  | "PERMISSION_DENIED"
  | "LOCATION_UNSUPPORTED"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

export function classifyHttpError(statusCode: number, errorText = ""): { category: ErrorCategory; retryable: boolean } {
  const lower = errorText.toLowerCase();
  if (statusCode === 401) {
    return { category: "INVALID_KEY", retryable: false };
  }
  if (statusCode === 403) {
    return { category: "PERMISSION_DENIED", retryable: false };
  }
  if (statusCode === 400) {
    if (lower.includes("location") || lower.includes("country") || lower.includes("region") || lower.includes("unsupported")) {
      return { category: "LOCATION_UNSUPPORTED", retryable: false };
    }
  }
  if (statusCode === 404) {
    return { category: "NOT_FOUND", retryable: false };
  }
  if (statusCode === 429) {
    return { category: "RATE_LIMIT", retryable: true };
  }
  if ([500, 502, 503, 504].includes(statusCode)) {
    return { category: "SERVER_ERROR", retryable: true };
  }
  if (statusCode === 422) {
    return { category: "INVALID_RESPONSE", retryable: true };
  }
  return { category: "SERVER_ERROR", retryable: statusCode >= 500 };
}

/**
 * Exponential backoff with random jitter formulation:
 * t_delay = min(t_max, t_initial * 2^(attempt - 1)) + rand(0, jitter_max)
 */
export function calculateBackoffDelay(attempt: number, initialMs = 1000, maxMs = 4000, jitterMaxMs = 200): number {
  const exponential = initialMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * jitterMaxMs;
  return Math.min(maxMs, exponential) + jitter;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException("Aborted", "AbortError"));
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function hasAdvancedParameters(payload: ChatCompletionPayload): boolean {
  return Boolean(payload.response_format || (payload as any).reasoning_effort || (payload as any).thinking);
}

function sanitizeAdvancedParameters(payload: ChatCompletionPayload): ChatCompletionPayload {
  const copy = { ...payload };
  delete copy.response_format;
  delete (copy as any).reasoning_effort;
  delete (copy as any).thinking;
  return copy;
}

/**
 * Dispatches a single HTTP request to the candidate model with Tier 1 transport resilience:
 * - Exponential backoff with jitter on 429 / 5xx
 * - Protocol self-healing: parameter stripping on HTTP 400 / schema rejections
 * - Full AbortSignal support
 */
export async function executeUpstreamCall(
  candidate: ModelCandidate,
  payload: ChatCompletionPayload,
  timeoutMs: number,
  accessKey?: string,
  userAbortSignal?: AbortSignal
): Promise<Response> {
  const cleanWorkerUrl = candidate.workerUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  // MANDATORY HEADER: X-Proxy-Key
  if (accessKey) {
    headers["X-Proxy-Key"] = accessKey;
  }

  if (candidate.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://workers.cloudflare.com";
    headers["X-Title"] = "Cloudflare LLM Edge Router";
  }

  const isGeminiNative = candidate.provider === "gemini";
  let activePayload = { ...payload };

  const maxTransportRetries = 0; // Immediate failure surfacing to trigger retry countdown banner
  let transportAttempt = 0;

  while (transportAttempt <= maxTransportRetries) {
    transportAttempt++;

    if (userAbortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort("Timeout"), timeoutMs);

    const onUserAbort = () => controller.abort(userAbortSignal?.reason || "User aborted");
    userAbortSignal?.addEventListener("abort", onUserAbort, { once: true });

    try {
      let response: Response;

      if (isGeminiNative) {
        const url = `${cleanWorkerUrl}/models/${candidate.model}:generateContent`;
        if (accessKey) {
          headers["x-goog-api-key"] = accessKey;
        }

        let systemInstructionText = "";
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

        for (const m of activePayload.messages) {
          if (m.role === "system") {
            systemInstructionText += (systemInstructionText ? "\n" : "") + m.content;
          } else {
            contents.push({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }]
            });
          }
        }

        const geminiPayload: any = {
          contents,
          generationConfig: {
            temperature: activePayload.temperature ?? 0.7,
            maxOutputTokens: activePayload.max_tokens
          }
        };

        if (systemInstructionText) {
          geminiPayload.systemInstruction = {
            parts: [{ text: systemInstructionText }]
          };
        }

        if (activePayload.response_format?.type === "json_object") {
          geminiPayload.generationConfig.responseMimeType = "application/json";
        }

        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(geminiPayload),
          signal: controller.signal
        });

        // Protocol Self-Healing (Parameter Stripping)
        if (!response.ok && response.status === 400 && hasAdvancedParameters(activePayload)) {
          const errBody = await response.clone().text().catch(() => "");
          if (errBody.includes("responseMimeType") || errBody.includes("schema") || response.status === 400) {
            activePayload = sanitizeAdvancedParameters(activePayload);
            delete geminiPayload.generationConfig.responseMimeType;
            response = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify(geminiPayload),
              signal: controller.signal
            });
          }
        }

        if (!response.ok) {
          // Check retryability
          const errBody = await response.clone().text().catch(() => "");
          const { retryable } = classifyHttpError(response.status, errBody);
          if (retryable && transportAttempt <= maxTransportRetries) {
            const delayMs = calculateBackoffDelay(transportAttempt);
            await delay(delayMs, userAbortSignal);
            continue;
          }
          return response;
        }

        const geminiData: any = await response.json();
        const outputText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

        const openAiResponse = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: candidate.model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: outputText },
              finish_reason: "stop"
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
          headers: { "Content-Type": "application/json" }
        });

      } else {
        // OpenAI-compatible Chat Completions
        const url = cleanWorkerUrl.endsWith("/chat/completions")
          ? cleanWorkerUrl
          : `${cleanWorkerUrl}/chat/completions`;

        const upstreamBody: any = {
          model: candidate.model,
          messages: activePayload.messages,
          temperature: activePayload.temperature ?? 0.7,
          max_tokens: activePayload.max_tokens,
          stream: activePayload.stream ?? false,
          response_format: activePayload.response_format
        };

        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(upstreamBody),
          signal: controller.signal
        });

        // Protocol Self-Healing (Parameter Stripping)
        if (!response.ok && response.status === 400 && hasAdvancedParameters(activePayload)) {
          const errBody = await response.clone().text().catch(() => "");
          if (errBody.includes("response_format") || errBody.includes("schema") || response.status === 400) {
            activePayload = sanitizeAdvancedParameters(activePayload);
            delete upstreamBody.response_format;
            response = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify(upstreamBody),
              signal: controller.signal
            });
          }
        }

        if (!response.ok) {
          const errBody = await response.clone().text().catch(() => "");
          const { retryable } = classifyHttpError(response.status, errBody);
          if (retryable && transportAttempt <= maxTransportRetries) {
            const delayMs = calculateBackoffDelay(transportAttempt);
            await delay(delayMs, userAbortSignal);
            continue;
          }
          return response;
        }

        return response;
      }
    } catch (err: any) {
      if (userAbortSignal?.aborted || err.name === "AbortError") {
        throw err;
      }
      if (transportAttempt <= maxTransportRetries) {
        const delayMs = calculateBackoffDelay(transportAttempt);
        await delay(delayMs, userAbortSignal);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
      userAbortSignal?.removeEventListener("abort", onUserAbort);
    }
  }

  throw new Error(`Transport-level request failed for ${candidate.provider}/${candidate.model}`);
}

export interface ChatCompletionOptions {
  accessKey?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  action?: string;
  requestId?: string;
  maxRetries?: number;
}

/**
 * Executes a chat completion through the intelligent rotation & circuit-breaker engine
 * with up to 4 candidate retries across operational models, publishing lifecycle events
 * to the pre-flight event bus.
 */
export async function executeChatCompletionWithRotation(
  payload: ChatCompletionPayload,
  accessKeyOrOptions?: string | ChatCompletionOptions,
  timeoutMsInput = 30000
): Promise<{
  content: string;
  response: any;
  provider: string;
  model: string;
  tier: number;
  durationMs: number;
  attempts: number;
}> {
  let accessKey: string | undefined;
  let timeoutMs = timeoutMsInput;
  let abortSignal: AbortSignal | undefined;
  let action: string | undefined;
  let requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  let maxRetries = 1; // Default to 1: surface errors immediately to show countdown banner instead of silently retrying internally

  if (typeof accessKeyOrOptions === "object" && accessKeyOrOptions !== null) {
    accessKey = accessKeyOrOptions.accessKey;
    timeoutMs = accessKeyOrOptions.timeoutMs ?? timeoutMsInput;
    abortSignal = accessKeyOrOptions.abortSignal;
    action = accessKeyOrOptions.action;
    if (accessKeyOrOptions.requestId) {
      requestId = accessKeyOrOptions.requestId;
    }
    if (accessKeyOrOptions.maxRetries !== undefined) {
      maxRetries = accessKeyOrOptions.maxRetries;
    }
  } else {
    accessKey = accessKeyOrOptions;
  }

  if (!accessKey && typeof process !== "undefined" && process.env) {
    accessKey =
      process.env.ACCESS_KEY ||
      process.env.ACESS_KEY ||
      undefined;
  }

  const excludedKeys = new Set<string>();
  let attempt = 0;
  let lastErrorReason = "Unknown error";
  let lastCandidate: ModelCandidate | null = null;

  while (attempt < maxRetries) {
    if (abortSignal?.aborted) {
      llmEventBus.emitEnd({
        requestId,
        provider: "user-cancelled",
        model: "aborted",
        durationMs: 0,
        status: "aborted",
        errorReason: "User cancelled request",
        action
      });
      throw new DOMException("The user aborted a request.", "AbortError");
    }

    attempt++;
    const routing = getNextCandidate(
      payload.preferred_provider,
      payload.preferred_models,
      excludedKeys
    );

    const candidate = routing.candidate;
    lastCandidate = candidate;
    const candidateKey = `${candidate.provider}:${candidate.model}`;
    const startTime = Date.now();
    const expectedDurationMs = getExpectedResponseTimeMs(candidate.provider, candidate.model);

    // Pre-flight Event Notification: Publish start event for active or newly switched candidate
    llmEventBus.emitStart({
      requestId,
      provider: candidate.provider,
      model: candidate.model,
      timestamp: startTime,
      expectedDurationMs,
      isAutoRouting: routing.isAutoRouting,
      action
    });

    try {
      const upstreamRes = await executeUpstreamCall(candidate, payload, timeoutMs, accessKey, abortSignal);
      const durationMs = Date.now() - startTime;

      if (upstreamRes.ok) {
        recordSuccess(candidate.provider, candidate.model, durationMs);
        const data: any = await upstreamRes.json();
        const content = data.choices?.[0]?.message?.content || "";

        llmEventBus.emitEnd({
          requestId,
          provider: candidate.provider,
          model: candidate.model,
          durationMs,
          status: "success",
          action
        });

        return {
          content,
          response: data,
          provider: candidate.provider,
          model: candidate.model,
          tier: routing.tier,
          durationMs,
          attempts: attempt
        };
      }

      const errStatus = upstreamRes.status;
      const errBody = await upstreamRes.text().catch(() => "No error body");
      lastErrorReason = `HTTP ${errStatus}: ${errBody.slice(0, 150)}`;
      recordFailure(candidate.provider, candidate.model, lastErrorReason);
      excludedKeys.add(candidateKey);

    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      if (abortSignal?.aborted || err.name === "AbortError") {
        llmEventBus.emitEnd({
          requestId,
          provider: candidate.provider,
          model: candidate.model,
          durationMs,
          status: "aborted",
          errorReason: "User aborted",
          action
        });
        throw err;
      }

      lastErrorReason = err.message || "Network error";
      recordFailure(candidate.provider, candidate.model, lastErrorReason);
      excludedKeys.add(candidateKey);
    }
  }

  const failedModelName = lastCandidate ? `${lastCandidate.provider}/${lastCandidate.model}` : undefined;
  llmEventBus.emitEnd({
    requestId,
    provider: lastCandidate?.provider || "all-candidates",
    model: lastCandidate?.model || "failed",
    durationMs: 0,
    status: "error",
    errorReason: lastErrorReason,
    action
  });

  const modelErr: any = new Error(
    failedModelName
      ? `Lỗi kết nối mô hình ${failedModelName}: ${lastErrorReason}`
      : `Lỗi kết nối mô hình AI: ${lastErrorReason}`
  );
  modelErr.failedModel = failedModelName;
  modelErr.provider = lastCandidate?.provider;
  modelErr.model = lastCandidate?.model;
  modelErr.lastErrorReason = lastErrorReason;
  modelErr.attempts = attempt;
  throw modelErr;
}
