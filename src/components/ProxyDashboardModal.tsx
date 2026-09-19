import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Activity,
  ShieldAlert,
  Unlock,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  RotateCcw
} from "lucide-react";
import { fetchGatewayStatus, unlockGatewayModel } from "../services/llmClientService";
import { GatewayStatusResponse, LockedModelInfo, ModelMetricsRecord } from "../types";
import { getAllRegisteredCandidates } from "../services/llmProxyEngine";

interface ProxyDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProxyDashboardModal: React.FC<ProxyDashboardModalProps> = ({
  isOpen,
  onClose
}) => {
  const [data, setData] = useState<GatewayStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const status = await fetchGatewayStatus();
      setData(status);
    } catch (err) {
      console.error("Failed to load gateway status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      const interval = setInterval(loadStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, loadStatus]);

  if (!isOpen) return null;

  const candidates = getAllRegisteredCandidates();
  const metrics: Record<string, ModelMetricsRecord> = data?.metrics || {};
  const locks: Record<string, LockedModelInfo> = data?.lockedModels || {};
  const lockedCount = Object.keys(locks).length;

  const handleUnlockSingle = async (provider: string, model: string) => {
    const success = await unlockGatewayModel(provider, model);
    if (success) {
      setActionMessage(`Model ${provider}/${model} unlocked!`);
      setTimeout(() => setActionMessage(null), 3000);
      loadStatus();
    }
  };

  const handleUnlockAll = async () => {
    const success = await unlockGatewayModel(undefined, undefined, true);
    if (success) {
      setActionMessage("All circuit breaker locks cleared!");
      setTimeout(() => setActionMessage(null), 3000);
      loadStatus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2">
                Cloudflare LLM Proxy Dashboard
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                  Live Edge Health
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Multi-tier performance routing & adaptive circuit-breaker status
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadStatus}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-white/60 dark:hover:bg-slate-700 transition"
              title="Refresh metrics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-orange-500" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-white/60 dark:hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Notice */}
        {actionMessage && (
          <div className="bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 px-5 py-2 text-xs font-semibold flex items-center gap-2 border-b border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            {actionMessage}
          </div>
        )}

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-4 gap-3 p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Registered</div>
            <div className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1">{candidates.length}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Across 6 providers</div>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active & Available</div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {Math.max(0, candidates.length - lockedCount)}
            </div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">Ready for dispatch</div>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Circuit Locked</div>
            <div className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{lockedCount}</div>
            <div className="text-[11px] text-red-500/80 mt-0.5">Dynamic lock 1h - 96h</div>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Circuit Breaker</div>
            <button
              onClick={handleUnlockAll}
              disabled={lockedCount === 0}
              className="mt-2 text-xs font-semibold py-1 px-2.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/60 dark:hover:bg-red-900/60 dark:text-red-300 border border-red-200 dark:border-red-800 flex items-center justify-center gap-1.5 transition disabled:opacity-40"
            >
              <RotateCcw className="w-3 h-3" />
              Reset All Locks
            </button>
          </div>
        </div>

        {/* Model Candidates Table */}
        <div className="p-5 overflow-y-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase tracking-wider font-semibold">
                <th className="pb-3 pl-2">Provider</th>
                <th className="pb-3">Model Candidate</th>
                <th className="pb-3">Routing Tier</th>
                <th className="pb-3">Avg Latency</th>
                <th className="pb-3">Calls / Success</th>
                <th className="pb-3">Circuit Status</th>
                <th className="pb-3 text-right pr-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {candidates.map((cand) => {
                const key = `${cand.provider}:${cand.model}`;
                const m = metrics[key];
                const lock = locks[key];
                const isLocked = Boolean(lock && lock.expiresAt > Date.now());

                const latency = m?.avgResponseTimeMs || m?.lastResponseTimeMs;
                const calls = m?.totalCalls || 0;
                const successes = m?.totalSuccesses || 0;

                let tierLabel = "Tier 1 (Probe)";
                let tierBadgeClass = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800";

                if (calls > 0 && latency !== null && latency !== undefined) {
                  if (latency < 15000) {
                    tierLabel = "Tier 1 (<15s Fast)";
                    tierBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800";
                  } else if (latency < 25000) {
                    tierLabel = "Tier 2 (15-25s)";
                    tierBadgeClass = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800";
                  } else {
                    tierLabel = "Tier 4 (Slow)";
                    tierBadgeClass = "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800";
                  }
                }

                // Format remaining lock time
                let lockRemainingStr = "";
                if (isLocked && lock) {
                  const remMs = lock.expiresAt - Date.now();
                  const remHrs = Math.floor(remMs / (3600 * 1000));
                  const remMins = Math.floor((remMs % (3600 * 1000)) / 60000);
                  lockRemainingStr = `${remHrs}h ${remMins}m`;
                }

                return (
                  <tr
                    key={key}
                    className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition ${
                      isLocked ? "bg-red-50/20 dark:bg-red-950/10" : ""
                    }`}
                  >
                    <td className="py-3 pl-2 font-semibold text-slate-800 dark:text-slate-200 capitalize">
                      {cand.provider}
                    </td>
                    <td className="py-3 font-mono text-slate-700 dark:text-slate-300">
                      {cand.model}
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${tierBadgeClass}`}>
                        {tierLabel}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-slate-600 dark:text-slate-400">
                      {latency ? `${(latency / 1000).toFixed(2)}s` : "—"}
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-400">
                      {calls > 0 ? `${calls} / ${successes}` : "0 / 0"}
                    </td>
                    <td className="py-3">
                      {isLocked ? (
                        <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                          <span>Locked ({lockRemainingStr})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right pr-2">
                      {isLocked ? (
                        <button
                          onClick={() => handleUnlockSingle(cand.provider, cand.model)}
                          className="px-2 py-1 rounded bg-orange-50 hover:bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800 text-[11px] font-semibold inline-flex items-center gap-1 transition"
                        >
                          <Unlock className="w-3 h-3" />
                          Unlock
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Ready</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-orange-500" />
              ε-Greedy active (1 in 12 continuous exploration)
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              Recency decay: 120-hour window
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
