import React, { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, X, ShieldAlert, Play, Pause } from "lucide-react";

export interface RetryCountdownBannerProps {
  errorMessage: string;
  failedModel?: string;
  onRetry: () => void;
  onDismiss?: () => void;
  initialCountdownSeconds?: number;
}

export const RetryCountdownBanner: React.FC<RetryCountdownBannerProps> = ({
  errorMessage,
  failedModel,
  onRetry,
  onDismiss,
  initialCountdownSeconds = 5,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(initialCountdownSeconds);
  const [isCancelled, setIsCancelled] = useState<boolean>(false);

  // Automated 1-second countdown ticker
  useEffect(() => {
    if (isCancelled) return;

    if (secondsLeft <= 0) {
      onRetry();
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onRetry();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft, isCancelled, onRetry]);

  const handleCancelCountdown = () => {
    setIsCancelled(true);
  };

  const handleImmediateRetry = () => {
    setIsCancelled(true);
    onRetry();
  };

  return (
    <div
      id="retry-countdown-banner"
      className="relative overflow-hidden rounded-xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm backdrop-blur transition-all dark:border-rose-900/60 dark:bg-rose-950/40"
    >
      {/* Accent Line */}
      <div className="absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-rose-500 via-amber-500 to-rose-400 opacity-90" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="rounded-lg bg-rose-100 p-2 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300 flex-shrink-0 mt-0.5">
            <AlertTriangle className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                Lỗi kết nối mô hình AI
              </span>
              {failedModel && (
                <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white/70 px-2 py-0.5 font-mono text-[10px] text-rose-800 dark:border-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                  <ShieldAlert className="h-2.5 w-2.5 text-rose-500" />
                  {failedModel}
                </span>
              )}
            </div>

            <p className="mt-1 text-xs text-rose-700 dark:text-rose-300 break-words leading-relaxed">
              {errorMessage}
            </p>

            {/* Circuit Breaker Status Isolation Note */}
            <div className="mt-2 text-[11px] text-rose-600/90 dark:text-rose-400 flex items-center gap-1.5 font-medium">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
              <span>
                Circuit Breaker đã cách ly mô hình gặp lỗi và sẽ tự động định tuyến sang ứng viên khỏe mạnh tiếp theo.
              </span>
            </div>

            {/* Live Countdown or Manual Override State */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              {!isCancelled ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-900 dark:text-rose-200">
                  <span className="relative flex h-2 w-2 flex-shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600 dark:bg-rose-400" />
                  </span>
                  <span>
                    Tự động thử lại bằng mô hình thay thế sau:{" "}
                    <span className="font-mono text-sm text-rose-600 dark:text-rose-300 font-bold">
                      {secondsLeft}s
                    </span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300 font-medium">
                  <Pause className="h-3 w-3 text-rose-500" />
                  <span>Đã dừng tự động thử lại. Bạn có thể thử lại thủ công bên dưới:</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-retry-immediately"
                  onClick={handleImmediateRetry}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-700 active:bg-rose-800 transition-colors"
                >
                  <RefreshCw className="h-3 w-3 animate-spin-reverse" />
                  Thử lại ngay
                </button>

                {!isCancelled ? (
                  <button
                    type="button"
                    id="btn-cancel-retry-countdown"
                    onClick={handleCancelCountdown}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-rose-800 hover:bg-white dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                  >
                    Dừng đếm ngược
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            id="btn-dismiss-retry-banner"
            onClick={onDismiss}
            aria-label="Đóng thông báo"
            className="flex-shrink-0 rounded-lg p-1 text-rose-400 hover:bg-rose-100 hover:text-rose-700 dark:text-rose-500 dark:hover:bg-rose-900/50 dark:hover:text-rose-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
