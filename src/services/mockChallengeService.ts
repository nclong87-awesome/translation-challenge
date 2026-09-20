import {
  ChallengeData,
  ChallengeTurnResult,
  UserVocabItem,
  AskAiResponse,
} from "../types";
import { selectChallengeCandidates } from "./candidateSelector";
import { llmEventBus } from "./llmEventBus";

export async function simulateSampleLlmCall<T>(
  actionName: string,
  provider: string,
  model: string,
  expectedDurationMs: number,
  taskFn: () => T,
  abortSignal?: AbortSignal
): Promise<T> {
  const requestId = `sample-req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = Date.now();
  const abortController = new AbortController();

  if (abortSignal) {
    if (abortSignal.aborted) {
      throw new DOMException("The user aborted a request.", "AbortError");
    }
    abortSignal.addEventListener("abort", () => {
      abortController.abort();
    });
  }

  llmEventBus.emitStart({
    requestId,
    provider,
    model,
    timestamp,
    expectedDurationMs,
    isAutoRouting: false,
    action: actionName,
    abortController,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve();
      }, expectedDurationMs);

      const abortHandler = () => {
        clearTimeout(timer);
        reject(new DOMException("The user aborted a request.", "AbortError"));
      };

      if (abortController.signal.aborted) {
        clearTimeout(timer);
        reject(new DOMException("The user aborted a request.", "AbortError"));
        return;
      }

      abortController.signal.addEventListener("abort", abortHandler, { once: true });
    });

    const durationMs = Date.now() - timestamp;
    llmEventBus.emitEnd({
      requestId,
      provider,
      model,
      durationMs,
      status: "success",
      action: actionName,
    });

    return taskFn();
  } catch (err: any) {
    const durationMs = Date.now() - timestamp;
    const isAborted = abortController.signal.aborted || err?.name === "AbortError";
    llmEventBus.emitEnd({
      requestId,
      provider,
      model,
      durationMs,
      status: isAborted ? "aborted" : "error",
      errorReason: err?.message || "Sample request aborted or failed",
      action: actionName,
    });
    throw err;
  }
}

// Dynamic pool of realistic challenges for collection candidates (Mode A)
const COLLECTION_CHALLENGES: ChallengeData[] = [
  {
    id: "challenge-collection-001",
    nativeSentence: "Dù gặp nhiều thất bại ban đầu, cô ấy vẫn giữ vững tinh thần kiên cường đáng khâm phục.",
    targetLanguage: "English",
    nativeLanguage: "Vietnamese",
    topicContext: "Ý chí & Vượt khó",
    idealTranslation: "Despite many initial setbacks, she maintained an admirable resilience.",
    targetWordFromCollection: {
      word: "resilience",
      translation: "sự kiên cường, khả năng phục hồi",
      definition: "The capacity to recover quickly from difficulties; toughness.",
      hint: "Danh từ chỉ ý chí bền bỉ vượt qua nghịch cảnh",
      strength: 25,
      lastAppearedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    keyTargetWords: [
      { word: "resilience", translation: "sự kiên cường", partOfSpeech: "noun" },
      { word: "setback", translation: "sự trở ngại, thất bại", partOfSpeech: "noun" },
      { word: "admirable", translation: "đáng khâm phục", partOfSpeech: "adjective" },
      { word: "maintain", translation: "duy trì, giữ vững", partOfSpeech: "verb" },
    ],
    isDailyConversationFallback: false,
    personalityNote: "Tình huống truyền cảm hứng giúp bạn thực hành từ vựng miêu tả ý chí và phẩm chất kiên trì.",
    createdAt: new Date().toISOString(),
    provider: "local-rule-engine",
    model: "mock-v1",
    responseTimeMs: 250,
  },
  {
    id: "challenge-collection-002",
    nativeSentence: "Chúng ta cần tinh chỉnh kế hoạch này một chút để thích nghi với tình hình thực tế mới.",
    targetLanguage: "English",
    nativeLanguage: "Vietnamese",
    topicContext: "Kế hoạch công việc",
    idealTranslation: "We need to tweak this plan slightly to adapt to the new reality.",
    targetWordFromCollection: {
      word: "tweak",
      translation: "tinh chỉnh, điều chỉnh nhỏ",
      definition: "To make fine adjustments or improvements.",
      hint: "Động từ biểu thị chỉnh sửa khéo léo một chi tiết nhỏ",
      strength: 40,
      lastAppearedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    keyTargetWords: [
      { word: "tweak", translation: "tinh chỉnh", partOfSpeech: "verb" },
      { word: "slightly", translation: "một chút", partOfSpeech: "adverb" },
      { word: "adapt to", translation: "thích nghi với", partOfSpeech: "phrase" },
      { word: "reality", translation: "thực tế", partOfSpeech: "noun" },
    ],
    isDailyConversationFallback: false,
    personalityNote: "Cách diễn đạt tự nhiên khi trao đổi với đồng nghiệp trong các buổi họp dự án.",
    createdAt: new Date().toISOString(),
    provider: "local-rule-engine",
    model: "mock-v1",
    responseTimeMs: 270,
  },
  {
    id: "challenge-collection-003",
    nativeSentence: "Anh ấy đã kể một câu chuyện cười vui vẻ để phá tan bầu không khí ngượng ngùng lúc đầu.",
    targetLanguage: "English",
    nativeLanguage: "Vietnamese",
    topicContext: "Giao tiếp buổi đầu",
    idealTranslation: "He told a funny joke to break the ice at the beginning of the meeting.",
    targetWordFromCollection: {
      word: "break the ice",
      translation: "phá tan bầu không khí ngượng ngùng",
      definition: "To do or say something that makes people who do not know each other feel more relaxed together.",
      hint: "Thành ngữ giao tiếp phổ biến khi mở đầu câu chuyện",
      strength: 15,
      lastAppearedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    },
    keyTargetWords: [
      { word: "break the ice", translation: "phá tan sự ngượng ngùng", partOfSpeech: "idiom" },
      { word: "joke", translation: "câu chuyện cười", partOfSpeech: "noun" },
      { word: "at the beginning", translation: "lúc đầu", partOfSpeech: "phrase" },
    ],
    isDailyConversationFallback: false,
    personalityNote: "Thành ngữ rất hữu ích khi networking, phỏng vấn hoặc gặp mặt đối tác lần đầu.",
    createdAt: new Date().toISOString(),
    provider: "local-rule-engine",
    model: "mock-v1",
    responseTimeMs: 240,
  },
];

// Fallback challenges using common daily conversational words and phrases (Mode B)
const DAILY_CONVERSATION_FALLBACK_CHALLENGES: ChallengeData[] = [
  {
    id: "challenge-daily-001",
    nativeSentence: "Cuối tuần này rảnh không? Tụi mình đi ăn nhanh một bữa rồi trò chuyện nhé!",
    targetLanguage: "English",
    nativeLanguage: "Vietnamese",
    topicContext: "Hẹn gặp bạn bè",
    idealTranslation: "Are you free this weekend? Let's grab a bite and catch up!",
    targetWordFromCollection: {
      word: "grab a bite",
      translation: "đi ăn nhanh một bữa",
      definition: "To get something to eat quickly, usually informal.",
      hint: "Cụm từ thân mật khi rủ ai đó đi ăn nhẹ",
      strength: 0,
    },
    keyTargetWords: [
      { word: "grab a bite", translation: "đi ăn nhanh một bữa", partOfSpeech: "phrase" },
      { word: "catch up", translation: "trò chuyện hàn huyên", partOfSpeech: "phrase" },
      { word: "free", translation: "rảnh rỗi", partOfSpeech: "adjective" },
    ],
    isDailyConversationFallback: true,
    personalityNote: "Cụm từ giao tiếp cực kỳ thông dụng khi rủ bạn bè hoặc đồng nghiệp đi ăn trưa.",
    createdAt: new Date().toISOString(),
    provider: "local-rule-engine",
    model: "mock-v1",
    responseTimeMs: 230,
  },
  {
    id: "challenge-daily-002",
    nativeSentence: "Bạn có thể để mắt tới hành lý của tôi một lát trong khi tôi đi mua nước được không?",
    targetLanguage: "English",
    nativeLanguage: "Vietnamese",
    topicContext: "Giao tiếp nơi công cộng",
    idealTranslation: "Could you keep an eye on my luggage for a moment while I go buy some water?",
    targetWordFromCollection: {
      word: "keep an eye on",
      translation: "để mắt tới, trông coi giúp",
      definition: "To watch or take care of something carefully.",
      hint: "Cụm động từ tự nhiên và lịch sự nhờ người khác trông đồ",
      strength: 0,
    },
    keyTargetWords: [
      { word: "keep an eye on", translation: "để mắt tới, trông coi", partOfSpeech: "phrase" },
      { word: "luggage", translation: "hành lý", partOfSpeech: "noun" },
      { word: "for a moment", translation: "một lát", partOfSpeech: "phrase" },
    ],
    isDailyConversationFallback: true,
    personalityNote: "Câu nhờ vả nhã nhặn dùng trong sân bay, quán cà phê hoặc nhà ga.",
    createdAt: new Date().toISOString(),
    provider: "local-rule-engine",
    model: "mock-v1",
    responseTimeMs: 250,
  },
  {
    id: "challenge-daily-003",
    nativeSentence: "Tôi vừa cạn sạch pin điện thoại rồi, bạn có mang theo sạc dự phòng không?",
    targetLanguage: "English",
    nativeLanguage: "Vietnamese",
    topicContext: "Mượn đồ đồng nghiệp",
    idealTranslation: "My phone just ran out of battery. Do you happen to have a power bank?",
    targetWordFromCollection: {
      word: "run out of",
      translation: "hết, cạn kiệt (pin, tiền, thời gian)",
      definition: "To finish, use, or have no more of something.",
      hint: "Cụm động từ chỉ tình trạng hết sạch nguồn cung",
      strength: 0,
    },
    keyTargetWords: [
      { word: "run out of", translation: "hết, cạn kiệt", partOfSpeech: "phrase" },
      { word: "power bank", translation: "sạc dự phòng", partOfSpeech: "noun" },
      { word: "happen to", translation: "tình cờ, có chăng", partOfSpeech: "phrase" },
    ],
    isDailyConversationFallback: true,
    personalityNote: "Tình huống đời thường ai cũng từng gặp ở quán cà phê hoặc văn phòng.",
    createdAt: new Date().toISOString(),
    provider: "local-rule-engine",
    model: "mock-v1",
    responseTimeMs: 220,
  },
];

export async function mockGenerateChallenge(
  userCollection: UserVocabItem[] = [],
  options?: { abortSignal?: AbortSignal; action?: string }
): Promise<ChallengeData> {
  return simulateSampleLlmCall(
    options?.action || "Tạo thử thách dịch thuật (Sample Mode)",
    "gemini-sample",
    "gemini-3.5-flash-sample",
    3500,
    () => {
      const { candidates, isDailyConversationFallback } = selectChallengeCandidates(userCollection);

      // If we have candidates from the collection, pick one and synthesize or pick matching
      if (!isDailyConversationFallback && candidates.length > 0) {
        const candidate = candidates[0];
        const match = COLLECTION_CHALLENGES.find(
          (c) => c.targetWordFromCollection?.word.toLowerCase() === candidate.word.toLowerCase()
        );

        if (match) {
          return {
            ...match,
            id: `challenge-${Date.now()}`,
            provider: "gemini-sample",
            model: "gemini-3.5-flash-sample",
            responseTimeMs: 3500,
            targetWordFromCollection: {
              ...match.targetWordFromCollection!,
              id: candidate.id,
              word: candidate.word,
              translation: candidate.translation,
              definition: candidate.definition || match.targetWordFromCollection?.definition,
              strength: candidate.strength,
              lastAppearedAt: candidate.lastAppearedAt,
            },
            createdAt: new Date().toISOString(),
          };
        }

        // Synthesize a natural conversational challenge tailored to this custom collection item
        return {
          id: `challenge-${Date.now()}`,
          nativeSentence: `Để giải quyết tình huống khó khăn này, chúng ta cần vận dụng "${candidate.word}" một cách hiệu quả.`,
          targetLanguage: "English",
          nativeLanguage: "Vietnamese",
          topicContext: "Giải quyết vấn đề",
          idealTranslation: `To handle this difficult situation, we need to apply "${candidate.word}" effectively.`,
          targetWordFromCollection: {
            id: candidate.id,
            word: candidate.word,
            translation: candidate.translation,
            definition: candidate.definition || `Ý nghĩa: ${candidate.translation}`,
            hint: `Áp dụng từ "${candidate.word}" vào câu tiếng Anh`,
            strength: candidate.strength,
            lastAppearedAt: candidate.lastAppearedAt,
          },
          keyTargetWords: [
            { word: candidate.word, translation: candidate.translation, partOfSpeech: candidate.partOfSpeech || "term" },
            { word: "handle", translation: "xử lý, giải quyết", partOfSpeech: "verb" },
            { word: "effectively", translation: "một cách hiệu quả", partOfSpeech: "adverb" },
          ],
          isDailyConversationFallback: false,
          personalityNote: "Câu thực hành thiết kế riêng từ bộ sưu tập cá nhân đã qua hơn 24 giờ chưa ôn tập.",
          createdAt: new Date().toISOString(),
          provider: "gemini-sample",
          model: "gemini-3.5-flash-sample",
          responseTimeMs: 3500,
        };
      }

      // Fallback mode: pick from daily conversation pool
      const randomIndex = Math.floor(Math.random() * DAILY_CONVERSATION_FALLBACK_CHALLENGES.length);
      const picked = DAILY_CONVERSATION_FALLBACK_CHALLENGES[randomIndex];

      return {
        ...picked,
        id: `challenge-${Date.now()}`,
        provider: "gemini-sample",
        model: "gemini-3.5-flash-sample",
        responseTimeMs: 3500,
        createdAt: new Date().toISOString(),
      };
    },
    options?.abortSignal
  );
}

export async function mockProcessChallengeTurn(
  challenge: ChallengeData,
  userMessage: string,
  options?: { abortSignal?: AbortSignal; action?: string }
): Promise<ChallengeTurnResult> {
  return simulateSampleLlmCall(
    options?.action || "Chấm điểm bản dịch (Sample Mode)",
    "gemini-sample",
    "gemini-3.5-flash-sample",
    3500,
    () => {
      const trimmed = (userMessage || "").trim();
      const lower = trimmed.toLowerCase();

      // 1. Incomplete submission detection
      const trailingConnectives = [
        "the", "a", "an", "is", "are", "was", "were", "to", "in", "with", "and", "or",
        "because", "if", "for", "at", "about", "of", "on", "as", "by", "that", "this"
      ];
      const words = trimmed.split(/\s+/).filter(Boolean);
      const lastWord = words[words.length - 1]?.toLowerCase();
      const isPunct = /[.?!…]$/.test(trimmed);

      if (!isPunct && (words.length <= 2 || (lastWord && trailingConnectives.includes(lastWord)))) {
        return {
          intent: "incomplete",
          agentReply: `⚠️ Có vẻ như bạn đã gửi câu khi chưa gõ xong: *"${trimmed}"*. Hãy hoàn tất câu dịch của bạn nhé!`,
          suggestedActions: [
            {
              label: `✏️ Điền lại: "${trimmed}…"`,
              action: "repopulate_input",
              payload: { text: trimmed + " " },
            },
            {
              label: "🏳️ Xem đáp án & bỏ qua",
              action: "submit_empty_challenge",
            },
          ],
          provider: "gemini-sample",
          model: "gemini-3.5-flash-sample",
          responseTimeMs: 3500,
        };
      }

      // 2. Empty submission / Skip check
      if (!trimmed || lower === "skip" || lower === "(no answer provided)") {
        const targetWord = challenge.targetWordFromCollection?.word || "từ vựng mục tiêu";
        const prevStrength = challenge.targetWordFromCollection?.strength ?? 0;
        const newStrength = Math.min(100, prevStrength + 10);

        return {
          intent: "submission",
          evaluation: {
            score: 0,
            scoreLabel: "Xem đáp án & Học tập! 💡",
            userTranslation: "(Chưa nhập câu trả lời)",
            incorporatedTargetWord: false,
            targetWordUsed: targetWord,
            targetWordPrevStrength: prevStrength,
            targetWordNewStrength: newStrength,
            targetWordStrengthGained: 10,
            whatWentWell: "Bạn đã chủ động xem đáp án mẫu để tiếp thu cách diễn đạt tự nhiên và ghi nhớ từ vựng mục tiêu.",
            areasForImprovement: `Hãy đọc kỹ câu mẫu: "${challenge.idealTranslation || ""}". Hãy thử phát âm to câu này theo audio nhé!`,
            correctedSentence: challenge.idealTranslation || "Optimal translation.",
            suggestedVocabulary: (challenge.keyTargetWords || []).map((k) => ({
              word: k.word,
              translation: k.translation,
              partOfSpeech: k.partOfSpeech,
              definition: `Cách dùng: ${k.translation}`,
              example: challenge.idealTranslation,
              exampleTranslation: challenge.nativeSentence,
            })),
            augmentedWords: challenge.targetWordFromCollection ? [
              {
                word: challenge.targetWordFromCollection.word,
                translation: challenge.targetWordFromCollection.translation,
                prevStrength,
                newStrength,
                strengthGained: 10,
                isTargetWord: true,
                wasAlreadyInCollection: !challenge.isDailyConversationFallback,
              }
            ] : [],
          },
          provider: "gemini-sample",
          model: "gemini-3.5-flash-sample",
          responseTimeMs: 3500,
        };
      }

      // 3. Normal submission evaluation
      const targetWord = challenge.targetWordFromCollection?.word?.toLowerCase() || "";
      const didIncorporate = targetWord ? lower.includes(targetWord) : false;
      const score = didIncorporate ? 94 : 74;
      const scoreLabel = didIncorporate ? "Xuất sắc! 🌟" : "Khá tốt! 👍";

      const prevStrength = challenge.targetWordFromCollection?.strength ?? 0;
      const strengthGained = didIncorporate ? 30 : 10;
      const newStrength = Math.min(100, prevStrength + strengthGained);

      const matchedClues = (challenge.keyTargetWords || [])
        .filter((k) => lower.includes(k.word.toLowerCase()))
        .map((k) => k.word);

      return {
        intent: "submission",
        evaluation: {
          score,
          scoreLabel,
          userTranslation: trimmed,
          incorporatedTargetWord: didIncorporate,
          targetWordUsed: challenge.targetWordFromCollection?.word,
          targetWordPrevStrength: prevStrength,
          targetWordNewStrength: newStrength,
          targetWordStrengthGained: strengthGained,
          incorporatedVocabClues: matchedClues,
          whatWentWell: didIncorporate
            ? `Bản dịch của bạn cực kỳ tự nhiên và chuẩn xác! Bạn đã vận dụng thành công từ vựng mục tiêu "${challenge.targetWordFromCollection?.word}" đúng cấu trúc ngữ pháp.`
            : `Bạn đã truyền tải trọn vẹn ý nghĩa của câu gốc bằng cách diễn đạt mạch lạc, dễ hiểu.`,
          areasForImprovement: didIncorporate
            ? "Câu rất tốt. Chú ý thêm về cách chọn giới từ và mạo từ (a/an/the) để câu văn uyển chuyển như người bản xứ."
            : `Hãy thử áp dụng trực tiếp từ vựng mục tiêu "${challenge.targetWordFromCollection?.word}" thay cho cách nói thông thường để tăng điểm từ vựng nhé.`,
          correctedSentence: challenge.idealTranslation || "Optimal translation.",
          suggestedVocabulary: (challenge.keyTargetWords || []).map((k) => ({
            word: k.word,
            translation: k.translation,
            partOfSpeech: k.partOfSpeech,
            definition: `Từ/cụm từ hay trong câu: ${k.translation}`,
            example: challenge.idealTranslation,
            exampleTranslation: challenge.nativeSentence,
          })),
          augmentedWords: challenge.targetWordFromCollection ? [
            {
              word: challenge.targetWordFromCollection.word,
              translation: challenge.targetWordFromCollection.translation,
              prevStrength,
              newStrength,
              strengthGained,
              isTargetWord: true,
              wasAlreadyInCollection: !challenge.isDailyConversationFallback,
            }
          ] : [],
        },
        provider: "gemini-sample",
        model: "gemini-3.5-flash-sample",
        responseTimeMs: 3500,
      };
    },
    options?.abortSignal
  );
}

export async function mockAskAiQuestion(
  challenge: ChallengeData,
  userQuestion: string,
  userTranslation?: string,
  options?: { abortSignal?: AbortSignal; action?: string }
): Promise<AskAiResponse> {
  return simulateSampleLlmCall(
    options?.action || "Gia sư AI giải đáp (Sample Mode)",
    "gemini-sample",
    "gemini-3.5-flash-sample",
    3500,
    () => {
      const q = userQuestion.toLowerCase();

      if (q.includes("khác nhau") || q.includes("phân biệt") || q.includes("difference")) {
        return {
          answer: `**Phân biệt trong ngữ cảnh câu này:**\n\n- **${challenge.targetWordFromCollection?.word || "Từ mục tiêu"}**: Mang sắc thái tự nhiên, trang trọng và chính xác khi mô tả tình huống "${challenge.topicContext || "giao tiếp"}".\n- Trong tiếng Anh bản xứ, người ta thường dùng cụm từ này kết hợp với động từ mang tính chủ động để thể hiện rõ nét ý định người nói.`,
          suggestedFollowUps: [
            "Có ví dụ nào khác trong đời sống không?",
            "Khi nào thì không nên dùng cụm từ này?",
          ],
        };
      }

      if (q.includes("ngữ pháp") || q.includes("grammar") || q.includes("cấu trúc")) {
        return {
          answer: `**Phân tích cấu trúc câu chuẩn:**\n\nTrong câu: *" ${challenge.idealTranslation} "*\n\n1. Mệnh đề chính sử dụng thì quá khứ/hiện tại đơn phù hợp với thời điểm diễn ra sự việc.\n2. Các cụm danh từ và giới từ được sắp xếp theo trật tự tự nhiên nhất của tiếng Anh giao tiếp chuẩn.`,
          suggestedFollowUps: [
            "Có thể đổi sang thể bị động được không?",
            "Từ nào có thể thay thế trong ngữ cảnh thân mật?",
          ],
        };
      }

      return {
        answer: `Gia sư AI giải đáp cho bạn về câu: *"${challenge.nativeSentence}"*\n\nCâu hỏi của bạn: *" ${userQuestion} "*\n\n👉 **Lời khuyên thực chiến:** Trong ngữ cảnh "${challenge.topicContext || "hàng ngày"}", người bản ngữ ưu tiên sự ngắn gọn, rõ ràng và sử dụng các cụm cố định (collocations) như *"${challenge.targetWordFromCollection?.word || "từ vựng mục tiêu"}"*. Cách dịch của bạn rất đáng khích lệ!`,
        suggestedFollowUps: [
          "Làm sao để nhớ lâu từ này?",
          "Người bản xứ có hay nói câu này không?",
        ],
      };
    },
    options?.abortSignal
  );
}
