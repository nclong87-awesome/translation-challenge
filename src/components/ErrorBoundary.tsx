import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  AlertTriangle,
  RotateCcw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Database,
  Trash2,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  handleCopyReport = async () => {
    const { error, errorInfo } = this.state;
    const report = [
      "=== BÁO CÁO LỖI ỨNG DỤNG / APPLICATION ERROR REPORT ===",
      `Thời gian: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      `User Agent: ${navigator.userAgent}`,
      `Error Name: ${error?.name || "Unknown"}`,
      `Error Message: ${error?.message || "No message"}`,
      "",
      "--- STACK TRACE ---",
      error?.stack || "No stack trace",
      "",
      "--- COMPONENT TRACE ---",
      errorInfo?.componentStack || "No component stack",
    ].join("\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = report;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch (err) {
      console.error("Failed to copy error report:", err);
    }
  };

  handleResetStorage = async () => {
    if (
      window.confirm(
        "Bạn có chắc muốn xóa bộ nhớ đệm (Local Storage & IndexedDB) và tải lại ứng dụng không? Điều này sẽ giúp khắc phục lỗi do dữ liệu bị lỗi."
      )
    ) {
      try {
        localStorage.clear();
        sessionStorage.clear();
        if ("indexedDB" in window) {
          const dbs = ["TranslationChallengeDB", "VocabLearnerDB"];
          dbs.forEach((dbName) => {
            try {
              window.indexedDB.deleteDatabase(dbName);
            } catch (e) {
              console.warn("Could not delete DB:", dbName, e);
            }
          });
        }
      } catch (err) {
        console.error("Error clearing storage:", err);
      }
      window.location.reload();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleTryRecover = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, copied, showDetails } = this.state;

      return (
        <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4 sm:p-6 font-sans text-stone-800">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-rose-200 overflow-hidden">
            {/* Header Banner */}
            <div className="bg-rose-50 border-b border-rose-100 p-6 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-xs">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-rose-950 tracking-tight">
                  Báo cáo sự cố ứng dụng
                </h1>
                <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                  Ứng dụng gặp lỗi không mong muốn khi khởi chạy hoặc kết xuất giao diện.
                </p>
              </div>
            </div>

            {/* Error Body */}
            <div className="p-6 space-y-4">
              {/* Primary Error Message */}
              <div className="rounded-xl bg-rose-50/60 border border-rose-200/80 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-900 mb-1">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>Chi tiết lỗi:</span>
                </div>
                <p className="text-sm font-mono text-rose-800 break-words font-medium">
                  {error?.message || "Đã xảy ra lỗi không xác định"}
                </p>
              </div>

              {/* Environment Info */}
              <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-200 text-xs space-y-1.5 text-stone-600">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium text-stone-500">Đường dẫn (URL):</span>
                  <span className="font-mono text-[11px] truncate max-w-[240px]" title={window.location.href}>
                    {window.location.pathname}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium text-stone-500">Thời điểm:</span>
                  <span className="font-mono text-[11px]">
                    {new Date().toLocaleTimeString()} ({new Date().toLocaleDateString()})
                  </span>
                </div>
              </div>

              {/* Collapsible Technical Stack */}
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => this.setState({ showDetails: !showDetails })}
                  className="w-full px-4 py-2.5 bg-stone-50 hover:bg-stone-100 flex items-center justify-between text-xs font-semibold text-stone-700 transition"
                >
                  <span>Xem chi tiết ngăn xếp kỹ thuật (Stack Trace)</span>
                  {showDetails ? (
                    <ChevronUp className="w-4 h-4 text-stone-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-stone-500" />
                  )}
                </button>

                {showDetails && (
                  <div className="p-3 bg-stone-900 text-stone-200 text-[11px] font-mono overflow-x-auto max-h-60 leading-relaxed">
                    <div className="text-rose-400 font-bold mb-1">
                      {error?.name}: {error?.message}
                    </div>
                    <pre className="whitespace-pre-wrap text-stone-400">
                      {error?.stack || "Không có stack trace"}
                    </pre>
                    {errorInfo?.componentStack && (
                      <div className="mt-2 pt-2 border-t border-stone-800 text-stone-400">
                        <div className="text-amber-400 font-semibold mb-1">Component Stack:</div>
                        <pre className="whitespace-pre-wrap">{errorInfo.componentStack}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs active:scale-98"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Tải lại trang</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleCopyReport}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold border border-stone-200 transition flex items-center justify-center gap-2 active:scale-98"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700">Đã sao chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-stone-500" />
                      <span>Sao chép báo cáo</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={this.handleResetStorage}
                  title="Xóa LocalStorage và IndexedDB để đặt lại trạng thái ban đầu"
                  className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold border border-rose-200 transition flex items-center justify-center gap-1.5 active:scale-98"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Xóa Cache</span>
                </button>
              </div>
            </div>

            {/* Footer note */}
            <div className="bg-stone-50 border-t border-stone-200 px-6 py-3 text-[11px] text-stone-400 flex items-center justify-between">
              <span>Hệ thống ghi nhận lỗi tự động</span>
              <button
                type="button"
                onClick={this.handleTryRecover}
                className="text-emerald-700 hover:underline font-medium"
              >
                Thử khôi phục giao diện &rarr;
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
