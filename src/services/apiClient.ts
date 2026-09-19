import {
  ChallengeData,
  ChallengeTurnResult,
  UserVocabItem,
  AskAiResponse,
} from "../types";
import {
  mockGenerateChallenge,
  mockProcessChallengeTurn,
  mockAskAiQuestion,
} from "./mockChallengeService";
import { getStoredAccessKey, isStoredSampleMode } from "./accessKey";
import { logApiRequest } from "./requestHistoryService";
import { executeChatCompletionWithRotation } from "./llmProxyEngine";
import { selectChallengeCandidates } from "./candidateSelector";
import { LLMProviderId } from "../../cloudflare-worker/src/types";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = getStoredAccessKey();
  if (key) {
    headers["X-Proxy-Key"] = key;
    headers["x-access-key"] = key;
    headers["Authorization"] = `Bearer ${key}`;
  }
  return headers;
}

function isStaticEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname.includes("github.io") ||
    window.location.protocol === "file:" ||
    window.location.port === "5173" ||
    window.location.port === "4173"
  );
}

function getPreferredProvider(): LLMProviderId | undefined {
  try {
    const pref = localStorage.getItem("preferred_llm_provider");
    if (pref && pref !== "auto") {
      return pref as LLMProviderId;
    }
  } catch {
    // Ignore localStorage read errors
  }
  return undefined;
}

// --------------------------------------------------------------------------
// 1. Generate Challenge
// --------------------------------------------------------------------------
export async function generateChallenge(
  userCollection: UserVocabItem[] = []
): Promise<ChallengeData> {
  const accessKey = getStoredAccessKey();
  const sampleMode = isStoredSampleMode();

  // If user explicitly chose sample mode and has no access key
  if (sampleMode && !accessKey) {
    return mockGenerateChallenge(userCollection);
  }

  // If user has not configured an Access Key, prompt with a clear error
  if (!accessKey) {
    throw new Error(
      "Chưa cấu hình mã truy cập (Access Key). Vui lòng mở Cài đặt hoặc nhấn vào biểu tượng chìa khóa để nhập mã truy cập Cloudflare Worker."
    );
  }

  const startTime = Date.now();
  const promptSummary = `Generate challenge (${userCollection.length} candidate words)`;

  // Option A: If not in a purely static environment, attempt the full-stack server endpoint first
  if (!isStaticEnvironment()) {
    try {
      const res = await fetch("/api/challenge/generate", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          candidates: userCollection,
          isDailyConversationFallback: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.nativeSentence) {
          const durationMs = Date.now() - startTime;
          logApiRequest({
            provider: data.provider || "backend-server",
            model: data.model || "auto",
            prompt: promptSummary,
            systemInstruction: "Expert bilingual Vietnamese-English translation coach",
            response: JSON.stringify(data),
            responseTimeMs: durationMs,
            status: "success",
            statusCode: res.status,
            action: "Translation Challenge (Server)",
          }).catch(() => {});
          return data;
        }
      }
    } catch {
      // Server endpoint unavailable (e.g. 404 or network); seamlessly proceed to direct Cloudflare Worker execution
    }
  }

  // Option B: Direct Cloudflare Worker microservice execution via intelligent rotation
  const { candidates, isDailyConversationFallback } = selectChallengeCandidates(userCollection);
  const isModeA = !isDailyConversationFallback && candidates.length > 0;
  const candidate = isModeA ? candidates[0] : undefined;

  const systemInstruction = `You are an expert bilingual Vietnamese-English translation coach.
Create a concise, authentic, and culturally natural conversational translation challenge.

STRICT MANDATES:
1. ZERO HARDCODED TOPICS OR CONTEXTS: You have 100% complete creative freedom to pick ANY realistic everyday communication context (e.g. borrowing a charger, negotiating deadlines, running into an old classmate, ordering coffee, commuting delays, grocery shopping, household chores, doctor appointment, weather banter, asking directions, restaurant dining, gym talk, etc.). NEVER restrict to a predefined category!
2. COMMON SENTENCE SELECTION: Within your freely chosen context, select a COMMON, natural everyday conversational sentence that native speakers frequently say in real life (6 to 14 words in Vietnamese).
3. ZERO LOANWORDS: Do NOT use English loanwords or untranslated English words inside 'nativeSentence'.
4. NATIVE-FIRST: The native Vietnamese sentence must sound completely natural as spoken by Vietnamese natives, not like a translation from English.
5. 'topicContext': Summarize your freely chosen context into a natural, vivid 2 to 4 word Vietnamese phrase.
6. Return valid JSON only with the exact schema requested.`;

  let userPrompt = "";
  if (isModeA && candidate) {
    const candidatesList = candidates
      .map((c) => `- "${c.word}" (${c.translation}) [strength: ${c.strength}%]`)
      .join("\n");

    userPrompt = `MODE A (Personal Vocab Practice):
The learner has words/phrases from their personal collection due for review.
Choose ONE candidate from the list below and build a realistic everyday conversational challenge around it.

CANDIDATES:
${candidatesList}

Generate a translation challenge for Vietnamese -> English.
Pick a COMMON conversational Vietnamese sentence (6-14 words) that would naturally be translated into English using this target word/phrase.
Respond strictly in valid JSON:
{
  "nativeSentence": "Câu tiếng Việt tự nhiên",
  "topicContext": "Ngữ cảnh 2-4 từ",
  "idealTranslation": "Natural English translation",
  "targetWordFromCollection": {
    "word": "${candidate.word}",
    "translation": "${candidate.translation}",
    "definition": "${candidate.definition || ""}",
    "hint": "Gợi ý cách dùng từ này trong câu"
  },
  "keyTargetWords": [
    { "word": "${candidate.word}", "translation": "${candidate.translation}", "partOfSpeech": "${candidate.partOfSpeech || "word"}", "hint": "Gợi ý" }
  ],
  "personalityNote": "Lời giải thích ngắn vì sao cấu trúc này thông dụng trong giao tiếp"
}`;
  } else {
    userPrompt = `MODE B (Daily Conversation Fallback):
The learner has no personal collection items due for review.
Freely pick ANY everyday situation (ordering coffee, asking directions, commuting, shopping, workplace, casual banter) and generate a challenge for Vietnamese -> English using a COMMON sentence people actually say in that situation, centered on a common daily English word or phrase.
Respond strictly in valid JSON:
{
  "nativeSentence": "Câu tiếng Việt tự nhiên (6-14 từ)",
  "topicContext": "Ngữ cảnh 2-4 từ",
  "idealTranslation": "Natural English translation",
  "targetWordFromCollection": {
    "word": "từ hoặc cụm từ tiếng Anh mục tiêu",
    "translation": "nghĩa tiếng Việt",
    "definition": "định nghĩa",
    "hint": "gợi ý hữu ích"
  },
  "keyTargetWords": [
    { "word": "từ tiếng Anh", "translation": "dịch nghĩa", "partOfSpeech": "verb/noun/...", "hint": "gợi ý" }
  ],
  "personalityNote": "Ghi chú thân thiện về ngữ cảnh đời thường"
}`;
  }

  try {
    const preferredProvider = getPreferredProvider();
    const result = await executeChatCompletionWithRotation(
      {
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        response_format: { type: "json_object" },
        preferred_provider: preferredProvider,
      },
      accessKey,
      30000
    );

    let parsed: any = {};
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const match = result.content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed || !parsed.nativeSentence) {
      throw new Error("Phản hồi từ mô hình AI không đúng định dạng dữ liệu.");
    }

    const durationMs = Date.now() - startTime;
    const challengeData: ChallengeData = {
      ...parsed,
      id: `challenge-${Date.now()}`,
      nativeLanguage: "Vietnamese",
      targetLanguage: "English",
      isDailyConversationFallback: !isModeA,
      createdAt: new Date().toISOString(),
      provider: result.provider,
      model: result.model,
      tier: result.tier,
      responseTimeMs: durationMs,
    };

    logApiRequest({
      provider: result.provider,
      model: result.model,
      prompt: promptSummary,
      systemInstruction,
      response: JSON.stringify(challengeData),
      responseTimeMs: durationMs,
      status: "success",
      statusCode: 200,
      action: "Translation Challenge (Cloudflare Edge)",
    }).catch(() => {});

    return challengeData;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logApiRequest({
      provider: "cloudflare-worker",
      model: "auto-rotation",
      prompt: promptSummary,
      response: err.message || String(err),
      responseTimeMs: durationMs,
      status: "error",
      statusCode: 500,
      errorMessage: err.message || String(err),
      action: "Translation Challenge",
    }).catch(() => {});

    // Directly propagate the error to inform the user instead of masking it with mock data
    throw new Error(
      `Không thể tạo thử thách từ Cloudflare LLM Worker: ${err.message || "Lỗi kết nối"}. Vui lòng kiểm tra lại Access Key hoặc đường truyền.`
    );
  }
}

// --------------------------------------------------------------------------
// 2. Evaluate Challenge Turn
// --------------------------------------------------------------------------
export async function evaluateChallengeTurn(
  challenge: ChallengeData,
  userMessage: string
): Promise<ChallengeTurnResult> {
  const trimmed = userMessage.trim();
  const lower = trimmed.toLowerCase();
  const startTime = Date.now();

  // Instant client heuristic: Check incomplete submission
  const trailingConnectives = [
    "the", "a", "an", "is", "are", "was", "were", "to", "in", "with", "and", "or",
    "because", "if", "for", "at", "about", "of", "on", "as", "by", "that", "this",
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
      provider: "client-heuristic",
      model: "instant-detection",
      responseTimeMs: Date.now() - startTime,
    };
  }

  // Instant client heuristic: Skip or Reveal answer
  const targetWord = challenge?.targetWordFromCollection?.word || "từ mục tiêu";
  const prevStrength = challenge?.targetWordFromCollection?.strength ?? 0;

  if (!trimmed || lower === "skip" || lower === "(no answer provided)") {
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
        whatWentWell: "Bạn đã chủ động xem đáp án mẫu để tiếp thu cấu trúc tự nhiên và ghi nhớ từ vựng mục tiêu.",
        areasForImprovement: `Ghi nhớ câu chuẩn: "${challenge?.idealTranslation || ""}". Hãy đọc to câu này theo audio nhé!`,
        correctedSentence: challenge?.idealTranslation || "Optimal translation.",
        suggestedVocabulary: (challenge?.keyTargetWords || []).map((k: any) => ({
          word: k.word,
          translation: k.translation,
          partOfSpeech: k.partOfSpeech,
          definition: `Cách dùng: ${k.translation}`,
          example: challenge?.idealTranslation,
          exampleTranslation: challenge?.nativeSentence,
        })),
        augmentedWords: challenge?.targetWordFromCollection
          ? [
              {
                word: challenge.targetWordFromCollection.word,
                translation: challenge.targetWordFromCollection.translation,
                prevStrength,
                newStrength,
                strengthGained: 10,
                isTargetWord: true,
                wasAlreadyInCollection: !challenge.isDailyConversationFallback,
              },
            ]
          : [],
      },
      provider: "client-rule",
      model: "skip-evaluator",
      responseTimeMs: Date.now() - startTime,
    };
  }

  const accessKey = getStoredAccessKey();
  const sampleMode = isStoredSampleMode();

  if (sampleMode && !accessKey) {
    return mockProcessChallengeTurn(challenge, userMessage);
  }

  if (!accessKey) {
    throw new Error("Chưa có mã truy cập (Access Key) để chấm câu qua Cloudflare LLM.");
  }

  const promptSummary = `Evaluate: "${userMessage}" for target: "${targetWord}"`;

  // Option A: Try full-stack server endpoint if available
  if (!isStaticEnvironment()) {
    try {
      const res = await fetch("/api/challenge/evaluate", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          challenge,
          userSubmission: userMessage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && (data.intent === "incomplete" || data.evaluation)) {
          logApiRequest({
            provider: data.provider || "backend-server",
            model: data.model || "auto",
            prompt: promptSummary,
            response: JSON.stringify(data),
            responseTimeMs: Date.now() - startTime,
            status: "success",
            statusCode: res.status,
            action: "Challenge Evaluation (Server)",
          }).catch(() => {});
          return data;
        }
      }
    } catch {
      // Proceed to direct Cloudflare Worker execution
    }
  }

  // Option B: Direct Cloudflare Worker evaluation
  const clueWordsList = (challenge?.keyTargetWords || []).map((k) => `"${k.word}"`).join(", ") || "(none)";
  const evalPrompt = `THÔNG TIN THỬ THÁCH:
- Câu tiếng Việt gốc: "${challenge?.nativeSentence || ""}"
- Ngữ cảnh thực tế: "${challenge?.topicContext || "Everyday communication"}"
- Từ vựng mục tiêu trọng tâm cần học viên vận dụng: "${targetWord}"
- Danh sách từ vựng gợi ý của thử thách: ${clueWordsList}
- Bản dịch tham khảo lý tưởng: "${challenge?.idealTranslation || ""}"

CÂU TRẢ LỜI CỦA HỌC VIÊN:
"${trimmed}"

STRICT EVALUATION INSTRUCTIONS:
1. STRICT CHECK FOR "incorporatedTargetWord":
   - Set "incorporatedTargetWord": true IF AND ONLY IF the learner actually included the featured target word "${targetWord}" or its valid grammatical inflections / forms.
   - Set "incorporatedTargetWord": false IF the learner used an alternative synonym or omitted it.
2. STRICT CHECK FOR "incorporatedVocabClues":
   - Return an array of strings in "incorporatedVocabClues" containing the exact clue words the learner actually used. Return [] if none were used.
3. SCORING & COACHING FEEDBACK:
   - "score": Integer 0 to 100 evaluating communicative accuracy and fluency.
   - "scoreLabel": High-energy encouraging label in Vietnamese (e.g. "Xuất sắc! 🌟", "Rất tốt! 👏", "Khá tốt! 👍", "Cần cố gắng thêm! 💪").
   - "targetWordUsed": "${targetWord}".
   - "whatWentWell": Detailed encouraging praise in Vietnamese.
   - "areasForImprovement": Constructive, actionable tips in Vietnamese.
   - "correctedSentence": Natural, native-level English translation.
   - "suggestedVocabulary": 2-4 key words/phrases with Vietnamese translations and definitions.
Respond strictly in valid JSON with fields: score, scoreLabel, incorporatedTargetWord, targetWordUsed, incorporatedVocabClues, whatWentWell, areasForImprovement, correctedSentence, suggestedVocabulary: [{word, translation, partOfSpeech, definition, example, exampleTranslation}].`;

  try {
    const preferredProvider = getPreferredProvider();
    const result = await executeChatCompletionWithRotation(
      {
        messages: [
          {
            role: "system",
            content:
              "You are an expert bilingual Vietnamese-English translation coach. Follow the strict evaluation guidelines with precision and return valid JSON only.",
          },
          { role: "user", content: evalPrompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
        preferred_provider: preferredProvider,
      },
      accessKey,
      30000
    );

    let parsed: any = {};
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const match = result.content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed || typeof parsed.score === "undefined") {
      throw new Error("Mô hình AI không trả về điểm số hợp lệ.");
    }

    const didIncorporate = Boolean(parsed.incorporatedTargetWord);
    const strengthGained = didIncorporate ? 30 : 10;
    const newStrength = Math.min(100, prevStrength + strengthGained);
    const durationMs = Date.now() - startTime;

    const evalResult: ChallengeTurnResult = {
      intent: "submission",
      evaluation: {
        score: typeof parsed.score === "number" ? parsed.score : (didIncorporate ? 90 : 75),
        scoreLabel: parsed.scoreLabel || (didIncorporate ? "Xuất sắc! 🌟" : "Làm tốt lắm! 👏"),
        userTranslation: trimmed,
        incorporatedTargetWord: didIncorporate,
        targetWordUsed: targetWord,
        incorporatedVocabClues: Array.isArray(parsed.incorporatedVocabClues)
          ? parsed.incorporatedVocabClues
          : [],
        whatWentWell: parsed.whatWentWell || "Bạn đã hoàn thành tốt bản dịch của mình.",
        areasForImprovement: parsed.areasForImprovement || "Hãy tiếp tục luyện tập các cấu trúc tự nhiên.",
        correctedSentence: parsed.correctedSentence || challenge?.idealTranslation || "Optimal translation.",
        suggestedVocabulary: parsed.suggestedVocabulary || [],
        targetWordPrevStrength: prevStrength,
        targetWordNewStrength: newStrength,
        targetWordStrengthGained: strengthGained,
        augmentedWords: challenge?.targetWordFromCollection
          ? [
              {
                word: challenge.targetWordFromCollection.word,
                translation: challenge.targetWordFromCollection.translation,
                prevStrength,
                newStrength,
                strengthGained,
                isTargetWord: true,
                wasAlreadyInCollection: !challenge.isDailyConversationFallback,
              },
            ]
          : [],
      },
      provider: result.provider,
      model: result.model,
      responseTimeMs: durationMs,
    };

    logApiRequest({
      provider: result.provider,
      model: result.model,
      prompt: promptSummary,
      response: JSON.stringify(evalResult),
      responseTimeMs: durationMs,
      status: "success",
      statusCode: 200,
      action: "Challenge Evaluation (Cloudflare Edge)",
    }).catch(() => {});

    return evalResult;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logApiRequest({
      provider: "cloudflare-worker",
      model: "auto-rotation",
      prompt: promptSummary,
      response: err.message || String(err),
      responseTimeMs: durationMs,
      status: "error",
      statusCode: 500,
      errorMessage: err.message || String(err),
      action: "Challenge Evaluation",
    }).catch(() => {});

    throw new Error(
      `Không thể chấm bài qua Cloudflare LLM Worker: ${err.message || "Lỗi kết nối"}. Vui lòng thử lại.`
    );
  }
}

// --------------------------------------------------------------------------
// 3. Ask AI Tutor
// --------------------------------------------------------------------------
export async function askAiTutor(
  challenge: ChallengeData,
  userQuestion: string,
  userTranslation?: string
): Promise<AskAiResponse> {
  const accessKey = getStoredAccessKey();
  const sampleMode = isStoredSampleMode();

  if (sampleMode && !accessKey) {
    return mockAskAiQuestion(challenge, userQuestion, userTranslation);
  }

  if (!accessKey) {
    throw new Error("Chưa có mã truy cập (Access Key) để hỏi gia sư AI qua Cloudflare LLM.");
  }

  const startTime = Date.now();

  // Option A: Try full-stack server endpoint first if available
  if (!isStaticEnvironment()) {
    try {
      const res = await fetch("/api/challenge/ask-ai", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          challenge,
          userQuestion,
          userTranslation,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.answer) {
          logApiRequest({
            provider: data.provider || "backend-server",
            model: data.model || "auto",
            prompt: userQuestion,
            response: JSON.stringify(data),
            responseTimeMs: Date.now() - startTime,
            status: "success",
            statusCode: res.status,
            action: "Challenge Ask AI (Server)",
          }).catch(() => {});
          return data;
        }
      }
    } catch {
      // Proceed to direct Cloudflare Worker execution
    }
  }

  // Option B: Direct Cloudflare Worker execution
  const tutorPrompt = `You are an interactive AI language tutor assisting a Vietnamese learner of English.

CURRENT CHALLENGE:
- Vietnamese Sentence: "${challenge?.nativeSentence}"
- Context: "${challenge?.topicContext}"
- Target Word/Phrase: "${challenge?.targetWordFromCollection?.word}" (${challenge?.targetWordFromCollection?.translation})
- Ideal English Translation: "${challenge?.idealTranslation}"
- Learner's Translation: "${userTranslation || "(Chưa dịch)"}"

LEARNER'S QUESTION:
"${userQuestion}"

INSTRUCTIONS:
- Answer in Vietnamese, with clear English examples.
- Keep the explanation engaging, concise, easy to understand, and practical for daily speaking.
- Provide 2 suggested follow-up questions the learner might want to ask next.
Respond strictly in valid JSON with fields: 'answer' (string) and 'suggestedFollowUps' (array of strings).`;

  try {
    const preferredProvider = getPreferredProvider();
    const result = await executeChatCompletionWithRotation(
      {
        messages: [
          {
            role: "system",
            content:
              "You are a friendly, expert bilingual English-Vietnamese tutor. Return JSON with 'answer' and 'suggestedFollowUps'.",
          },
          { role: "user", content: tutorPrompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
        preferred_provider: preferredProvider,
      },
      accessKey,
      30000
    );

    let parsed: any = {};
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const match = result.content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed || !parsed.answer) {
      throw new Error("Không nhận được câu trả lời từ gia sư AI.");
    }

    const durationMs = Date.now() - startTime;
    const aiResponse: AskAiResponse = {
      answer: parsed.answer,
      suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
        ? parsed.suggestedFollowUps
        : [],
    };

    logApiRequest({
      provider: result.provider,
      model: result.model,
      prompt: userQuestion,
      response: JSON.stringify(aiResponse),
      responseTimeMs: durationMs,
      status: "success",
      statusCode: 200,
      action: "Challenge Ask AI (Cloudflare Edge)",
    }).catch(() => {});

    return aiResponse;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logApiRequest({
      provider: "cloudflare-worker",
      model: "auto-rotation",
      prompt: userQuestion,
      response: err.message || String(err),
      responseTimeMs: durationMs,
      status: "error",
      statusCode: 500,
      errorMessage: err.message || String(err),
      action: "Challenge Ask AI",
    }).catch(() => {});

    throw new Error(
      `Không thể kết nối với gia sư AI qua Cloudflare LLM: ${err.message || "Lỗi kết nối"}. Vui lòng thử lại.`
    );
  }
}
