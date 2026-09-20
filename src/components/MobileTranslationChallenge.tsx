import React, { useState, useEffect, useRef } from "react";
import {
  Volume2,
  Sparkles,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Award,
  Zap,
  KeyRound,
  Activity,
  History,
  SlidersHorizontal,
} from "lucide-react";
import {
  ChallengeData,
  ChallengeTurnResult,
  UserVocabItem,
} from "../types";
import { generateChallenge, evaluateChallengeTurn } from "../services/apiClient";
import {
  initializeVocabDB,
  saveAllVocab,
  saveVocabItem,
  deleteVocabItem,
  resetVocabToDefault,
} from "../services/vocabDb";
import { INITIAL_USER_VOCAB } from "../data/initialVocab";
import { isItemEligibleForReview } from "../services/candidateSelector";
import { AskAiDrawer } from "./AskAiDrawer";
import { VocabCollectionModal } from "./VocabCollectionModal";
import { ProxySettingsModal } from "./ProxySettingsModal";
import { ProxyDashboardModal } from "./ProxyDashboardModal";
import { ApiAuditLogModal } from "./ApiAuditLogModal";
import { EstimatedResponseProgress } from "./EstimatedResponseProgress";
import { RetryCountdownBanner } from "./RetryCountdownBanner";

interface MobileTranslationChallengeProps {
  accessKey?: string | null;
  isSampleMode?: boolean;
  onChangeAccessKey?: () => void;
  onClearAccessKey?: () => void;
}

export function MobileTranslationChallenge({
  accessKey,
  isSampleMode = false,
  onChangeAccessKey,
  onClearAccessKey,
}: MobileTranslationChallengeProps = {}) {
  const [collection, setCollection] = useState<UserVocabItem[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [userTranslation, setUserTranslation] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ChallengeTurnResult | null>(null);
  const [showClues, setShowClues] = useState(false);
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [isVocabModalOpen, setIsVocabModalOpen] = useState(false);
  const [isProxySettingsOpen, setIsProxySettingsOpen] = useState(false);
  const [isProxyDashboardOpen, setIsProxyDashboardOpen] = useState(false);
  const [isAuditLogsOpen, setIsAuditLogsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeFailedModel, setChallengeFailedModel] = useState<string | undefined>(undefined);
  const [challengeRetryCount, setChallengeRetryCount] = useState<number>(0);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalFailedModel, setEvalFailedModel] = useState<string | undefined>(undefined);
  const [evalRetryCount, setEvalRetryCount] = useState<number>(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const challengeAbortControllerRef = useRef<AbortController | null>(null);
  const evalAbortControllerRef = useRef<AbortController | null>(null);

  // Detect virtual keyboard open state on mobile viewports
  useEffect(() => {
    if (!window.visualViewport) return;
    const handleResize = () => {
      if (!window.visualViewport) return;
      const heightDiff = window.innerHeight - window.visualViewport.height;
      setIsKeyboardOpen(heightDiff > 120);
    };
    window.visualViewport.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  // Sync collection to IndexedDB
  useEffect(() => {
    if (isDbLoaded) {
      saveAllVocab(collection);
    }
  }, [collection, isDbLoaded]);

  // Load collection from IndexedDB & initial challenge
  useEffect(() => {
    let isMounted = true;
    initializeVocabDB()
      .then((items) => {
        if (!isMounted) return;
        setCollection(items);
        setIsDbLoaded(true);
        loadNewChallenge(items);
      })
      .catch((err) => {
        console.error("Failed to load IndexedDB collection:", err);
        if (!isMounted) return;
        setIsDbLoaded(true);
        loadNewChallenge([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const loadNewChallenge = async (currentCollection = collection) => {
    if (challengeAbortControllerRef.current) {
      challengeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    challengeAbortControllerRef.current = controller;

    setLoading(true);
    setChallengeError(null);
    setChallengeFailedModel(undefined);
    setResult(null);
    setUserTranslation("");
    setShowClues(false);
    try {
      const data = await generateChallenge(currentCollection, {
        abortSignal: controller.signal,
        action: "Tạo thử thách dịch thuật",
      });
      setChallenge(data);
      setChallengeError(null);
      setChallengeFailedModel(undefined);
      setChallengeRetryCount(0);
    } catch (err: any) {
      if (controller.signal.aborted || err.name === "AbortError") {
        return;
      }
      console.error("Failed to load challenge", err);
      const msg = err?.message || "Không thể tải thử thách mới.";
      setChallengeError(msg);
      setChallengeFailedModel(err?.failedModel);
      setChallengeRetryCount((prev) => prev + 1);
      showToast(msg);
    } finally {
      if (challengeAbortControllerRef.current === controller) {
        setLoading(false);
        challengeAbortControllerRef.current = null;
      }
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  };

  const handleAbortChallengeGeneration = () => {
    if (challengeAbortControllerRef.current) {
      challengeAbortControllerRef.current.abort("User cancelled generation");
      challengeAbortControllerRef.current = null;
    }
    setLoading(false);
  };

  const handleSubmit = async (overrideText?: string) => {
    if (!challenge || submitting) return;
    const textToSend = overrideText !== undefined ? overrideText : userTranslation;

    if (evalAbortControllerRef.current) {
      evalAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    evalAbortControllerRef.current = controller;

    setSubmitting(true);
    setEvalError(null);
    setEvalFailedModel(undefined);

    try {
      const res = await evaluateChallengeTurn(challenge, textToSend, {
        abortSignal: controller.signal,
        action: "Chấm câu & phân tích dịch thuật",
      });
      setResult(res);
      setEvalError(null);
      setEvalFailedModel(undefined);
      setEvalRetryCount(0);

      // Handle incomplete draft suggestion
      if (res.intent === "incomplete") {
        const draft = res.suggestedActions?.find((a) => a.action === "repopulate_input")?.payload?.text;
        if (draft) {
          setUserTranslation(draft);
        }
      } else if (res.intent === "submission" && res.evaluation) {
        // Apply SRS Augmentation to collection atomically
        const targetWord = challenge.targetWordFromCollection?.word?.toLowerCase();
        const gained = res.evaluation.targetWordStrengthGained || (res.evaluation.incorporatedTargetWord ? 30 : 10);

        setCollection((prev) => {
          let found = false;
          const updated = prev.map((item) => {
            if (item.word.toLowerCase() === targetWord) {
              found = true;
              return {
                ...item,
                strength: Math.min(100, item.strength + gained),
                lastAppearedAt: new Date().toISOString(), // Stamp 24-hour recency
              };
            }
            return item;
          });

          // If it was a daily conversation fallback item or new, optionally record it
          if (!found && challenge.targetWordFromCollection) {
            updated.push({
              id: `vocab-${Date.now()}`,
              word: challenge.targetWordFromCollection.word,
              translation: challenge.targetWordFromCollection.translation || "",
              definition: challenge.targetWordFromCollection.definition,
              partOfSpeech: challenge.targetWordFromCollection.partOfSpeech || "phrase",
              strength: Math.min(100, gained),
              lastAppearedAt: new Date().toISOString(),
              addedAt: new Date().toISOString(),
            });
          }

          return updated;
        });
      }
    } catch (err: any) {
      if (controller.signal.aborted || err.name === "AbortError") {
        return;
      }
      console.error("Evaluation error", err);
      const msg = err?.message || "Có lỗi khi chấm bài, vui lòng thử lại.";
      setEvalError(msg);
      setEvalFailedModel(err?.failedModel);
      setEvalRetryCount((prev) => prev + 1);
      showToast(msg);
    } finally {
      if (evalAbortControllerRef.current === controller) {
        setSubmitting(false);
        evalAbortControllerRef.current = null;
      }
    }
  };

  const handleAbortEvaluation = () => {
    if (evalAbortControllerRef.current) {
      evalAbortControllerRef.current.abort("User cancelled evaluation");
      evalAbortControllerRef.current = null;
    }
    setSubmitting(false);
  };

  const playAudio = (text: string, lang = "en-US") => {
    if (!("speechSynthesis" in window)) {
      showToast("Trình duyệt không hỗ trợ phát âm tự động.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  const handleAddVocabToCollection = (vocab: { word: string; translation: string; definition?: string; partOfSpeech?: string }) => {
    const exists = collection.some((item) => item.word.toLowerCase() === vocab.word.toLowerCase());
    if (exists) {
      showToast(`Từ "${vocab.word}" đã có trong bộ sưu tập của bạn!`);
      return;
    }

    const newItem: UserVocabItem = {
      id: `vocab-${Date.now()}`,
      word: vocab.word,
      translation: vocab.translation,
      definition: vocab.definition,
      partOfSpeech: vocab.partOfSpeech || "phrase",
      strength: 0,
      lastAppearedAt: undefined, // Eligible immediately (> 24 hours)
      addedAt: new Date().toISOString(),
    };

    setCollection((prev) => [newItem, ...prev]);
    saveVocabItem(newItem);
    showToast(`Đã lưu "${vocab.word}" vào bộ sưu tập cá nhân! ⭐`);
  };

  const handleResetCooldown = (id: string) => {
    setCollection((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              // Set lastAppearedAt to 2 days ago so it becomes instantly eligible (>24h)
              lastAppearedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            }
          : item
      )
    );
    showToast("Đã mở khóa từ này (> 24 giờ) để ưu tiên kiểm tra!");
  };

  const handleResetAllDefault = async () => {
    try {
      const defaults = await resetVocabToDefault();
      setCollection(defaults);
      showToast("Đã khôi phục danh sách từ vựng mẫu ban đầu trong IndexedDB!");
    } catch (err) {
      console.error("Failed to reset defaults:", err);
      setCollection(INITIAL_USER_VOCAB);
      showToast("Đã khôi phục danh sách từ vựng mẫu ban đầu!");
    }
  };

  const eligibleCount = collection.filter((item) => isItemEligibleForReview(item)).length;

  return (
    <main className="max-w-md mx-auto w-full min-h-[100dvh] bg-stone-100 text-stone-900 flex flex-col justify-between font-sans antialiased selection:bg-emerald-200">
      {/* Toast notification */}
      {toastMessage && (
        <div
          id="toast-notification"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar: Topic & Collection Source Indicator */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md px-4 py-3 border-b border-stone-200/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
            TC
          </div>
          <div className="truncate">
            <h1 className="text-xs font-bold text-stone-900 truncate">
              Thử thách Dịch thuật
            </h1>
            <p className="text-[10px] text-stone-500 truncate">
              Tiếng Việt ➔ Tiếng Anh
            </p>
          </div>
        </div>

        {/* Right side controls: Access Key & Collection */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onChangeAccessKey && (
            <button
              id="btn-open-access-key-settings"
              type="button"
              onClick={onChangeAccessKey}
              className={`h-[38px] px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition active:scale-95 border ${
                isSampleMode
                  ? "bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900"
                  : "bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200"
              }`}
              title={
                isSampleMode
                  ? "Đang dùng chế độ mẫu (Mocked LLM). Nhấn để nhập mã truy cập chính thức."
                  : "Quản lý mã truy cập (Access Key)"
              }
            >
              {isSampleMode ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-[11px] font-bold">Bản mẫu</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="hidden xs:inline text-[11px] text-stone-600">Khóa</span>
                </>
              )}
            </button>
          )}

          {/* Collection & Due count toggle */}
          <button
            id="btn-open-collection"
            type="button"
            onClick={() => setIsVocabModalOpen(true)}
            className="min-h-[38px] px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 border border-stone-200"
            title="Xem bộ sưu tập từ vựng & quy tắc 24 giờ"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600" />
            <span>Bộ từ</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-100 text-emerald-800 font-extrabold">
              {eligibleCount}
            </span>
          </button>
        </div>
      </header>

      {/* Cloudflare Workers LLM Proxy Control Strip */}
      <div className="bg-stone-50 border-b border-stone-200/80 px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsProxyDashboardOpen(true)}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200/80 font-medium text-[11px] transition"
            title="Xem trạng thái bộ định tuyến và circuit breaker Cloudflare Worker"
          >
            <Zap className="w-3 h-3 text-orange-500 fill-orange-500" />
            <span>Cloudflare LLM Proxy</span>
          </button>
          {challenge?.provider && challenge.provider !== "sample" && (
            <span className="hidden xs:inline-block text-[10px] font-mono text-stone-500 px-1.5 py-0.5 bg-stone-200/60 rounded">
              {challenge.provider}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsProxyDashboardOpen(true)}
            className="p-1 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-200/60 transition"
            title="Bảng điều khiển sức khỏe mô hình & Circuit Breaker"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
          </button>
          <button
            type="button"
            onClick={() => setIsAuditLogsOpen(true)}
            className="p-1 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-200/60 transition"
            title="Xem lịch sử API Request Logs (IndexedDB)"
          >
            <History className="w-3.5 h-3.5 text-blue-600" />
          </button>
          <button
            type="button"
            onClick={() => setIsProxySettingsOpen(true)}
            className="p-1 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-200/60 transition"
            title="Cài đặt nhà cung cấp & Khóa truy cập"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-stone-600" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-3.5 sm:p-4 flex flex-col gap-3.5 overflow-y-auto">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-stone-600 gap-4 min-h-[320px]">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-stone-500">
              {eligibleCount > 0
                ? "Đang chọn từ trong bộ sưu tập cá nhân (>24h)..."
                : "Đang chọn câu hội thoại thường ngày tự nhiên..."}
            </p>
          </div>
        ) : challengeError ? (
          <EstimatedResponseProgress
            asModal={true}
            error={{
              errorMessage: challengeError,
              failedModel: challengeFailedModel,
              retryCount: challengeRetryCount,
              maxRetries: 3,
              onRetry: () => loadNewChallenge(),
              onDismiss: () => {
                setChallengeError(null);
                setChallengeFailedModel(undefined);
                setChallengeRetryCount(0);
              },
            }}
          />
        ) : !challenge ? (
          <div className="p-8 text-center text-xs text-stone-500">
            Không tìm thấy dữ liệu thử thách.
          </div>
        ) : (
          <>
            {/* Context & Source Mode Badges */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span
                id="badge-topic-context"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-2xs"
              >
                🎯 {challenge.topicContext || "Tình huống đời sống"}
              </span>

              <span
                id="badge-mode-indicator"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                  challenge.isDailyConversationFallback
                    ? "bg-amber-50 text-amber-900 border-amber-200"
                    : "bg-blue-50 text-blue-900 border-blue-200"
                }`}
                title={
                  challenge.isDailyConversationFallback
                    ? "Bộ sưu tập của bạn chưa có từ nào quá 24h, hệ thống tự động dùng từ hội thoại phổ biến"
                    : "Từ này được lấy từ bộ sưu tập cá nhân của bạn do đã hơn 24 giờ chưa ôn tập"
                }
              >
                {challenge.isDailyConversationFallback ? (
                  <>💬 Hội thoại thường ngày</>
                ) : (
                  <>📚 Bộ sưu tập (&gt;24h)</>
                )}
              </span>
            </div>

            {/* Vietnamese Prompt Card */}
            <section
              id="card-native-sentence"
              className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs relative overflow-hidden flex flex-col gap-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold tracking-wide text-stone-600 uppercase whitespace-nowrap truncate">
                  Dịch sang tiếng Anh:
                </span>
                <button
                  id="btn-play-native-audio"
                  onClick={() => playAudio(challenge.nativeSentence, "vi-VN")}
                  className="min-w-[36px] min-h-[36px] rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center active:scale-95 transition"
                  title="Nghe phát âm câu tiếng Việt"
                  aria-label="Phát âm câu tiếng Việt"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              <p className="text-lg sm:text-xl font-extrabold text-stone-900 leading-snug tracking-tight">
                "{challenge.nativeSentence}"
              </p>

              {/* Ask AI Tutor Button in Challenge Question */}
              <div className="pt-2.5 border-t border-stone-100">
                <button
                  id="btn-open-ask-ai"
                  onClick={() => setIsAskAiOpen(true)}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 text-xs font-bold flex items-center justify-center gap-2 active:scale-98 transition shadow-2xs"
                  title="Hỏi gia sư AI về câu hỏi này"
                >
                  <Bot className="w-4 h-4 text-emerald-700" />
                  <span>Hỏi gia sư AI về câu này (Gợi ý, ngữ pháp)</span>
                </button>
              </div>
            </section>

            {/* Expandable Clues Accordion */}
            {challenge.keyTargetWords && challenge.keyTargetWords.length > 0 && (
              <section
                id="accordion-clues"
                className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden"
              >
                <button
                  id="btn-toggle-clues"
                  onClick={() => setShowClues((prev) => !prev)}
                  className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between text-xs font-bold text-stone-700 hover:bg-stone-50 active:bg-stone-100 transition"
                >
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                    Gợi ý từ vựng hữu ích ({challenge.keyTargetWords.length})
                  </span>
                  <span className="text-stone-400 flex items-center gap-1 text-[11px]">
                    {showClues ? (
                      <>
                        Thu gọn <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        Xem gợi ý <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </span>
                </button>

                {showClues && (
                  <div className="p-3.5 pt-1 border-t border-stone-100 flex flex-wrap gap-2">
                    {challenge.keyTargetWords.map((item, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs"
                      >
                        <span className="font-bold text-stone-900">
                          {item.word}
                        </span>
                        <span className="text-stone-500">
                          — {item.translation}
                        </span>
                        <button
                          onClick={() => playAudio(item.word, "en-US")}
                          className="text-stone-400 hover:text-stone-800 p-0.5 ml-0.5"
                          title="Nghe phát âm"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Incomplete Submission Warning Card */}
            {result?.intent === "incomplete" && (
              <section
                id="banner-incomplete"
                className="bg-amber-50 border-2 border-amber-300/80 rounded-2xl p-4 text-xs text-amber-950 flex flex-col gap-2.5 animate-in fade-in"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-amber-900 text-sm">
                      Có vẻ như bạn đã gửi câu khi chưa gõ xong!
                    </p>
                    <p className="text-amber-800 mt-0.5">
                      {result.agentReply ||
                        "Hệ thống đã giữ lại bản nháp để bạn tiếp tục hoàn thành câu dịch."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  {result.suggestedActions?.map((action, aIdx) => (
                    <button
                      key={aIdx}
                      onClick={() => {
                        if (action.action === "repopulate_input" && action.payload?.text) {
                          setUserTranslation(action.payload.text);
                          textareaRef.current?.focus();
                        } else if (action.action === "submit_empty_challenge") {
                          handleSubmit("skip");
                        }
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-white text-amber-900 border border-amber-300 hover:bg-amber-100/50 shadow-2xs active:scale-95 transition"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Evaluation Result View */}
            {result?.evaluation && (
              <section
                id="card-evaluation"
                className="bg-white rounded-3xl p-5 border border-stone-200 shadow-sm flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-3 duration-200"
              >
                {/* Score Banner & SRS Points */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl text-xs font-extrabold text-white shadow-2xs ${
                      result.evaluation.score >= 85
                        ? "bg-emerald-600"
                        : result.evaluation.score >= 60
                        ? "bg-amber-600"
                        : "bg-stone-700"
                    }`}
                  >
                    <Award className="w-4 h-4" />
                    <span>
                      {result.evaluation.score}/100 • {result.evaluation.scoreLabel}
                    </span>
                  </div>

                  {/* SRS Point Bonus Badge */}
                  <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-extrabold">
                    <Zap className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      +{result.evaluation.targetWordStrengthGained || (result.evaluation.incorporatedTargetWord ? 30 : 10)} Điểm SRS
                    </span>
                  </div>
                </div>

                {/* Target Word Incorporation Check */}
                {result.evaluation.targetWordUsed && (
                  <div className="text-xs p-2.5 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                    <span className="text-stone-600">
                      Từ vựng mục tiêu:{" "}
                      <strong className="text-stone-900">
                        {result.evaluation.targetWordUsed}
                      </strong>
                    </span>
                    {result.evaluation.incorporatedTargetWord ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã vận dụng (+30)
                      </span>
                    ) : (
                      <span className="text-stone-500 font-medium">
                        Điểm tiếp xúc (+10)
                      </span>
                    )}
                  </div>
                )}

                {/* Incorporated Clue Words Display */}
                {result.evaluation.incorporatedVocabClues &&
                  result.evaluation.incorporatedVocabClues.length > 0 && (
                    <div className="text-xs p-2.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-emerald-900 font-medium flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        Từ gợi ý đã vận dụng:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {result.evaluation.incorporatedVocabClues.map((clue, cIdx) => (
                          <span
                            key={cIdx}
                            className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 text-[11px] font-bold"
                          >
                            ✓ {clue}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Side-by-side or stacked translations */}
                <div className="space-y-2.5">
                  <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-200">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-0.5">
                      Bản dịch của bạn:
                    </p>
                    <p className="text-sm font-semibold text-stone-800 italic">
                      "{result.evaluation.userTranslation || "(Chưa nhập câu trả lời)"}"
                    </p>
                  </div>

                  <div className="bg-emerald-50/80 rounded-2xl p-3.5 border border-emerald-200">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                        Bản dịch chuẩn & tự nhiên:
                      </p>
                      <button
                        id="btn-play-ideal-audio"
                        onClick={() =>
                          playAudio(result.evaluation!.correctedSentence, "en-US")
                        }
                        className="text-xs text-emerald-800 font-bold flex items-center gap-1 hover:text-emerald-950"
                      >
                        <Volume2 className="w-3.5 h-3.5" /> Nghe
                      </button>
                    </div>
                    <p className="text-sm font-extrabold text-emerald-950">
                      "{result.evaluation.correctedSentence}"
                    </p>
                  </div>
                </div>

                {/* Praise & Improvement Feedback */}
                <div className="bg-stone-50/70 rounded-2xl p-3.5 border border-stone-200 text-xs space-y-2">
                  <div>
                    <span className="font-bold text-emerald-800">🌟 Điểm tốt: </span>
                    <span className="text-stone-700">
                      {result.evaluation.whatWentWell}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-amber-800">💡 Góp ý: </span>
                    <span className="text-stone-700">
                      {result.evaluation.areasForImprovement}
                    </span>
                  </div>
                </div>

                {/* Suggested Vocabulary from sentence with one-tap add */}
                {result.evaluation.suggestedVocabulary &&
                  result.evaluation.suggestedVocabulary.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        Từ & cụm từ đáng lưu ý:
                      </p>
                      <div className="space-y-1.5">
                        {result.evaluation.suggestedVocabulary.map((v, i) => {
                          const alreadyIn = collection.some(
                            (c) => c.word.toLowerCase() === v.word.toLowerCase()
                          );
                          return (
                            <div
                              key={i}
                              className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs flex items-center justify-between gap-2"
                            >
                              <div className="truncate">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-stone-900">
                                    {v.word}
                                  </span>
                                  {v.partOfSpeech && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-200/70 text-stone-600 font-medium">
                                      {v.partOfSpeech}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => playAudio(v.word, "en-US")}
                                    className="text-stone-400 hover:text-stone-700"
                                  >
                                    <Volume2 className="w-3 h-3" />
                                  </button>
                                </div>
                                <p className="text-stone-500 text-[11px] truncate">
                                  {v.translation}
                                </p>
                              </div>

                              <button
                                onClick={() => handleAddVocabToCollection(v)}
                                disabled={alreadyIn}
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition active:scale-95 ${
                                  alreadyIn
                                    ? "bg-stone-200 text-stone-500 cursor-default"
                                    : "bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 shadow-2xs"
                                }`}
                              >
                                {alreadyIn ? "✓ Đã lưu" : "+ Lưu từ"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

              </section>
            )}
          </>
        )}
      </div>

      {/* Bottom Sticky Action Bar (Thumb-Level Mobile Ergonomics) */}
      <footer className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-md p-3.5 sm:p-4 border-t border-stone-200/80 flex flex-col gap-3 shadow-lg">
        {evalError && !submitting && (
          <EstimatedResponseProgress
            asModal={true}
            error={{
              errorMessage: evalError,
              failedModel: evalFailedModel,
              retryCount: evalRetryCount,
              maxRetries: 3,
              onRetry: () => handleSubmit(),
              onDismiss: () => {
                setEvalError(null);
                setEvalFailedModel(undefined);
                setEvalRetryCount(0);
              },
            }}
          />
        )}

        {!result?.evaluation ? (
          <>
            {/* Sentence reminder right above the text box when keyboard is open or textarea is focused */}
            {challenge && (isKeyboardOpen || isFocused) && (
              <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-2.5 flex items-center justify-between gap-2 shadow-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className="text-[11px] font-bold text-emerald-800 shrink-0">🇻🇳 Dịch câu:</span>
                  <p className="text-xs font-extrabold text-emerald-950 truncate">
                    "{challenge.nativeSentence}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => playAudio(challenge.nativeSentence, "vi-VN")}
                  className="p-1 rounded-xl bg-white hover:bg-emerald-100 text-emerald-800 shrink-0 transition shadow-2xs"
                  title="Nghe câu"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Input textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                id="input-translation"
                value={userTranslation}
                onChange={(e) => setUserTranslation(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (userTranslation.trim()) {
                      handleSubmit();
                    }
                  }
                }}
                placeholder="Gõ bản dịch tiếng Anh của bạn tại đây..."
                rows={3}
                disabled={submitting || loading}
                className="w-full p-3.5 rounded-2xl bg-stone-50 border border-stone-300 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent resize-none transition shadow-2xs"
              />

              {userTranslation && (
                <button
                  onClick={() => setUserTranslation("")}
                  className="absolute right-3 top-3 text-stone-400 hover:text-stone-600 text-xs font-medium"
                >
                  Xóa
                </button>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2.5">
              <button
                id="btn-skip-challenge"
                onClick={() => handleSubmit("skip")}
                disabled={submitting || loading}
                className="min-h-[48px] px-4 rounded-2xl border border-stone-300 bg-white text-stone-700 font-bold text-xs hover:bg-stone-100 active:scale-95 transition disabled:opacity-50 shadow-2xs"
              >
                🏳️ Xem đáp án
              </button>

              <button
                id="btn-submit-translation"
                onClick={() => handleSubmit()}
                disabled={submitting || loading || !userTranslation.trim()}
                className="flex-1 min-h-[48px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-sm shadow-md transition disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <span>Gửi bản dịch</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <button
            id="btn-next-challenge"
            onClick={() => loadNewChallenge(collection)}
            className="w-full min-h-[50px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-sm shadow-md transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Thử thách câu tiếp theo
          </button>
        )}
      </footer>

      {/* Ask AI Drawer Modal */}
      {challenge && (
        <AskAiDrawer
          isOpen={isAskAiOpen}
          onClose={() => setIsAskAiOpen(false)}
          challenge={challenge}
          userTranslation={userTranslation}
          isAnswerRevealed={Boolean(result?.evaluation)}
          onPlayAudio={playAudio}
        />
      )}

      {/* Vocabulary Collection Modal */}
      <VocabCollectionModal
        isOpen={isVocabModalOpen}
        onClose={() => setIsVocabModalOpen(false)}
        collection={collection}
        onAddVocab={(newItem) => {
          const item: UserVocabItem = {
            ...newItem,
            id: `vocab-${Date.now()}`,
            addedAt: new Date().toISOString(),
          };
          setCollection((prev) => [item, ...prev]);
          saveVocabItem(item);
          showToast(`Đã thêm "${item.word}" vào bộ sưu tập!`);
        }}
        onDeleteVocab={(id) => {
          setCollection((prev) => prev.filter((i) => i.id !== id));
          deleteVocabItem(id);
          showToast("Đã xóa khỏi bộ sưu tập.");
        }}
        onResetCooldown={handleResetCooldown}
        onResetAllDefault={handleResetAllDefault}
        onPlayAudio={playAudio}
      />

      {/* Cloudflare Proxy Settings Modal */}
      <ProxySettingsModal
        isOpen={isProxySettingsOpen}
        onClose={() => setIsProxySettingsOpen(false)}
        onSaved={() => {
          showToast("Đã lưu cấu hình Cloudflare LLM Proxy!");
        }}
      />

      {/* Cloudflare Proxy Dashboard Modal */}
      <ProxyDashboardModal
        isOpen={isProxyDashboardOpen}
        onClose={() => setIsProxyDashboardOpen(false)}
      />

      {/* API Audit Log Modal */}
      <ApiAuditLogModal
        isOpen={isAuditLogsOpen}
        onClose={() => setIsAuditLogsOpen(false)}
      />
    </main>
  );
}
