import React, { useEffect, useState } from "react";
import { X, Clock, Zap, Cpu, Compass } from "lucide-react";
import { llmEventBus, RequestStartEvent } from "../services/llmEventBus";

export interface EstimatedResponseProgressProps {
  actionLabel?: string;
  onAbort?: () => void;
  overrideEvent?: RequestStartEvent | null;
}

export const EstimatedResponseProgress: React.FC<EstimatedResponseProgressProps> = ({
  actionLabel = "Đang xử lý bằng AI",
  onAbort,
  overrideEvent,
}) => {
  const [currentEvent, setCurrentEvent] = useState<RequestStartEvent | null>(
    overrideEvent || llmEventBus.getActiveRequest()
  );
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  // Sync with global event bus if no override is provided
  useEffect(() => {
    if (overrideEvent !== undefined) {
      setCurrentEvent(overrideEvent);
      return;
    }

    const unsubStart = llmEventBus.subscribeStart((event) => {
      setCurrentEvent(event);
      setElapsedMs(Math.max(0, Date.now() - event.timestamp));
    });

    const unsubEnd = llmEventBus.subscribeEnd(() => {
      setCurrentEvent(null);
    });

    return () => {
      unsubStart();
      unsubEnd();
    };
  }, [overrideEvent]);

  // High-frequency 100ms ticker for smooth progress and real-time clock math
  useEffect(() => {
    if (!currentEvent) {
      setElapsedMs(0);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - currentEvent.timestamp;
      setElapsedMs(Math.max(0, elapsed));
    }, 100);

    return () => clearInterval(interval);
  }, [currentEvent]);

  if (!currentEvent) {
    return null;
  }

  const expectedMs = currentEvent.expectedDurationMs > 0 ? currentEvent.expectedDurationMs : 20000;
  // Progress clamped strictly to 99% until complete payload arrives
  const rawRatio = elapsedMs / expectedMs;
  const progressPercent = Math.min(99, Math.max(2, Math.floor(rawRatio * 100)));

  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const remainingSeconds = Math.max(0, (expectedMs - elapsedMs) / 1000);
  const isOvertime = elapsedMs >= expectedMs;

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAbort) {
      onAbort();
    } else {
      llmEventBus.abortActiveRequest("User cancelled via progress trigger");
    }
  };

  const getProviderBadgeColor = (provider: string) => {
    const p = provider.toLowerCase();
    if (p.includes("groq")) return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800";
    if (p.includes("openrouter")) return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
    if (p.includes("gemini")) return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
    if (p.includes("9flare")) return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800";
    if (p.includes("ollama")) return "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800";
    if (p.includes("cloudflare")) return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
    return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
  };

  return (
    <div
      id="estimated-response-progress-container"
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur transition-all dark:border-slate-800 dark:bg-slate-900/95"
    >
      {/* 1. Pulsing Accent Line (Top animated horizontal gradient) */}
      <div className="absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400 opacity-90 animate-pulse" />

      {/* Header Info: Beacon, Provider Badge, Model, Routing Mode, Cancel Button */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* 2. Activity Beacon (dual-layer pulsing beacon) */}
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75 dark:bg-blue-300" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-400" />
          </span>

          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            {currentEvent.action || actionLabel}
          </span>

          {/* 3. Provider Badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider flex-shrink-0 ${getProviderBadgeColor(
              currentEvent.provider
            )}`}
          >
            <Zap className="h-2.5 w-2.5" />
            {currentEvent.provider}
          </span>

          {/* 5. Routing Mode Indicator */}
          {currentEvent.isAutoRouting && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 flex-shrink-0">
              <Compass className="h-2.5 w-2.5" />
              Auto Route
            </span>
          )}
        </div>

        {/* 6. Cancellation Trigger */}
        <button
          type="button"
          id="btn-abort-llm-request"
          onClick={handleCancel}
          aria-label="Hủy yêu cầu AI"
          title="Hủy yêu cầu"
          className="flex-shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 4. Active Model Label */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-2.5">
        <Cpu className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
        <span className="font-mono text-[11px] truncate text-slate-600 dark:text-slate-300">
          {currentEvent.model}
        </span>
      </div>

      {/* 7. Dynamic Progress Bar (proportional bar reflecting P(t) in [0%, 99%]) */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden p-0.5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-200 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 8. Status Breakdown */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-slate-400" />
          <span>{elapsedSeconds}s đã qua</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span>{progressPercent}%</span>
        </div>

        <div>
          {isOvertime ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium animate-pulse">
              Chờ thêm một chút...
            </span>
          ) : (
            <span>
              còn ~{remainingSeconds.toFixed(1)}s (dự tính {(expectedMs / 1000).toFixed(0)}s)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
