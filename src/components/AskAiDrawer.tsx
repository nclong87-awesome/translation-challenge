import React, { useState, useRef } from "react";
import { X, Send, Bot, Sparkles, Volume2 } from "lucide-react";
import { ChallengeData } from "../types";
import { askAiTutor } from "../services/apiClient";
import { EstimatedResponseProgress } from "./EstimatedResponseProgress";
import { RetryCountdownBanner } from "./RetryCountdownBanner";

interface AskAiDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  challenge: ChallengeData;
  userTranslation?: string;
  isAnswerRevealed?: boolean;
  onPlayAudio?: (text: string, lang: string) => void;
}

interface Message {
  sender: "user" | "ai";
  text: string;
  suggestedFollowUps?: string[];
}

export function AskAiDrawer({
  isOpen,
  onClose,
  challenge,
  userTranslation,
  isAnswerRevealed = false,
  onPlayAudio,
}: AskAiDrawerProps) {
  const [inputQuestion, setInputQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSpoiledTranslation, setShowSpoiledTranslation] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedModel, setFailedModel] = useState<string | undefined>(undefined);
  const [lastQuery, setLastQuery] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "ai",
      text: `Xin chào! Tôi là gia sư AI của bạn cho câu: **"${challenge.nativeSentence}"**.\n\n${
        isAnswerRevealed
          ? `Chúng ta đã xem xong kết quả bài làm! Bạn có thắc mắc gì về ngữ pháp, các cách dịch tương đương hay từ vựng trong ngữ cảnh **"${challenge.topicContext || "giao tiếp"}"** không?`
          : `Bạn đang suy nghĩ cách dịch câu này? Hãy hỏi tôi về gợi ý từ vựng, cấu trúc câu hoặc cách diễn đạt tự nhiên nhé!`
      }`,
      suggestedFollowUps: isAnswerRevealed
        ? [
            "Tại sao lại dùng từ vựng này?",
            "Phân tích cấu trúc ngữ pháp câu này giúp tôi",
            "Có cách nói nào thân mật hơn không?",
          ]
        : [
            "Gợi ý từ vựng quan trọng cho câu này",
            "Nên áp dụng cấu trúc ngữ pháp nào?",
            "Gợi ý cách mở đầu câu dịch",
          ],
    },
  ]);

  // Reset messages and state when challenge or reveal state changes
  React.useEffect(() => {
    setShowSpoiledTranslation(false);
    setErrorMessage(null);
    setMessages([
      {
        sender: "ai",
        text: `Xin chào! Tôi là gia sư AI của bạn cho câu: **"${challenge.nativeSentence}"**.\n\n${
          isAnswerRevealed
            ? `Chúng ta đã xem xong kết quả bài làm! Bạn có thắc mắc gì về ngữ pháp, các cách dịch tương đương hay từ vựng trong ngữ cảnh **"${challenge.topicContext || "giao tiếp"}"** không?`
            : `Bạn đang suy nghĩ cách dịch câu này? Hãy hỏi tôi về gợi ý từ vựng, cấu trúc câu hoặc cách diễn đạt tự nhiên nhé!`
        }`,
        suggestedFollowUps: isAnswerRevealed
          ? [
              "Tại sao lại dùng từ vựng này?",
              "Phân tích cấu trúc ngữ pháp câu này giúp tôi",
              "Có cách nói nào thân mật hơn không?",
            ]
          : [
              "Gợi ý từ vựng quan trọng cho câu này",
              "Nên áp dụng cấu trúc ngữ pháp nào?",
              "Gợi ý cách mở đầu câu dịch",
            ],
      },
    ]);
  }, [challenge.id, challenge.nativeSentence, isAnswerRevealed]);

  if (!isOpen) return null;

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("User cancelled ask-ai request");
      abortControllerRef.current = null;
    }
    setLoading(false);
  };

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || inputQuestion;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = { sender: "user", text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion("");
    setLoading(true);
    setErrorMessage(null);
    setFailedModel(undefined);
    setLastQuery(textToSend);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await askAiTutor(challenge, textToSend, userTranslation, {
        abortSignal: controller.signal,
        action: "Gia sư AI phản hồi",
      });
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: res.answer,
          suggestedFollowUps: res.suggestedFollowUps,
        },
      ]);
      setErrorMessage(null);
      setFailedModel(undefined);
    } catch (err: any) {
      if (controller.signal.aborted || err.name === "AbortError") {
        return;
      }
      setErrorMessage(err?.message || "Không thể kết nối với gia sư AI");
      setFailedModel(err?.failedModel);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div
      id="ask-ai-overlay"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex justify-end"
      onClick={onClose}
    >
      <div
        id="ask-ai-panel"
        className="w-full max-w-md bg-stone-50 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white px-4 py-3.5 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                Gia sư AI <span>•</span> <span className="text-xs font-normal text-emerald-700">Giải đáp ngữ cảnh</span>
              </h3>
              <p className="text-[11px] text-stone-500 truncate max-w-[240px]">
                {challenge.topicContext ? `Tình huống: ${challenge.topicContext}` : "Hỏi đáp mọi thắc mắc"}
              </p>
            </div>
          </div>
          <button
            id="btn-close-ask-ai"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-stone-100 flex items-center justify-center active:scale-95 transition"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current challenge summary mini-card */}
        <div className="bg-emerald-50/60 border-b border-emerald-100 p-3 text-xs text-stone-700">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 mb-0.5">
            Đang thảo luận câu:
          </p>
          <p className="font-semibold text-stone-900 italic">"{challenge.nativeSentence}"</p>
          {challenge.idealTranslation && (
            isAnswerRevealed || showSpoiledTranslation ? (
              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-emerald-200/60 text-emerald-900 font-medium">
                <span>➔ "{challenge.idealTranslation}"</span>
                {onPlayAudio && (
                  <button
                    onClick={() => onPlayAudio(challenge.idealTranslation!, "en-US")}
                    className="text-emerald-700 hover:text-emerald-900 p-1"
                    title="Nghe phát âm câu mẫu"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-stone-500">
                <span>Chưa nộp bài: Bạn có thể hỏi gợi ý, từ vựng hoặc cấu trúc câu.</span>
                <button
                  type="button"
                  onClick={() => setShowSpoiledTranslation(true)}
                  className="text-[10px] text-emerald-700 hover:underline font-semibold shrink-0 ml-2"
                >
                  Xem đáp án mẫu
                </button>
              </div>
            )
          )}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                msg.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-emerald-600 text-white font-medium"
                    : "bg-white text-stone-800 border border-stone-200 shadow-2xs whitespace-pre-line"
                }`}
              >
                {msg.text}
              </div>

              {/* Suggested follow-up chips */}
              {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 max-w-[90%]">
                  {msg.suggestedFollowUps.map((chip, chipIdx) => (
                    <button
                      key={chipIdx}
                      onClick={() => handleSend(chip)}
                      disabled={loading}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 active:scale-95 transition text-left"
                    >
                      💡 {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Real-time Estimated Progress Indicator during loading */}
          {loading && (
            <div className="w-full my-2">
              <EstimatedResponseProgress
                actionLabel="Gia sư AI đang phân tích & trả lời"
                onAbort={handleAbort}
              />
            </div>
          )}

          {/* Tier 3 Retry Countdown Banner on failure */}
          {errorMessage && (
            <div className="w-full my-2">
              <RetryCountdownBanner
                errorMessage={errorMessage}
                failedModel={failedModel}
                onRetry={() => handleSend(lastQuery)}
                onDismiss={() => {
                  setErrorMessage(null);
                  setFailedModel(undefined);
                }}
              />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="bg-white p-3 border-t border-stone-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              id="input-ask-ai"
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              placeholder="Đặt câu hỏi về câu dịch này..."
              disabled={loading}
              className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-stone-50 border border-stone-300 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
            <button
              id="btn-send-ask-ai"
              type="submit"
              disabled={loading || !inputQuestion.trim()}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition disabled:opacity-40 flex items-center justify-center shadow-xs"
              aria-label="Gửi câu hỏi"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
