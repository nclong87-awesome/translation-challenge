import React, { useEffect, useState, useId } from "react";
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
  const gradientId = useId();
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
    if (p.includes("groq")) {
      return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800";
    }
    if (p.includes("openrouter")) {
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
    }
    if (p.includes("gemini")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
    }
    if (p.includes("9flare")) {
      return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800";
    }
    if (p.includes("ollama")) {
      return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
    }
    if (p.includes("cloudflare")) {
      return "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800";
    }
    return "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700";
  };

  // Circular progress SVG geometry
  const size = 76;
  const strokeWidth = 5.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div
      id="estimated-response-progress-container"
      className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-stone-50/95 p-3.5 sm:p-4 shadow-sm backdrop-blur-xs transition-all dark:border-stone-800 dark:bg-stone-900/95 text-left"
    >
      {/* 1. Pulsing Accent Top Border consistent with app tones */}
      <div
        className={`absolute inset-x-0 top-0 h-[2.5px] transition-colors duration-300 ${
          isOvertime
            ? "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 animate-pulse"
            : "bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600 animate-pulse"
        }`}
      />

      {/* Header Info: Beacon, Action Label, Badges, Cancel Button */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Activity Beacon */}
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                isOvertime ? "bg-amber-400" : "bg-indigo-400"
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                isOvertime ? "bg-amber-600" : "bg-indigo-600"
              }`}
            />
          </span>

          <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 truncate">
            {currentEvent.action || actionLabel}
          </span>

          {/* Provider Badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider flex-shrink-0 ${getProviderBadgeColor(
              currentEvent.provider
            )}`}
          >
            <Zap className="h-2.5 w-2.5" />
            {currentEvent.provider}
          </span>

          {/* Routing Mode Indicator */}
          {currentEvent.isAutoRouting && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 flex-shrink-0">
              <Compass className="h-2.5 w-2.5 text-stone-500" />
              Auto Route
            </span>
          )}
        </div>

        {/* Cancellation Trigger */}
        <button
          type="button"
          id="btn-abort-llm-request"
          onClick={handleCancel}
          aria-label="Hủy yêu cầu AI"
          title="Hủy yêu cầu"
          className="flex-shrink-0 rounded-lg p-1 text-stone-400 hover:bg-stone-200/70 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Main Body: Circular Progress Ring + Real-time Model & Timing Specs */}
      <div className="flex items-center gap-4">
        {/* Circular Progress Gauge */}
        <div className="relative flex-shrink-0 w-[76px] h-[76px] flex items-center justify-center">
          <svg
            id="circular-progress-svg"
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="transform -rotate-90"
          >
            <defs>
              <linearGradient id={`progress-gradient-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                {isOvertime ? (
                  <>
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ea580c" />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#4f46e5" />
                  </>
                )}
              </linearGradient>
            </defs>

            {/* Background Track Circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              fill="transparent"
              className="text-stone-200 dark:text-stone-800 transition-colors"
            />

            {/* Dynamic Value Ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={`url(#progress-gradient-${gradientId})`}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              style={{
                transition: "stroke-dashoffset 200ms ease-out",
              }}
            />
          </svg>

          {/* Centered Percentage & Time Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-sm font-bold tabular-nums text-stone-900 dark:text-stone-100 leading-none">
              {progressPercent}%
            </span>
            <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium tabular-nums mt-0.5 leading-none">
              {elapsedSeconds}s
            </span>
          </div>
        </div>

        {/* Status Breakdown & Model Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          {/* Active Model Indicator */}
          <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300">
            <Cpu className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />
            <span
              className="font-mono text-[11px] truncate text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800/80 px-1.5 py-0.5 rounded border border-stone-200/80 dark:border-stone-700"
              title={currentEvent.model}
            >
              {currentEvent.model}
            </span>
          </div>

          {/* Timing details */}
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600 dark:text-stone-400 font-medium pt-0.5">
            <Clock className="h-3 w-3 text-stone-400 flex-shrink-0" />
            {isOvertime ? (
              <span className="text-amber-700 dark:text-amber-400 font-semibold animate-pulse">
                Đang hoàn tất phản hồi... ({elapsedSeconds}s)
              </span>
            ) : (
              <span className="truncate">
                Còn ~<strong className="text-stone-800 dark:text-stone-200 font-semibold">{remainingSeconds.toFixed(1)}s</strong> (dự tính {(expectedMs / 1000).toFixed(0)}s)
              </span>
            )}
          </div>

          {/* Micro status info */}
          <div className="flex items-center gap-2 text-[10px] text-stone-500 dark:text-stone-400">
            <span>{elapsedSeconds}s đã qua</span>
            <span className="text-stone-300 dark:text-stone-700">•</span>
            <span className="capitalize">{currentEvent.provider}</span>
            {isOvertime && (
              <>
                <span className="text-stone-300 dark:text-stone-700">•</span>
                <span className="text-amber-600 dark:text-amber-400">Chờ thêm chút</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
