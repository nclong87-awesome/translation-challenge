import { ModelMetricsRecord } from './types';

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;
export const FIVE_DAYS_MS = 5 * ONE_DAY_MS;
export const MAX_LOCK_MS = 4 * ONE_DAY_MS; // 96 hours (4 days, strictly < 5 days)

/**
 * Counts consecutive failed requests at the tail of recent outcomes.
 */
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
 * Calculates optimal circuit-breaker lockout based on consecutive failures,
 * 5-day recency decay, historical reliability, and latency penalties.
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
    if (isCurrentlyFailing && ageMs < 2000) continue; // Skip active error if logged

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

  // 4. Historical Reliability Multiplier (for >= 3 calls)
  let reliabilityMultiplier = 1.0;
  if (totalCalls >= 3) {
    const successRate = totalSuccesses / totalCalls;
    if (successRate >= 0.9 && consecutive <= 1) {
      reliabilityMultiplier = 0.5; // High reliability bonus
    } else if (successRate < 0.5) {
      reliabilityMultiplier = 2.0; // Severe unreliability penalty
    } else if (successRate < 0.75) {
      reliabilityMultiplier = 1.5;
    }
  }

  const finalDuration = accumulatedBase * latencyMultiplier * reliabilityMultiplier;
  return Math.max(ONE_HOUR_MS, Math.min(MAX_LOCK_MS, Math.round(finalDuration)));
}
