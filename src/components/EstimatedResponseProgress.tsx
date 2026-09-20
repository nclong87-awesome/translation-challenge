import React, { useEffect, useState, useId, useRef } from "react";
import { X, Clock, Zap, Cpu, Compass, AlertTriangle, RefreshCw, ShieldAlert, Pause } from "lucide-react";
import { llmEventBus, RequestStartEvent } from "../services/llmEventBus";

export interface EstimatedResponseProgressProps {
  actionLabel?: string;
  onAbort?: () => void;
  overrideEvent?: RequestStartEvent | null;
  asModal?: boolean;
  error?: {
    errorMessage: string;
    failedModel?: string;
    retryCount?: number;
    maxRetries?: number;
    onRetry: () => void;
    onCancelCountdown?: () => void;
    onDismiss?: () => void;
    initialCountdownSeconds?: number;
  } | null;
}

export const EstimatedResponseProgress: React.FC<EstimatedResponseProgressProps> = ({
  actionLabel = "Đang xử lý bằng AI",
  onAbort,
  overrideEvent,
  asModal = true,
  error,
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

  // If error is present, render the gorgeous retry countdown modal state
  if (error) {
    const {
      errorMessage,
      failedModel,
      retryCount = 0,
      maxRetries = 3,
      onRetry,
      onDismiss,
      initialCountdownSeconds = 5,
    } = error;

    const [secondsLeft, setSecondsLeft] = useState<number>(initialCountdownSeconds);
    const [isCancelled, setIsCancelled] = useState<boolean>(retryCount >= maxRetries);
    const onRetryRef = useRef(onRetry);

    useEffect(() => {
      onRetryRef.current = onRetry;
    }, [onRetry]);

    useEffect(() => {
      if (retryCount >= maxRetries) {
        setIsCancelled(true);
      } else {
        setSecondsLeft(initialCountdownSeconds);
        setIsCancelled(false);
      }
    }, [errorMessage, failedModel, initialCountdownSeconds, retryCount, maxRetries]);

    useEffect(() => {
      if (isCancelled || retryCount >= maxRetries) return;

      const timer = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            onRetryRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }, [isCancelled, retryCount, maxRetries]);

    const handleImmediateRetry = () => {
      setIsCancelled(true);
      onRetry();
    };

    const errorCard = (
      <div
        id="retry-countdown-modal-card"
        className="relative overflow-hidden rounded-3xl border border-rose-200 bg-white p-6 sm:p-7 shadow-2xl backdrop-blur-md transition-all w-full max-w-md text-left"
      >
        {/* Accent Top Border */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-rose-500 via-amber-500 to-rose-400 animate-pulse" />

        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-2xl bg-rose-100 p-3 text-rose-600 flex-shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-stone-900">
                Lỗi kết nối mô hình AI
              </h3>
              {failedModel && (
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-2.5 py-0.5 font-mono text-xs text-rose-800">
                  <ShieldAlert className="h-3 w-3 text-rose-600" />
                  {failedModel}
                </span>
              )}
            </div>
          </div>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Đóng"
              className="rounded-xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Error message */}
        <p className="text-xs sm:text-sm text-stone-700 bg-rose-50/50 rounded-2xl p-3.5 border border-rose-100 mb-4 leading-relaxed break-words font-medium">
          {errorMessage}
        </p>

        {/* Circuit breaker isolation note */}
        <div className="mb-5 text-xs text-stone-600 bg-stone-50 rounded-2xl p-3 border border-stone-200 flex items-start gap-2.5">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500 mt-1 shrink-0 animate-ping" />
          <span className="leading-relaxed">
            <strong>Circuit Breaker:</strong> Đã cách ly mô hình gặp lỗi và tự động định tuyến sang ứng viên khỏe mạnh tiếp theo.
          </span>
        </div>

        {/* Countdown status & Action buttons */}
        <div className="space-y-4 pt-3 border-t border-stone-100">
          {retryCount >= maxRetries ? (
            <div className="text-xs text-rose-900 font-bold bg-rose-100/70 p-3 rounded-2xl border border-rose-200">
              Đã đạt tối đa {maxRetries} lần thử lại tự động. Vui lòng bấm thử lại thủ công bên dưới.
            </div>
          ) : !isCancelled ? (
            <div className="flex items-center justify-between bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" />
                </span>
                <span>Tự động thử lại (lần {retryCount + 1}/{maxRetries}):</span>
              </div>
              <span className="font-mono text-base font-extrabold text-amber-700 bg-white px-3 py-1 rounded-xl shadow-2xs border border-amber-200">
                {secondsLeft}s
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-stone-600 bg-stone-100 p-3 rounded-2xl font-medium">
              <Pause className="h-4 w-4 text-stone-500" />
              <span>Đã tạm dừng đếm ngược tự động.</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {retryCount < maxRetries && !isCancelled && (
              <button
                type="button"
                onClick={() => setIsCancelled(true)}
                className="px-4 py-2.5 rounded-2xl border border-stone-300 bg-white text-stone-700 text-xs font-bold hover:bg-stone-50 transition active:scale-95 shadow-2xs"
              >
                Dừng đếm ngược
              </button>
            )}

            <button
              type="button"
              onClick={handleImmediateRetry}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-extrabold shadow-md transition flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4 animate-spin-reverse" />
              Thử lại ngay
            </button>
          </div>
        </div>
      </div>
    );

    if (asModal) {
      return (
        <div
          id="retry-countdown-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          {errorCard}
        </div>
      );
    }
    return errorCard;
  }

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
