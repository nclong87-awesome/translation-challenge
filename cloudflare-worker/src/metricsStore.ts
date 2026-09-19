import { Env, ExecutionContextLike, ModelMetricsRecord, LockedModelInfo, RequestOutcomeEntry, FailureLogEntry } from './types';
import { calculateLockDuration, FIVE_DAYS_MS } from './circuitBreaker';

const KV_METRICS_KEY = 'llm_metrics_state_v1';
const KV_LOCKS_KEY = 'llm_locked_models_v1';

// In-Memory L1 Cache
let inMemoryMetrics: Record<string, ModelMetricsRecord> = {};
let inMemoryLocks: Record<string, LockedModelInfo> = {};
let isHydrated = false;

export async function hydrateState(env: Env): Promise<void> {
  if (isHydrated) return;
  try {
    if (env.LLM_STATE_KV) {
      const [rawMetrics, rawLocks] = await Promise.all([
        env.LLM_STATE_KV.get(KV_METRICS_KEY, 'json'),
        env.LLM_STATE_KV.get(KV_LOCKS_KEY, 'json')
      ]);

      if (rawMetrics && typeof rawMetrics === 'object') {
        inMemoryMetrics = rawMetrics as Record<string, ModelMetricsRecord>;
      }
      if (rawLocks && typeof rawLocks === 'object') {
        inMemoryLocks = rawLocks as Record<string, LockedModelInfo>;
      }
    }
    isHydrated = true;
  } catch (err) {
    console.warn('[State] Cold-start hydration fallback to memory:', err);
    isHydrated = true;
  }
}

export function persistStateAsync(env: Env, ctx?: ExecutionContextLike): void {
  const persistTask = async () => {
    try {
      if (env.LLM_STATE_KV) {
        await Promise.all([
          env.LLM_STATE_KV.put(KV_METRICS_KEY, JSON.stringify(inMemoryMetrics)),
          env.LLM_STATE_KV.put(KV_LOCKS_KEY, JSON.stringify(inMemoryLocks))
        ]);
      }
    } catch (err) {
      console.error('[State] Failed to persist state to KV:', err);
    }
  };

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(persistTask());
  } else {
    persistTask().catch((err) => console.error('[State] Async persist error:', err));
  }
}

export function getMetrics(key: string): ModelMetricsRecord | undefined {
  return inMemoryMetrics[key];
}

export function getAllMetrics(): Record<string, ModelMetricsRecord> {
  return { ...inMemoryMetrics };
}

export function isModelLocked(provider: string, model: string): boolean {
  const key = `${provider}:${model}`;
  const lock = inMemoryLocks[key];
  if (!lock) return false;
  if (lock.expiresAt <= Date.now()) {
    delete inMemoryLocks[key];
    return false;
  }
  return true;
}

export function getAllLocks(): Record<string, LockedModelInfo> {
  const now = Date.now();
  const active: Record<string, LockedModelInfo> = {};
  for (const [k, v] of Object.entries(inMemoryLocks)) {
    if (v.expiresAt > now) {
      active[k] = v;
    }
  }
  return active;
}

export function recordSuccess(
  provider: string,
  model: string,
  durationMs: number,
  env: Env,
  ctx?: ExecutionContextLike
): void {
  const key = `${provider}:${model}`;
  delete inMemoryLocks[key]; // Unlock if previously locked

  const existing = inMemoryMetrics[key];
  const prevCalls = existing?.totalCalls || 0;
  const prevSuccesses = existing?.totalSuccesses || 0;
  const validDuration = Math.max(1, Math.round(durationMs));

  const prevOutcomes = existing?.recentOutcomes || [];
  const newOutcome: RequestOutcomeEntry = {
    success: true,
    durationMs: validDuration,
    timestamp: Date.now()
  };

  const updatedOutcomes = [...prevOutcomes, newOutcome].slice(-50);
  const successDurations = updatedOutcomes
    .filter(o => o.success && typeof o.durationMs === 'number')
    .map(o => o.durationMs as number);

  const avgLatency = successDurations.length > 0
    ? Math.round(successDurations.reduce((sum, d) => sum + d, 0) / successDurations.length)
    : validDuration;

  inMemoryMetrics[key] = {
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

  persistStateAsync(env, ctx);
}

export function recordFailure(
  provider: string,
  model: string,
  reason: string,
  env: Env,
  ctx?: ExecutionContextLike
): void {
  const key = `${provider}:${model}`;
  const now = Date.now();
  const existing = inMemoryMetrics[key];

  const prevCalls = existing?.totalCalls || 0;
  const prevSuccesses = existing?.totalSuccesses || 0;

  const newLog: FailureLogEntry = {
    id: `${now}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: now,
    reason
  };

  const fiveDaysAgo = now - FIVE_DAYS_MS;
  const existingLogs = existing?.failureLogs || [];
  const updatedLogs = [newLog, ...existingLogs].filter(l => l.timestamp >= fiveDaysAgo).slice(0, 50);

  const prevOutcomes = existing?.recentOutcomes || [];
  const updatedOutcomes = [...prevOutcomes, { success: false, timestamp: now }].slice(-50);

  inMemoryMetrics[key] = {
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

  // Lock model dynamically
  const lockMs = calculateLockDuration(inMemoryMetrics[key], reason);
  inMemoryLocks[key] = {
    provider,
    model,
    lockedAt: now,
    expiresAt: now + lockMs,
    reason
  };

  persistStateAsync(env, ctx);
}

export function unlockModel(provider: string, model: string, env: Env, ctx?: ExecutionContextLike): void {
  const key = `${provider}:${model}`;
  delete inMemoryLocks[key];
  persistStateAsync(env, ctx);
}

export function clearAllLocks(env: Env, ctx?: ExecutionContextLike): void {
  inMemoryLocks = {};
  persistStateAsync(env, ctx);
}
