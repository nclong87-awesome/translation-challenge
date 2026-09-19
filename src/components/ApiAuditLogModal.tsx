import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  History,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Filter,
  Code,
  Copy,
  Check
} from "lucide-react";
import { getApiRequestLogsFromDB, clearApiRequestLogsFromDB } from "../services/requestHistoryService";
import { ApiRequestLog } from "../types";

interface ApiAuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiAuditLogModal: React.FC<ApiAuditLogModalProps> = ({
  isOpen,
  onClose
}) => {
  const [logs, setLogs] = useState<ApiRequestLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<ApiRequestLog | null>(null);
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [copied, setCopied] = useState(false);

  const loadLogs = useCallback(async () => {
    const list = await getApiRequestLogsFromDB();
    setLogs(list);
    if (list.length > 0 && !selectedLog) {
      setSelectedLog(list[0]);
    }
  }, [selectedLog]);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, loadLogs]);

  if (!isOpen) return null;

  const handleClear = async () => {
    if (window.confirm("Are you sure you want to clear all API request history logs?")) {
      await clearApiRequestLogsFromDB();
      setLogs([]);
      setSelectedLog(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== "all" && log.action !== filterAction) return false;
    if (filterStatus !== "all" && log.status !== filterStatus) return false;
    return true;
  });

  const actions = Array.from(new Set(logs.map(l => l.action).filter(Boolean)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-5xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
                Cloudflare Worker API Request Logs
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                  {logs.length} logged
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Full request/response audit trail persisted in IndexedDB
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              disabled={logs.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 flex items-center gap-1.5 transition disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Logs
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-white/60 dark:hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5" />
            Filters:
          </div>

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Actions ({logs.length})</option>
            {actions.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success Only</option>
            <option value="error">Error Only</option>
          </select>
        </div>

        {/* Main Content Split: List on Left, Inspector on Right */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Log list */}
          <div className="w-1/2 border-r border-slate-100 dark:border-slate-800 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No request logs found for current filter.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                const timeStr = new Date(log.timestamp).toLocaleTimeString();

                return (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`w-full p-3.5 text-left transition flex items-start gap-3 ${
                      isSelected
                        ? "bg-orange-50/70 dark:bg-orange-950/20 border-l-4 border-orange-500"
                        : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="mt-0.5">
                      {log.status === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                          {log.action || "LLM Request"}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                          {timeStr}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 rounded">
                          {log.provider}
                        </span>
                        <span className="truncate">{log.model}</span>
                        <span className="ml-auto text-slate-500">
                          {log.responseTimeMs}ms
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: Inspector Details */}
          <div className="w-1/2 p-5 overflow-y-auto space-y-4 bg-slate-50/30 dark:bg-slate-900">
            {selectedLog ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {selectedLog.action}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {selectedLog.provider} &bull; {selectedLog.model}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {selectedLog.responseTimeMs}ms
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        selectedLog.status === "success"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      HTTP {selectedLog.statusCode || (selectedLog.status === "success" ? 200 : 500)}
                    </span>
                  </div>
                </div>

                {/* Prompt & System Instruction */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Prompt Content
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                    {selectedLog.prompt}
                  </div>
                </div>

                {/* Response / Error */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {selectedLog.status === "error" ? "Error Message" : "Model Response"}
                    </span>
                    <button
                      onClick={() => handleCopy(selectedLog.rawResponse || selectedLog.response)}
                      className="text-[11px] text-orange-600 hover:text-orange-700 flex items-center gap-1 font-medium"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy Raw"}
                    </button>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                    {selectedLog.rawResponse || selectedLog.response}
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Select a log from the left to inspect details.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-800/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
