import { ModelCandidate, PerformanceTier } from './types';
import { getAllRegisteredCandidates } from './registry';
import { getMetrics, isModelLocked } from './metricsStore';

let globalRotationIndex = 0;
let explorationCounter = 0;

export interface RoutingDecision {
  candidate: ModelCandidate;
  tier: PerformanceTier;
  isUntested: boolean;
  isExploratory: boolean;
}

/**
 * Evaluates performance tier based on latency and success history.
 */
export function getPerformanceTier(
  lastResponseTimeMs: number | null,
  totalSuccesses: number
): { tier: PerformanceTier; isUntested: boolean } {
  // Untested models (0 successes or null time) -> Tier 1 Probe Queue
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
 * Selects the next optimal model candidate enforcing:
 * 1. Untested Probe prioritization in Tier 1.
 * 2. Fair interleaved round-robin across tested Tier 1 models.
 * 3. ε-Greedy exploration every 12th call to re-evaluate Tier 2 and Tier 4.
 * 4. Exclusion list for instant in-flight failover cascading.
 */
export function getNextCandidate(
  preferredProvider?: string,
  preferredModels?: string[],
  excludedKeys?: Set<string>
): RoutingDecision {
  let allCandidates = getAllRegisteredCandidates();

  if (preferredProvider) {
    allCandidates = allCandidates.filter(c => c.provider === preferredProvider);
  }

  // Filter out currently locked models and candidates already attempted in this request
  let available = allCandidates.filter(cand => {
    const key = `${cand.provider}:${cand.model}`;
    const locked = isModelLocked(cand.provider, cand.model);
    const excluded = excludedKeys ? excludedKeys.has(key) : false;
    return !locked && !excluded;
  });

  // Apply preferred models prioritization if supplied
  if (preferredModels && preferredModels.length > 0) {
    const prefAvailable = available.filter(c => preferredModels.includes(c.model));
    if (prefAvailable.length > 0) {
      available = prefAvailable;
    }
  }

  // All candidates locked / exhausted fallback
  if (available.length === 0) {
    const fallbackList = allCandidates.filter(c => !excludedKeys || !excludedKeys.has(`${c.provider}:${c.model}`));
    const finalCand = fallbackList.length > 0 ? fallbackList[0] : allCandidates[0];
    return {
      candidate: finalCand,
      tier: 1,
      isUntested: false,
      isExploratory: false
    };
  }

  // Partition candidates into performance tiers
  const tier1Probes: ModelCandidate[] = [];
  const tier1Tested: { cand: ModelCandidate; time: number }[] = [];
  const tier2: { cand: ModelCandidate; time: number }[] = [];
  const tier4: { cand: ModelCandidate; time: number }[] = [];

  for (const cand of available) {
    const key = `${cand.provider}:${cand.model}`;
    const m = getMetrics(key);
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

  // 1. Check ε-Greedy Exploration Sampling (Every 12th call)
  explorationCounter++;
  const isExplorationTurn = explorationCounter % 12 === 0;
  if (isExplorationTurn && (tier2.length > 0 || tier4.length > 0)) {
    const explorePool = [...tier2.map(t => t.cand), ...tier4.map(t => t.cand)];
    const chosen = explorePool[globalRotationIndex % explorePool.length];
    globalRotationIndex++;
    return {
      candidate: chosen,
      tier: tier2.some(t => t.cand === chosen) ? 2 : 4,
      isUntested: false,
      isExploratory: true
    };
  }

  // 2. Sample Untested Probes (Fair round-robin)
  if (tier1Probes.length > 0) {
    const chosen = tier1Probes[globalRotationIndex % tier1Probes.length];
    globalRotationIndex++;
    return {
      candidate: chosen,
      tier: 1,
      isUntested: true,
      isExploratory: false
    };
  }

  // 3. Regular Tier 1 High-Speed Pool
  if (tier1Tested.length > 0) {
    const chosen = tier1Tested[globalRotationIndex % tier1Tested.length].cand;
    globalRotationIndex++;
    return {
      candidate: chosen,
      tier: 1,
      isUntested: false,
      isExploratory: false
    };
  }

  // 4. Fallback to Tier 2 (Medium)
  if (tier2.length > 0) {
    const chosen = tier2[globalRotationIndex % tier2.length].cand;
    globalRotationIndex++;
    return {
      candidate: chosen,
      tier: 2,
      isUntested: false,
      isExploratory: false
    };
  }

  // 5. Fallback to Tier 4 (Slow/Demoted)
  const chosen = tier4[globalRotationIndex % tier4.length].cand;
  globalRotationIndex++;
  return {
    candidate: chosen,
    tier: 4,
    isUntested: false,
    isExploratory: false
  };
}
