import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Activity,
  ShieldAlert,
  Unlock,
  RefreshCw,
  Clock,
  CheckCircle2,
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

  // Load status once when modal opens. Do NOT auto-poll (no setInterval as requested).
  useEffect(() => {
    if (isOpen) {
      loadStatus();
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
      setActionMessage(`Đã mở khóa model ${provider}/${model}!`);
      setTimeout(() => setActionMessage(null), 3000);
      loadStatus();
    }
  };

  const handleUnlockAll = async () => {
    const success = await unlockGatewayModel(undefined, undefined, true);
    if (success) {
      setActionMessage("Đã đặt lại toàn bộ khóa circuit breaker!");
      setTimeout(() => setActionMessage(null), 3000);
      loadStatus();
    }
  };

  return (
    <div
      id="proxy-dashboard-overlay"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        id="proxy-dashboard-container"
        className="w-full max-w-4xl bg-white sm:rounded-3xl h-full sm:h-[90vh] flex flex-col shadow-2xl overflow-hidden border-0 sm:border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-white shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-2xs shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-stone-900 truncate">
                  Cloudflare LLM Proxy Dashboard
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md shrink-0">
                  Live Edge Health
                </span>
              </div>
              <p className="text-xs text-stone-500 truncate">
                Multi-tier performance routing & adaptive circuit-breaker status
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadStatus}
              disabled={loading}
              title="Làm mới trạng thái"
              className="min-w-[36px] min-h-[36px] rounded-xl border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-100 flex items-center justify-center transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
            </button>
            <button
              onClick={onClose}
              title="Đóng"
              className="min-w-[40px] min-h-[40px] rounded-xl border border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-stone-100 flex items-center justify-center active:scale-95 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Notice */}
        {actionMessage && (
          <div className="bg-emerald-50 text-emerald-800 px-5 py-2.5 text-xs font-semibold flex items-center gap-2 border-b border-emerald-200 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {actionMessage}
          </div>
        )}

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-5 border-b border-stone-200 bg-stone-50 shrink-0">
          <div className="p-3.5 bg-white rounded-2xl border border-stone-200 shadow-2xs">
            <div className="text-xs text-stone-500 font-medium">Đã đăng ký</div>
            <div className="text-xl font-bold text-stone-900 mt-1">{candidates.length}</div>
            <div className="text-[11px] text-stone-400 mt-0.5">Across 6 providers</div>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-stone-200 shadow-2xs">
            <div className="text-xs text-stone-500 font-medium">Khả dụng & Hoạt động</div>
            <div className="text-xl font-bold text-emerald-600 mt-1">
              {Math.max(0, candidates.length - lockedCount)}
            </div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">Sẵn sàng điều phối</div>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-stone-200 shadow-2xs">
            <div className="text-xs text-stone-500 font-medium">Đang bị Khóa (Circuit)</div>
            <div className="text-xl font-bold text-red-600 mt-1">{lockedCount}</div>
            <div className="text-[11px] text-red-500 mt-0.5">Khóa tự động 1h - 96h</div>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-stone-200 shadow-2xs flex flex-col justify-between">
            <div className="text-xs text-stone-500 font-medium">Circuit Breaker</div>
            <button
              onClick={handleUnlockAll}
              disabled={lockedCount === 0}
              className="mt-2 text-xs font-semibold py-1.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 flex items-center justify-center gap-1.5 transition disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Đặt lại tất cả khóa
            </button>
          </div>
        </div>

        {/* Model Candidates Table */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 pl-3">Provider</th>
                  <th className="py-2.5">Model Candidate</th>
                  <th className="py-2.5">Routing Tier</th>
                  <th className="py-2.5">Latency TB</th>
                  <th className="py-2.5">Calls / Thành công</th>
                  <th className="py-2.5">Trạng thái</th>
                  <th className="py-2.5 text-right pr-3">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {candidates.map((cand) => {
                  const key = `${cand.provider}:${cand.model}`;
                  const m = metrics[key];
                  const lock = locks[key];
                  const isLocked = Boolean(lock && lock.expiresAt > Date.now());

                  const latency = m?.avgResponseTimeMs || m?.lastResponseTimeMs;
                  const calls = m?.totalCalls || 0;
                  const successes = m?.totalSuccesses || 0;

                  let tierLabel = "Tier 1 (Probe)";
                  let tierBadgeClass = "bg-blue-50 text-blue-700 border-blue-200";

                  if (calls > 0 && latency !== null && latency !== undefined) {
                    if (latency < 15000) {
                      tierLabel = "Tier 1 (<15s Nhanh)";
                      tierBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    } else if (latency < 25000) {
                      tierLabel = "Tier 2 (15-25s)";
                      tierBadgeClass = "bg-amber-50 text-amber-700 border-amber-200";
                    } else {
                      tierLabel = "Tier 4 (Chậm)";
                      tierBadgeClass = "bg-purple-50 text-purple-700 border-purple-200";
                    }
                  }

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
                      className={`hover:bg-stone-50 transition ${
                        isLocked ? "bg-red-50/30" : ""
                      }`}
                    >
                      <td className="py-3.5 pl-3 font-semibold text-stone-900 capitalize">
                        {cand.provider}
                      </td>
                      <td className="py-3.5 font-mono text-stone-800">
                        {cand.model}
                      </td>
                      <td className="py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold border ${tierBadgeClass}`}>
                          {tierLabel}
                        </span>
                      </td>
                      <td className="py-3.5 font-mono text-stone-600">
                        {latency ? `${(latency / 1000).toFixed(2)}s` : "—"}
                      </td>
                      <td className="py-3.5 text-stone-600 font-mono">
                        {calls > 0 ? `${calls} / ${successes}` : "0 / 0"}
                      </td>
                      <td className="py-3.5">
                        {isLocked ? (
                          <div className="flex items-center gap-1.5 text-red-600 font-medium">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>Đã khóa ({lockRemainingStr})</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-emerald-600 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Hoạt động</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 text-right pr-3">
                        {isLocked ? (
                          <button
                            onClick={() => handleUnlockSingle(cand.provider, cand.model)}
                            className="px-2.5 py-1 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-[11px] font-semibold inline-flex items-center gap-1 transition"
                          >
                            <Unlock className="w-3 h-3" />
                            Mở khóa
                          </button>
                        ) : (
                          <span className="text-[11px] text-stone-400">Sẵn sàng</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0 text-xs text-stone-500">
          <div className="flex items-center gap-4 flex-wrap">
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
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition active:scale-95"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
