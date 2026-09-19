import React, { useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Volume2,
  RotateCcw,
  Database,
} from "lucide-react";
import { UserVocabItem } from "../types";
import {
  isItemEligibleForReview,
  getTimeUntilReview,
} from "../services/candidateSelector";

interface VocabCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection: UserVocabItem[];
  onAddVocab: (item: Omit<UserVocabItem, "id" | "addedAt">) => void;
  onDeleteVocab: (id: string) => void;
  onResetCooldown: (id: string) => void;
  onResetAllDefault: () => void;
  onPlayAudio?: (text: string, lang: string) => void;
}

export function VocabCollectionModal({
  isOpen,
  onClose,
  collection,
  onAddVocab,
  onDeleteVocab,
  onResetCooldown,
  onResetAllDefault,
  onPlayAudio,
}: VocabCollectionModalProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newTranslation, setNewTranslation] = useState("");
  const [newPos, setNewPos] = useState("phrase");
  const [filter, setFilter] = useState<"all" | "eligible" | "cooldown">("all");

  if (!isOpen) return null;

  const eligibleCount = collection.filter((item) => isItemEligibleForReview(item)).length;
  const cooldownCount = collection.length - eligibleCount;

  const filteredItems = collection.filter((item) => {
    const isEligible = isItemEligibleForReview(item);
    if (filter === "eligible") return isEligible;
    if (filter === "cooldown") return !isEligible;
    return true;
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim() || !newTranslation.trim()) return;

    onAddVocab({
      word: newWord.trim(),
      translation: newTranslation.trim(),
      partOfSpeech: newPos,
      strength: 0,
      lastAppearedAt: undefined, // Freshly added -> immediately eligible (> 24h)
    });

    setNewWord("");
    setNewTranslation("");
    setShowAddForm(false);
  };

  return (
    <div
      id="vocab-modal-overlay"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        id="vocab-modal-container"
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-stone-900 flex items-center gap-1.5">
                  Bộ sưu tập từ & cụm từ
                  <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold border border-stone-200">
                    {collection.length}
                  </span>
                </h2>
                <span
                  id="badge-indexeddb-indicator"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md"
                  title="Dữ liệu được lưu an toàn trong IndexedDB của trình duyệt"
                >
                  <Database className="w-3 h-3 text-emerald-600" />
                  <span>IndexedDB</span>
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Quy tắc giãn cách 24 giờ (SRS Spaced Repetition)
              </p>
            </div>
          </div>
          <button
            id="btn-close-vocab-modal"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-xl border border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-stone-100 flex items-center justify-center active:scale-95 transition"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 24-Hour Recency Rule Explainer & Live Status Banner */}
        <div className="p-4 bg-stone-50 border-b border-stone-200 text-xs">
          <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-white border border-stone-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-base">🎯</span>
              <div>
                <p className="font-bold text-stone-900">
                  Chế độ sinh câu tiếp theo:
                </p>
                <p className="text-[11px] text-stone-600">
                  {eligibleCount > 0
                    ? `Mode A: Ưu tiên ${eligibleCount} từ trong bộ sưu tập (>24h)`
                    : `Mode B: Tự động chuyển sang từ hội thoại thường ngày`}
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                eligibleCount > 0
                  ? "bg-blue-50 text-blue-800 border-blue-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}
            >
              {eligibleCount > 0 ? "Mode A (Bộ sưu tập)" : "Mode B (Hội thoại)"}
            </span>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                filter === "all"
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              Tất cả ({collection.length})
            </button>
            <button
              onClick={() => setFilter("eligible")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                filter === "eligible"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-white text-emerald-700 border border-stone-200 hover:bg-emerald-50"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Sẵn sàng &gt; 24h ({eligibleCount})
            </button>
            <button
              onClick={() => setFilter("cooldown")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                filter === "cooldown"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-white text-amber-700 border border-stone-200 hover:bg-amber-50"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Chờ hồi phục &lt; 24h ({cooldownCount})
            </button>
          </div>
        </div>

        {/* Add Word Button / Form */}
        <div className="px-4 pt-3">
          {!showAddForm ? (
            <button
              id="btn-show-add-vocab"
              onClick={() => setShowAddForm(true)}
              className="w-full min-h-[44px] rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-98"
            >
              <Plus className="w-4 h-4" />
              Thêm từ hoặc cụm từ mới vào bộ sưu tập
            </button>
          ) : (
            <form
              onSubmit={handleCreate}
              className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col gap-2.5 text-xs animate-in fade-in"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Thêm từ mới
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-stone-400 hover:text-stone-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Từ/cụm từ tiếng Anh (ví dụ: get over, tweak)"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  className="p-2.5 rounded-xl bg-white border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Nghĩa tiếng Việt (ví dụ: vượt qua, tinh chỉnh)"
                  value={newTranslation}
                  onChange={(e) => setNewTranslation(e.target.value)}
                  className="p-2.5 rounded-xl bg-white border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <select
                  value={newPos}
                  onChange={(e) => setNewPos(e.target.value)}
                  className="p-2 rounded-xl bg-white border border-stone-300 text-stone-700"
                >
                  <option value="phrase">Cụm từ (phrase)</option>
                  <option value="idiom">Thành ngữ (idiom)</option>
                  <option value="noun">Danh từ (noun)</option>
                  <option value="verb">Động từ (verb)</option>
                  <option value="adjective">Tính từ (adjective)</option>
                </select>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-stone-600 hover:bg-stone-100 font-medium"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs active:scale-95 transition"
                  >
                    Lưu vào bộ sưu tập
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Vocab Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500">
              Không có từ vựng nào thỏa mãn điều kiện lọc.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isEligible = isItemEligibleForReview(item);
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl border transition flex flex-col gap-2 ${
                    isEligible
                      ? "bg-white border-stone-200 shadow-2xs hover:border-emerald-300"
                      : "bg-stone-50/80 border-stone-200 opacity-90"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-stone-900">
                          {item.word}
                        </span>
                        {item.partOfSpeech && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-medium border border-stone-200">
                            {item.partOfSpeech}
                          </span>
                        )}
                        {onPlayAudio && (
                          <button
                            onClick={() => onPlayAudio(item.word, "en-US")}
                            className="text-stone-400 hover:text-stone-700"
                            title="Nghe phát âm"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-stone-600 mt-0.5">
                        {item.translation}
                      </p>
                    </div>

                    {/* Status Pill */}
                    <div className="flex items-center gap-1.5">
                      {isEligible ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Sẵn sàng (&gt;24h)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          {getTimeUntilReview(item)}
                        </span>
                      )}

                      <button
                        onClick={() => onDeleteVocab(item.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                        title="Xóa từ này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* SRS Strength bar & Cooldown Reset button for testing */}
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-stone-100 text-[11px] text-stone-500">
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-semibold text-stone-700">
                        Độ nhớ: {item.strength}%
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-stone-100 border border-stone-200 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${item.strength}%` }}
                        />
                      </div>
                    </div>

                    {!isEligible && (
                      <button
                        onClick={() => onResetCooldown(item.id)}
                        className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold underline active:scale-95 transition"
                        title="Đặt lại thời gian xuất hiện > 24h để kiểm tra thử thách ngay"
                      >
                        Mở khóa ngay (&gt;24h)
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs">
          <button
            onClick={onResetAllDefault}
            className="flex items-center gap-1.5 text-stone-500 hover:text-stone-900 font-medium py-1 px-2 rounded-lg hover:bg-stone-200/50 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Khôi phục bộ từ mẫu
          </button>

          <button
            onClick={onClose}
            className="min-h-[42px] px-5 rounded-xl bg-stone-900 hover:bg-black text-white font-bold text-xs shadow-xs active:scale-95 transition"
          >
            Đóng & Bắt đầu luyện
          </button>
        </div>
      </div>
    </div>
  );
}
