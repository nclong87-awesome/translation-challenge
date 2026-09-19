import React, { useState } from "react";
import { X, Key, Zap, CheckCircle2, AlertCircle, RefreshCw, Globe, Shield } from "lucide-react";
import { getStoredAccessKey, setStoredAccessKey } from "../services/accessKey";
import { CLOUDFLARE_LLM_PROVIDERS, LLMProviderConfig } from "../config/llmProviders";
import { testWorkerConnection } from "../services/llmClientService";

interface ProxySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const ProxySettingsModal: React.FC<ProxySettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved
}) => {
  const [accessKey, setAccessKey] = useState<string>(getStoredAccessKey() || "");
  const [selectedProvider, setSelectedProvider] = useState<string>(
    localStorage.getItem("preferred_llm_provider") || "auto"
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  if (!isOpen) return null;

  const currentProvider = CLOUDFLARE_LLM_PROVIDERS.find((p: LLMProviderConfig) => p.id === selectedProvider);

  const handleSave = () => {
    setStoredAccessKey(accessKey.trim());
    localStorage.setItem("preferred_llm_provider", selectedProvider);
    if (onSaved) onSaved();
    onClose();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    const targetUrl = currentProvider?.workerUrl || "https://groq.nclong87.workers.dev/openai/v1";
    const targetModel = currentProvider?.models[0] || "llama-3.3-70b-versatile";

    try {
      const result = await testWorkerConnection({
        workerUrl: targetUrl,
        provider: selectedProvider === "auto" ? "groq" : selectedProvider,
        model: targetModel,
        accessKey: accessKey.trim()
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err.message || "Connection failed"
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-slate-800 dark:to-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-lg">
                Cloudflare Workers LLM Proxy
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Multi-provider edge gateway with automatic failover
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-white/60 dark:hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Access Key Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-orange-500" />
                Cloudflare Worker Access Key
              </label>
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded">
                Sent in X-Proxy-Key
              </span>
            </div>
            <input
              type="password"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="Enter your Cloudflare Worker access key..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-mono"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Required for edge ingress authentication across all Cloudflare Worker microservices (*.workers.dev).
            </p>
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-blue-500" />
              Routing Mode & Upstream Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedProvider("auto")}
                className={`p-3 rounded-xl border text-left transition ${
                  selectedProvider === "auto"
                    ? "border-orange-500 bg-orange-50/50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 ring-1 ring-orange-500"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-orange-500" />
                  Auto-Rotation Router
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Tiered failover + ε-Greedy
                </div>
              </button>

              {CLOUDFLARE_LLM_PROVIDERS.map((provider: LLMProviderConfig) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedProvider(provider.id)}
                  className={`p-3 rounded-xl border text-left transition ${
                    selectedProvider === provider.id
                      ? "border-orange-500 bg-orange-50/50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 ring-1 ring-orange-500"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="font-semibold text-xs truncate">{provider.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate font-mono">
                    {provider.models[0]?.split("/").pop()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Diagnostics Test Button */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={testing || !accessKey.trim()}
              onClick={handleTestConnection}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold transition disabled:opacity-50"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
                  Pinging Cloudflare Worker...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 text-emerald-500" />
                  Test Worker Ingress Connection
                </>
              )}
            </button>

            {/* Test Result Box */}
            {testResult && (
              <div
                className={`mt-3 p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                  testResult.ok
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">
                    {testResult.ok
                      ? `Worker Connected! (${testResult.latencyMs}ms)`
                      : "Connection Error"}
                  </div>
                  <div className="mt-0.5 break-all opacity-90">{testResult.message}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-xl shadow-md transition"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
