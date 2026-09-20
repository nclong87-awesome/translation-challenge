import React, { useEffect, useState, useId } from "react";
import { X, Clock, Zap, Cpu, Compass } from "lucide-react";
import { llmEventBus, RequestStartEvent } from "../services/llmEventBus";

export interface EstimatedResponseProgressProps {
  actionLabel?: string;
  onAbort?: () => void;
  overrideEvent?: RequestStartEvent | null;
  asModal?: boolean;
}

export const EstimatedResponseProgress: React.FC<EstimatedResponseProgressProps> = ({
  actionLabel = "Đang xử lý bằng AI",
  onAbort,
  overrideEvent,
  asModal = true,
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

  // Circular progress SVG geometry (bigger)
  const size = 144;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const contentCard = (
    <div
      id="estimated-response-progress-container"
      className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-white p-6 sm:p-8 shadow-2xl backdrop-blur-md transition-all w-full max-w-sm text-center transform scale-100 flex flex-col items-center"
    >
      {/* 1. Pulsing Accent Top Border consistent with app tones */}
      <div
        className={`absolute inset-x-0 top-0 h-[3px] transition-colors duration-300 ${
          isOvertime
            ? "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 animate-pulse"
            : "bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600 animate-pulse"
        }`}
      />

      {/* Header Info: Beacon, Action Label, Badges, Cancel Button */}
      <div className="flex items-center justify-between w-full gap-2 mb-6">
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

          <span className="text-xs font-bold text-stone-900 truncate text-left">
            {currentEvent.action || actionLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Provider Badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getProviderBadgeColor(
              currentEvent.provider
            )}`}
          >
            <Zap className="h-2.5 w-2.5" />
            {currentEvent.provider}
          </span>

          {/* Cancellation Trigger */}
          <button
            type="button"
            id="btn-abort-llm-request"
            onClick={handleCancel}
            aria-label="Hủy yêu cầu AI"
            title="Hủy yêu cầu"
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Body: Circular Progress Ring Centered */}
      <div className="relative flex items-center justify-center my-2">
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
            className="text-stone-100 transition-colors"
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
          <span className="text-2xl font-black tabular-nums text-stone-900 leading-none">
            {progressPercent}%
          </span>
          <span className="text-xs text-stone-500 font-bold tabular-nums mt-1.5 leading-none">
            {elapsedSeconds}s đã qua
          </span>
        </div>
      </div>

      {/* Text Info Below the Circular Progress */}
      <div className="flex flex-col items-center justify-center gap-2.5 w-full mt-5 pt-4 border-t border-stone-100">
        {/* Active Model Indicator */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-stone-700 w-full">
          <Cpu className="h-4 w-4 flex-shrink-0 text-indigo-500" />
          <span
            className="font-mono text-xs truncate text-stone-800 bg-stone-50 px-2.5 py-1 rounded-md border border-stone-200"
            title={currentEvent.model}
          >
            {currentEvent.model}
          </span>
        </div>

        {/* Timing details */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-stone-600 font-medium">
          <Clock className="h-4 w-4 text-stone-400 flex-shrink-0" />
          {isOvertime ? (
            <span className="text-amber-700 font-semibold animate-pulse">
              Đang hoàn tất... ({elapsedSeconds}s)
            </span>
          ) : (
            <span>
              Còn ~<strong className="text-stone-900 font-bold">{remainingSeconds.toFixed(1)}s</strong> (dự tính {(expectedMs / 1000).toFixed(0)}s)
            </span>
          )}
        </div>

        {/* Routing Mode Indicator */}
        {currentEvent.isAutoRouting && (
          <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-indigo-600">
            <Compass className="h-3.5 w-3.5" />
            <span>Định tuyến thông minh</span>
          </div>
        )}
      </div>
    </div>
  );

  if (asModal) {
    return (
      <div
        id="estimated-response-progress-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      >
        {contentCard}
      </div>
    );
  }

  return contentCard;
};
