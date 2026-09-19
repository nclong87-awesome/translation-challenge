import React, { useState, useEffect } from "react";
import { KeyRound, Eye, EyeOff, ShieldCheck, ArrowRight, X, Sparkles } from "lucide-react";

interface AccessKeyModalProps {
  isOpen: boolean;
  onSave: (key: string) => void;
  onClose?: () => void;
  onSkipSampleMode?: () => void;
  initialKey?: string | null;
  canCancel?: boolean;
  isSampleMode?: boolean;
}

export function AccessKeyModal({
  isOpen,
  onSave,
  onClose,
  onSkipSampleMode,
  initialKey = "",
  canCancel = false,
  isSampleMode = false,
}: AccessKeyModalProps) {
  const [inputValue, setInputValue] = useState(initialKey || "");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInputValue(initialKey || "");
      setError(null);
      setShowKey(false);
    }
  }, [isOpen, initialKey]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError("Vui lòng nhập mã truy cập để tiếp tục.");
      return;
    }
    setError(null);
    onSave(trimmed);
  };

  return (
    <div
      id="access-key-modal-overlay"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="access-key-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-key-modal-title"
        className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200 relative"
      >
        {canCancel && onClose && (
          <button
            id="btn-close-access-key-modal"
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="absolute top-4 right-4 p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2
            id="access-key-modal-title"
            className="text-lg font-bold text-stone-900 tracking-tight"
          >
            {initialKey ? "Cập nhật mã truy cập" : "Nhập mã truy cập"}
          </h2>
          <p className="text-xs text-stone-500 mt-1 leading-relaxed max-w-xs">
            {initialKey
              ? "Thay đổi mã truy cập đã lưu trong trình duyệt của bạn."
              : isSampleMode
              ? "Bạn đang ở chế độ mẫu. Nhập mã truy cập để kích hoạt đầy đủ tính năng AI."
              : "Vui lòng nhập mã truy cập để bắt đầu sử dụng ứng dụng. Mã sẽ được lưu vào Local Storage."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="input-access-key"
              className="block text-xs font-semibold text-stone-700 mb-1.5 text-left"
            >
              Mã truy cập (Access Key)
            </label>
            <div className="relative">
              <input
                id="input-access-key"
                type={showKey ? "text" : "password"}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Nhập mã truy cập..."
                autoFocus
                className="w-full pl-3.5 pr-10 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition"
              />
              <button
                id="btn-toggle-key-visibility"
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Ẩn mã truy cập" : "Hiện mã truy cập"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1"
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {error && (
              <p
                id="access-key-error"
                className="text-xs text-red-600 mt-1.5 text-left font-medium"
              >
                {error}
              </p>
            )}
          </div>

          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200 text-left flex items-start gap-2 text-[11px] text-stone-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Mã được lưu trữ cục bộ trên thiết bị của bạn và không bị gửi đi ngoài luồng ứng dụng.
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            {canCancel && onClose && (
              <button
                id="btn-cancel-access-key"
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 text-xs font-semibold hover:bg-stone-100 transition active:scale-98"
              >
                Hủy
              </button>
            )}
            <button
              id="btn-submit-access-key"
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition active:scale-98 shadow-xs"
            >
              <span>{initialKey ? "Lưu thay đổi" : "Bắt đầu sử dụng"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {onSkipSampleMode && (
            <div className="pt-3 border-t border-stone-100 flex flex-col items-center gap-1">
              <button
                id="btn-skip-sample-mode"
                type="button"
                onClick={onSkipSampleMode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 transition active:scale-95 border border-stone-200"
                title="Bỏ qua nhập mã và trải nghiệm với dữ liệu phản hồi mô phỏng"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Bỏ qua & dùng thử bản mẫu (Sample Mode)</span>
              </button>
              <p className="text-[10px] text-stone-400 text-center">
                Trải nghiệm ngay với phản hồi LLM mô phỏng (mocked response)
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
