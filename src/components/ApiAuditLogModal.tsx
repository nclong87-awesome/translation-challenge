import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  History,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Filter,
  Code,
  Copy,
  Check,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MessageSquare,
  FileText,
  Settings,
  ArrowLeft,
  Activity,
  Database
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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all"); // "all" | "success" | "error"
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"response" | "prompt" | "system">("response");

  const loadLogs = useCallback(async () => {
    const list = await getApiRequestLogsFromDB();
    setLogs(list);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
      setCurrentPage(1);
    }
  }, [isOpen, loadLogs]);

  const handleClear = async () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử API Request Logs?")) {
      await clearApiRequestLogsFromDB();
      setLogs([]);
      setSelectedLog(null);
      setCurrentPage(1);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const providers = useMemo(() => {
    return Array.from(new Set(logs.map(l => l.provider).filter(Boolean)));
  }, [logs]);

  const actions = useMemo(() => {
    return Array.from(new Set(logs.map(l => l.action).filter(Boolean)));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterStatus !== "all" && log.status !== filterStatus) return false;
      if (filterProvider !== "all" && log.provider !== filterProvider) return false;
      if (filterAction !== "all" && log.action !== filterAction) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPrompt = log.prompt?.toLowerCase().includes(q);
        const matchesModel = log.model?.toLowerCase().includes(q);
        const matchesAction = log.action?.toLowerCase().includes(q);
        const matchesProvider = log.provider?.toLowerCase().includes(q);
        const matchesResponse = log.response?.toLowerCase().includes(q);
        if (!matchesPrompt && !matchesModel && !matchesAction && !matchesProvider && !matchesResponse) {
          return false;
        }
      }
      return true;
    });
  }, [logs, filterStatus, filterProvider, filterAction, searchQuery]);

  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  const successCount = logs.filter(l => l.status === "success").length;
  const errorCount = logs.filter(l => l.status === "error").length;

  if (!isOpen) return null;

  return (
    <div
      id="audit-log-modal-overlay"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        id="audit-log-modal-container"
        className="w-full max-w-4xl bg-white sm:rounded-3xl h-full sm:h-[90vh] flex flex-col shadow-2xl overflow-hidden border-0 sm:border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header matching app style */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-2xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-stone-900 flex items-center gap-1.5">
                  Nhật ký API LLM
                  <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold border border-stone-200">
                    {filteredLogs.length}/{logs.length}
                  </span>
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  <Database className="w-3 h-3 text-emerald-600" />
                  <span>IndexedDB</span>
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Kiểm tra toàn bộ request và response payload của các mô hình
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadLogs}
              title="Làm mới"
              className="min-w-[36px] min-h-[36px] rounded-xl border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-100 flex items-center justify-center transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handleClear}
              disabled={logs.length === 0}
              title="Xóa lịch sử"
              className="min-w-[36px] min-h-[36px] rounded-xl border border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center transition disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" />
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

        {/* Search & Filter Bar */}
        <div className="p-3.5 border-b border-stone-200 bg-stone-50 shrink-0 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm kiếm theo prompt, model, hành động..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 bg-white text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600 font-medium"
              >
                Xóa
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-1.5 bg-stone-200/70 p-1 rounded-xl">
              <button
                onClick={() => { setFilterStatus("all"); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  filterStatus === "all"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Tất cả ({logs.length})
              </button>
              <button
                onClick={() => { setFilterStatus("success"); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                  filterStatus === "success"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "text-emerald-700 hover:bg-emerald-100/60"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Thành công ({successCount})
              </button>
              <button
                onClick={() => { setFilterStatus("error"); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                  filterStatus === "error"
                    ? "bg-red-600 text-white shadow-2xs"
                    : "text-red-700 hover:bg-red-100/60"
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Lỗi ({errorCount})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterProvider}
                onChange={(e) => { setFilterProvider(e.target.value); setCurrentPage(1); }}
                className="px-3 py-1.5 rounded-xl border border-stone-300 bg-white text-stone-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Tất cả Provider ({providers.length})</option>
                {providers.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              <select
                value={filterAction}
                onChange={(e) => { setFilterAction(e.target.value); setCurrentPage(1); }}
                className="px-3 py-1.5 rounded-xl border border-stone-300 bg-white text-stone-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Tất cả Danh mục ({actions.length})</option>
                {actions.map(act => (
                  <option key={act} value={act}>{act}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Main Content Split View */}
        <div className="flex-1 flex overflow-hidden bg-stone-50/50">
          {/* Left List */}
          <div className={`w-full md:w-1/2 border-r border-stone-200 overflow-y-auto divide-y divide-stone-200 bg-white ${selectedLog ? 'hidden md:block' : 'block'}`}>
            {paginatedLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-stone-500 flex flex-col items-center justify-center gap-2">
                <History className="w-8 h-8 opacity-40 text-stone-400" />
                <p>Không tìm thấy nhật ký yêu cầu phù hợp.</p>
              </div>
            ) : (
              paginatedLogs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                const timeStr = new Date(log.timestamp).toLocaleTimeString();
                const isSuccess = log.status === "success";
                const statusCode = log.statusCode || (isSuccess ? 200 : 500);

                return (
                  <button
                    key={log.id}
                    onClick={() => {
                      setSelectedLog(log);
                      setActiveTab("response");
                    }}
                    className={`w-full p-3.5 text-left transition flex items-start gap-3 ${
                      isSelected
                        ? "bg-emerald-50 border-l-4 border-emerald-600"
                        : "hover:bg-stone-50"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold font-mono border ${
                        isSuccess 
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                          : "bg-red-50 text-red-800 border-red-200"
                      }`}>
                        {isSuccess ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertCircle className="w-3 h-3 text-red-600" />}
                        {statusCode}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-800 font-bold text-[11px] truncate border border-stone-200">
                          {log.action || "LLM Request"}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-mono text-[11px] font-semibold">
                          {log.responseTimeMs.toLocaleString()} ms
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-stone-500 font-mono">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-semibold text-stone-700">{log.provider}</span>
                          <span>•</span>
                          <span className="truncate">{log.model}</span>
                        </div>
                        <span className="text-[10px] text-stone-400 shrink-0">{timeStr}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Inspector Details */}
          <div className={`w-full md:w-1/2 p-4 sm:p-5 overflow-y-auto space-y-4 bg-stone-50 ${!selectedLog ? 'hidden md:flex md:items-center md:justify-center' : 'flex flex-col'}`}>
            {selectedLog ? (
              <>
                <div className="flex md:hidden items-center pb-2 border-b border-stone-200">
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Quay lại danh sách
                  </button>
                </div>

                <div className="flex items-start justify-between gap-2 pb-3 border-b border-stone-200 bg-white p-3 rounded-2xl border border-stone-200 shadow-2xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono border ${
                        selectedLog.status === "success" 
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                          : "bg-red-50 text-red-800 border-red-200"
                      }`}>
                        {selectedLog.status === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
                        HTTP {selectedLog.statusCode || (selectedLog.status === "success" ? 200 : 500)}
                      </span>
                      <h3 className="text-sm font-bold text-stone-900">
                        {selectedLog.action || "LLM Request"}
                      </h3>
                    </div>
                    <div className="text-xs text-stone-500 font-mono mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-stone-700">Provider: {selectedLog.provider}</span>
                      <span>•</span>
                      <span>Model: {selectedLog.model}</span>
                      <span>•</span>
                      <span>{new Date(selectedLog.timestamp).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 font-semibold border border-stone-200">
                      {selectedLog.responseTimeMs.toLocaleString()} ms
                    </span>
                    <button
                      onClick={() => handleCopy(selectedLog.rawResponse || selectedLog.response || selectedLog.prompt)}
                      title="Sao chép"
                      className="p-2 rounded-xl bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 transition shadow-2xs"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-stone-200/70 p-1 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab("response")}
                    className={`flex-1 py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                      activeTab === "response"
                        ? "bg-white text-stone-900 shadow-2xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    Phản hồi (Response)
                  </button>
                  <button
                    onClick={() => setActiveTab("prompt")}
                    className={`flex-1 py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                      activeTab === "prompt"
                        ? "bg-white text-stone-900 shadow-2xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    Prompt / Yêu cầu
                  </button>
                  <button
                    onClick={() => setActiveTab("system")}
                    className={`flex-1 py-1.5 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                      activeTab === "system"
                        ? "bg-white text-stone-900 shadow-2xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5 text-purple-600" />
                    Hệ thống & Cài đặt
                  </button>
                </div>

                {/* Tab content box */}
                <div className="flex-1 flex flex-col space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                      {activeTab === "response" && (selectedLog.status === "error" ? "Nội dung lỗi" : "Model Response Payload")}
                      {activeTab === "prompt" && "Nội dung Prompt gửi đi"}
                      {activeTab === "system" && "System Instruction & Schema"}
                    </span>
                    <button
                      onClick={() => {
                        const content = activeTab === "response" 
                          ? (selectedLog.rawResponse || selectedLog.response) 
                          : activeTab === "prompt" 
                            ? selectedLog.prompt 
                            : (selectedLog.systemInstruction || selectedLog.schemaDescription || "Không có system instruction hay schema.");
                        handleCopy(content);
                      }}
                      className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Đã sao chép" : "Sao chép nội dung"}
                    </button>
                  </div>

                  <div className="flex-1 p-3.5 bg-stone-900 text-stone-100 rounded-2xl border border-stone-800 text-xs font-mono leading-relaxed overflow-y-auto max-h-[360px] shadow-inner">
                    <pre className="whitespace-pre-wrap break-words">
                      {activeTab === "response" && (selectedLog.rawResponse || selectedLog.response || "Không có response.")}
                      {activeTab === "prompt" && (selectedLog.prompt || "Không có prompt.")}
                      {activeTab === "system" && (
                        `[System Instruction]\n${selectedLog.systemInstruction || "Không có"}\n\n[Schema Description]\n${selectedLog.schemaDescription || "Không có"}`
                      )}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-xs text-stone-500 flex flex-col items-center justify-center gap-2">
                <Code className="w-10 h-10 opacity-30 text-stone-400" />
                <p>Chọn một mục từ danh sách bên trái để kiểm tra chi tiết.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Pagination Bar */}
        <div className="px-5 py-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0 text-xs">
          <div className="flex items-center gap-2 text-stone-600">
            <span>
              {totalItems === 0 ? "0 / 0" : `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, totalItems)} trên ${totalItems}`}
            </span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ml-2 px-2.5 py-1 rounded-xl border border-stone-300 bg-white text-stone-700 focus:outline-none text-xs"
            >
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
              <option value={100}>100 / trang</option>
            </select>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              title="Trang đầu"
              className="p-1.5 rounded-xl border border-stone-200 bg-white text-stone-700 disabled:opacity-30 hover:bg-stone-100 transition"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              title="Trang trước"
              className="p-1.5 rounded-xl border border-stone-200 bg-white text-stone-700 disabled:opacity-30 hover:bg-stone-100 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 font-mono font-semibold text-stone-700">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              title="Trang sau"
              className="p-1.5 rounded-xl border border-stone-200 bg-white text-stone-700 disabled:opacity-30 hover:bg-stone-100 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              title="Trang cuối"
              className="p-1.5 rounded-xl border border-stone-200 bg-white text-stone-700 disabled:opacity-30 hover:bg-stone-100 transition"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
