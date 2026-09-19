import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import {
  getAllRegisteredCandidates,
  getAllMetrics,
  getAllLocks,
  unlockModel,
  clearAllLocks,
  executeChatCompletionWithRotation,
  executeUpstreamCall
} from "./src/services/llmProxyEngine";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper to extract Cloudflare Worker access key from incoming request headers or server env
function extractProxyKey(req: Request): string {
  const headerKey = req.headers["x-access-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return (
    process.env.ACCESS_KEY ||
    process.env.ACESS_KEY ||
    ""
  );
}

// Lazy-initialized Gemini AI client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// 1. Health check & status
app.get("/api/health", (_req: Request, res: Response) => {
  const serverKey =
    process.env.ACCESS_KEY ||
    process.env.ACESS_KEY ||
    "";
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    hasAccessKey: Boolean(serverKey),
    accessKey: serverKey,
    model: "gemini-3.8-flash",
    edgeProxy: "Cloudflare LLM Worker Gateway",
    providers: ["groq", "openrouter", "gemini", "9flare", "ollama", "cloudflare"]
  });
});

app.get("/api/config", (_req: Request, res: Response) => {
  const serverKey =
    process.env.ACCESS_KEY ||
    process.env.ACESS_KEY ||
    "";
  res.json({
    hasAccessKey: Boolean(serverKey),
    accessKey: serverKey,
  });
});

// Cloudflare Worker LLM Proxy: /v1/status & /status
app.get(["/v1/status", "/status"], (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "Cloudflare LLM Edge Router & Proxy Gateway",
    timestamp: new Date().toISOString(),
    metrics: getAllMetrics(),
    lockedModels: getAllLocks()
  });
});

// Cloudflare Worker LLM Proxy: /v1/unlock
app.post("/v1/unlock", (req: Request, res: Response) => {
  const { provider, model, all } = req.body;
  if (all) {
    clearAllLocks();
    return res.json({ message: "All model locks cleared successfully." });
  }
  if (provider && model) {
    unlockModel(provider, model);
    return res.json({ message: `Model ${provider}:${model} unlocked successfully.` });
  }
  return res.status(400).json({ error: "Specify { provider, model } or { all: true }" });
});

// Cloudflare Worker LLM Proxy: /v1/models (OpenAI-compatible catalog)
app.get("/v1/models", (_req: Request, res: Response) => {
  const candidates = getAllRegisteredCandidates();
  res.json({
    object: "list",
    data: candidates.map(c => ({
      id: `${c.provider}/${c.model}`,
      object: "model",
      owned_by: c.provider,
      permission: []
    }))
  });
});

// Cloudflare Worker LLM Proxy: /v1/chat/completions
app.post("/v1/chat/completions", async (req: Request, res: Response) => {
  const proxyKey = extractProxyKey(req);
  const {
    messages,
    model,
    temperature,
    max_tokens,
    stream,
    response_format,
    preferred_provider,
    preferred_models
  } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Missing required field: messages" });
  }

  try {
    const result = await executeChatCompletionWithRotation(
      {
        model,
        messages,
        temperature,
        max_tokens,
        stream,
        response_format,
        preferred_provider,
        preferred_models
      },
      proxyKey
    );

    res.setHeader("X-Routed-Provider", result.provider);
    res.setHeader("X-Routed-Model", result.model);
    res.setHeader("X-Routed-Tier", String(result.tier));
    res.setHeader("X-Response-Time-Ms", String(result.durationMs));
    res.setHeader("X-Retry-Attempts", String(result.attempts));

    return res.json(result.response);
  } catch (err: any) {
    return res.status(502).json({
      error: err.message || "All available LLM candidate models failed",
      status: "error"
    });
  }
});

// Diagnostic test endpoint for Cloudflare Worker microservices
app.post("/api/test-llm", async (req: Request, res: Response) => {
  const proxyKey = extractProxyKey(req);
  let { provider = "groq", model } = req.body;
  
  if (!model || model === "llama-3.3-70b-versatile" || model === "auto-routing") {
    if (provider === "groq" || provider === "auto") {
      model = "openai/gpt-oss-120b";
    } else if (provider === "gemini") {
      model = "gemini-3.6-flash";
    } else if (provider === "9flare") {
      model = "pro/gpt-5.6-luna";
    } else if (provider === "ollama") {
      model = "gpt-oss:20b";
    }
  }

  const startTime = Date.now();

  try {
    const result = await executeChatCompletionWithRotation(
      {
        model,
        messages: [
          { role: "system", content: 'You are a test assistant. Respond strictly with: {"status": "connected"}' },
          { role: "user", content: "Ping" }
        ],
        temperature: 0.1,
        max_tokens: 30,
        preferred_provider: provider,
        response_format: { type: "json_object" }
      },
      proxyKey,
      15000
    );

    return res.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      tier: result.tier,
      durationMs: result.durationMs,
      content: result.content
    });
  } catch (err: any) {
    return res.status(502).json({
      ok: false,
      error: err.message || "Failed to reach Cloudflare Worker proxy",
      durationMs: Date.now() - startTime
    });
  }
});

// 2. Generate Challenge Endpoint
app.post("/api/challenge/generate", async (req: Request, res: Response) => {
  const { candidates = [], isDailyConversationFallback = false } = req.body;
  const startTime = Date.now();
  const proxyKey = extractProxyKey(req);
  const ai = getAI();

  if (!ai && !proxyKey) {
    return res.status(503).json({
      error: "Neither GEMINI_API_KEY nor Cloudflare Worker Access Key is configured",
      useFallback: true,
    });
  }

  try {
    const isModeA = !isDailyConversationFallback && Array.isArray(candidates) && candidates.length > 0;

    const systemInstruction = `You are an expert bilingual Vietnamese-English translation coach.
Create a concise, authentic, and culturally natural conversational translation challenge.

STRICT MANDATES:
1. ZERO HARDCODED TOPICS OR CONTEXTS: You have 100% complete creative freedom to pick ANY realistic everyday communication context (e.g. borrowing a charger, negotiating deadlines, running into an old classmate, ordering coffee, commuting delays, grocery shopping, household chores, doctor appointment, weather banter, asking directions, restaurant dining, gym talk, etc.). NEVER restrict to a predefined category!
2. COMMON SENTENCE SELECTION: Within your freely chosen context, select a COMMON, natural everyday conversational sentence that native speakers frequently say in real life (6 to 14 words in Vietnamese).
3. ZERO LOANWORDS: Do NOT use English loanwords or untranslated English words inside 'nativeSentence'.
4. NATIVE-FIRST: The native Vietnamese sentence must sound completely natural as spoken by Vietnamese natives, not like a translation from English.
5. 'topicContext': Summarize your freely chosen context into a natural, vivid 2 to 4 word Vietnamese phrase (e.g. "Kẹt xe giờ tan tầm", "Mượn đồ đồng nghiệp", "Hẹn cà phê cuối tuần", "Đặt lịch khám bệnh", "Hỏi thăm sức khỏe").
6. MODE INSTRUCTIONS:
   - If Mode A: Pick ONE candidate word/phrase from the learner's provided list, and construct a realistic conversation sentence where using that target word/phrase in English would be the most natural and idiomatic choice. Put that word in 'targetWordFromCollection'.
   - If Mode B: Freely choose an everyday situation and select a high-frequency everyday conversational word or idiom as 'targetWordFromCollection'.
`;

    let prompt = "";
    if (isModeA) {
      const candidatesList = candidates
        .map((c: any) => `- "${c.word}" (${c.translation}) [strength: ${c.strength}%]`)
        .join("\n");

      prompt = `MODE A (Collection Candidates Provided):
The learner has words/phrases from their personal collection that were last practiced over 24 hours ago.
Choose ONE candidate from the list below and build a realistic everyday situation around it.

LEARNER CANDIDATE VOCABULARY & PHRASES:
${candidatesList}

Generate a translation challenge for Vietnamese -> English.
Pick a COMMON conversational Vietnamese sentence (6-14 words) that would naturally be translated into English using this target word/phrase.
Respond strictly in valid JSON with fields: nativeSentence, topicContext, idealTranslation, targetWordFromCollection: {word, translation, definition, hint}, keyTargetWords: [{word, translation, partOfSpeech, hint}], personalityNote.`;
    } else {
      prompt = `MODE B (Daily Conversation Fallback):
The learner has no collection items due for review (or collection is empty).
Freely pick ANY everyday situation (e.g. dining out, catching up, commuting, workplace, shopping, errands) and generate a challenge for Vietnamese -> English using a COMMON sentence people actually say in that situation, centered on a common daily English word or phrase.
Respond strictly in valid JSON with fields: nativeSentence, topicContext, idealTranslation, targetWordFromCollection: {word, translation, definition, hint}, keyTargetWords: [{word, translation, partOfSpeech, hint}], personalityNote.`;
    }

    // Try Cloudflare Worker LLM proxy first if proxyKey is provided
    if (proxyKey) {
      try {
        const result = await executeChatCompletionWithRotation(
          {
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: prompt }
            ],
            temperature: 0.85,
            response_format: { type: "json_object" }
          },
          proxyKey
        );

        let parsed: any = {};
        try {
          parsed = JSON.parse(result.content);
        } catch {
          const match = result.content.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        }

        if (parsed && parsed.nativeSentence) {
          const responseTimeMs = Date.now() - startTime;
          return res.json({
            ...parsed,
            id: `challenge-${Date.now()}`,
            nativeLanguage: "Vietnamese",
            targetLanguage: "English",
            isDailyConversationFallback: !isModeA,
            createdAt: new Date().toISOString(),
            provider: result.provider,
            model: result.model,
            tier: result.tier,
            responseTimeMs,
          });
        }
      } catch (proxyErr: any) {
        console.warn("[Challenge Generate] Cloudflare Worker proxy error:", proxyErr);
        if (!ai) {
          return res.status(502).json({
            error: proxyErr.message || "Lỗi kết nối mô hình qua Cloudflare Worker",
            failedModel: proxyErr.failedModel,
            status: "error"
          });
        }
      }
    }

    if (!ai) {
      return res.status(503).json({
        error: "LLM generation failed and GEMINI_API_KEY is not configured",
        useFallback: true,
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.9,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nativeSentence: {
              type: Type.STRING,
              description: "Natural everyday Vietnamese conversational sentence (6-14 words)",
            },
            topicContext: {
              type: Type.STRING,
              description: "Freely chosen 2-4 word Vietnamese context summary",
            },
            idealTranslation: {
              type: Type.STRING,
              description: "Natural, idiomatic English translation",
            },
            targetWordFromCollection: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                translation: { type: Type.STRING },
                definition: { type: Type.STRING },
                hint: { type: Type.STRING },
              },
              required: ["word", "translation"],
            },
            isDailyConversationFallback: {
              type: Type.BOOLEAN,
            },
            keyTargetWords: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  partOfSpeech: { type: Type.STRING },
                  hint: { type: Type.STRING },
                },
                required: ["word", "translation"],
              },
            },
            personalityNote: {
              type: Type.STRING,
              description: "Short friendly note explaining why this phrase is common in daily life",
            },
          },
          required: ["nativeSentence", "topicContext", "idealTranslation", "targetWordFromCollection", "keyTargetWords"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const responseTimeMs = Date.now() - startTime;

    // Attach metadata
    const result = {
      ...parsed,
      id: `challenge-${Date.now()}`,
      nativeLanguage: "Vietnamese",
      targetLanguage: "English",
      isDailyConversationFallback: !isModeA,
      createdAt: new Date().toISOString(),
      provider: "gemini-api",
      model: "gemini-3.8-flash",
      responseTimeMs,
    };

    return res.json(result);
  } catch (error: any) {
    console.error("Gemini challenge generation error:", error);
    return res.status(500).json({
      error: error.message || "Failed to generate challenge with Gemini",
      useFallback: true,
    });
  }
});

// 3. Evaluate Submission Endpoint
app.post("/api/challenge/evaluate", async (req: Request, res: Response) => {
  const { challenge, userSubmission = "" } = req.body;
  const startTime = Date.now();

  const trimmed = userSubmission.trim();
  const lower = trimmed.toLowerCase();

  // Rule 1: Check incomplete submission
  const trailingConnectives = [
    "the", "a", "an", "is", "are", "was", "were", "to", "in", "with", "and", "or",
    "because", "if", "for", "at", "about", "of", "on", "as", "by", "that", "this",
  ];
  const words = trimmed.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1]?.toLowerCase();
  const isPunct = /[.?!…]$/.test(trimmed);

  if (!isPunct && (words.length <= 2 || (lastWord && trailingConnectives.includes(lastWord)))) {
    return res.json({
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
      provider: "server-rule",
      model: "instant-detection",
      responseTimeMs: Date.now() - startTime,
    });
  }

  // Rule 2: Skip / Reveal answer
  if (!trimmed || lower === "skip" || lower === "(no answer provided)") {
    const targetWord = challenge?.targetWordFromCollection?.word || "từ mục tiêu";
    const prevStrength = challenge?.targetWordFromCollection?.strength ?? 0;
    const newStrength = Math.min(100, prevStrength + 10);

    return res.json({
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
        augmentedWords: challenge?.targetWordFromCollection ? [
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
      provider: "server-rule",
      model: "instant-evaluation",
      responseTimeMs: Date.now() - startTime,
    });
  }

  // Rule 3: LLM Evaluation with Cloudflare Worker Proxy or Gemini
  const proxyKey = extractProxyKey(req);
  const ai = getAI();
  const targetWord = challenge?.targetWordFromCollection?.word || "";
  const prevStrength = challenge?.targetWordFromCollection?.strength ?? 0;

  const clueWords = (challenge?.keyTargetWords || []).map((k: any) => k.word);
  const clueWordsList = JSON.stringify(clueWords);

  const evalPrompt = `THÔNG TIN THỬ THÁCH:
- Câu tiếng Việt gốc: "${challenge?.nativeSentence || ""}"
- Ngữ cảnh thực tế: "${challenge?.topicContext || "Everyday communication"}"
- Từ vựng mục tiêu trọng tâm cần học viên vận dụng: "${targetWord}"
- Danh sách từ vựng gợi ý của thử thách: ${clueWordsList}
- Bản dịch tham khảo lý tưởng: "${challenge?.idealTranslation || ""}"

CÂU TRẢ LỜI CỦA HỌC VIÊN:
"${trimmed}"

QUY TẮC ĐÁNH GIÁ "incorporatedTargetWord" & "incorporatedVocabClues":
1. QUY TẮC CHÍNH XÁC CHO "incorporatedTargetWord":
   - Gán "incorporatedTargetWord": true NẾU VÀ CHỈ NẾU câu của học viên thực sự sử dụng từ vựng mục tiêu "${targetWord}".
     + Chấp nhận mọi dạng chia thì, số nhiều/số ít, tiền tố/hậu tố, biến thể trạng từ (-ly), phrasal verb tách rời, hoặc biến thể dấu gạch nối / khoảng trắng (ví dụ "cost-effective" / "cost effective").
   - BẮT BUỘC gán "incorporatedTargetWord": false NẾU học viên KHÔNG dùng từ "${targetWord}" (ví dụ: dùng từ đồng nghĩa khác như 'affordable' thay vì 'cost-effective', hoặc không nhắc đến, hoặc bỏ qua).
   - Khi "incorporatedTargetWord" là false: TUYỆT ĐỐI KHÔNG khen trong "whatWentWell" rằng học viên đã dùng "${targetWord}". Hãy khen từ đồng nghĩa/cấu trúc tự nhiên họ đã dùng trong "whatWentWell", và trong "areasForImprovement" gợi ý cách lồng ghép từ mục tiêu "${targetWord}".
   - Khi "incorporatedTargetWord" là true: Ghi nhận và khen ngợi cách dùng chuẩn xác của từ mục tiêu "${targetWord}" trong "whatWentWell".

2. QUY TẮC CHÍNH XÁC CHO "incorporatedVocabClues":
   - Đối chiếu câu dịch của học viên với danh sách từ gợi ý: ${clueWordsList}.
   - Trả về mảng "incorporatedVocabClues" chứa chính xác các từ gợi ý mà học viên ĐÃ THỰC SỰ SỬ DỤNG.
   - Nếu học viên không dùng từ gợi ý nào, trả về mảng rỗng [].
   - TUYỆT ĐỐI KHÔNG đưa từ vào danh sách nếu học viên không hề viết từ đó trong bản dịch.

STRICT EVALUATION INSTRUCTIONS:
1. STRICT CHECK FOR "incorporatedTargetWord":
   - Set "incorporatedTargetWord": true IF AND ONLY IF the learner actually included the featured target word "${targetWord}" or its valid grammatical inflections / forms (e.g. past tense, gerund, plural, adverbial forms like -ly, separable phrasal verb particles, or hyphen/space compound variants like "cost-effective" / "cost effective").
   - Set "incorporatedTargetWord": false IF the learner used an alternative synonym (e.g. "affordable" instead of "${targetWord}"), omitted it, or skipped.
   - When "incorporatedTargetWord" is false: Never claim in "whatWentWell" that the user used "${targetWord}". Instead, praise their natural synonym/phrasing in "whatWentWell" and suggest how to apply "${targetWord}" in "areasForImprovement".
   - When "incorporatedTargetWord" is true: Acknowledge and praise their correct use of "${targetWord}" in "whatWentWell".

2. STRICT CHECK FOR "incorporatedVocabClues":
   - Compare the learner's text against available clues: ${clueWordsList}.
   - Return an array of strings in "incorporatedVocabClues" containing the exact clue words the learner actually used.
   - Return [] if none were used. Do not include any clue words that do not appear in the learner's text.

3. SCORING & COACHING FEEDBACK:
   - "score": Integer 0 to 100 evaluating communicative accuracy and fluency.
   - "scoreLabel": High-energy encouraging label in Vietnamese (e.g., "Xuất sắc! 🌟", "Rất tốt! 👏", "Khá tốt! 👍", "Cần cố gắng thêm! 💪").
   - "targetWordUsed": The target word "${targetWord}".
   - "whatWentWell": Detailed encouraging praise in Vietnamese.
   - "areasForImprovement": Constructive, actionable tips in Vietnamese on grammar, vocabulary, or phrasing.
   - "correctedSentence": Natural, native-level English translation.
   - "suggestedVocabulary": 2-4 key words/phrases with Vietnamese translations, definitions, and brief examples.
Respond strictly in valid JSON with fields: score, scoreLabel, incorporatedTargetWord, targetWordUsed, incorporatedVocabClues, whatWentWell, areasForImprovement, correctedSentence, suggestedVocabulary: [{word, translation, partOfSpeech, definition, example, exampleTranslation}].`;

  // Option A: Evaluate via Cloudflare Worker Proxy
  if (proxyKey) {
    try {
      const result = await executeChatCompletionWithRotation(
        {
          messages: [
            { role: "system", content: "You are an expert bilingual Vietnamese-English translation coach. Follow the strict evaluation guidelines with precision and return valid JSON only." },
            { role: "user", content: evalPrompt }
          ],
          temperature: 0.2,
          response_format: { type: "json_object" }
        },
        proxyKey
      );

      let parsed: any = {};
      try {
        parsed = JSON.parse(result.content);
      } catch {
        const match = result.content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      }

      if (parsed && typeof parsed.score !== "undefined") {
        const didIncorporate = Boolean(parsed.incorporatedTargetWord);
        const strengthGained = didIncorporate ? 30 : 10;
        const newStrength = Math.min(100, prevStrength + strengthGained);

        return res.json({
          intent: "submission",
          evaluation: {
            score: typeof parsed.score === "number" ? parsed.score : (didIncorporate ? 90 : 75),
            scoreLabel: parsed.scoreLabel || (didIncorporate ? "Xuất sắc! 🌟" : "Làm tốt lắm! 👏"),
            userTranslation: trimmed,
            incorporatedTargetWord: didIncorporate,
            targetWordUsed: parsed.targetWordUsed || targetWord,
            incorporatedVocabClues: Array.isArray(parsed.incorporatedVocabClues)
              ? parsed.incorporatedVocabClues
              : [],
            whatWentWell: parsed.whatWentWell || "",
            areasForImprovement: parsed.areasForImprovement || "",
            correctedSentence: parsed.correctedSentence || challenge?.idealTranslation || "Optimal translation.",
            suggestedVocabulary: parsed.suggestedVocabulary || [],
            targetWordPrevStrength: prevStrength,
            targetWordNewStrength: newStrength,
            targetWordStrengthGained: strengthGained,
            augmentedWords: challenge?.targetWordFromCollection ? [
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
          provider: result.provider,
          model: result.model,
          tier: result.tier,
          responseTimeMs: Date.now() - startTime,
        });
      }
    } catch (proxyErr: any) {
      console.warn("[Evaluate] Cloudflare Worker proxy error:", proxyErr);
      if (!ai) {
        return res.status(502).json({
          error: proxyErr.message || "Lỗi kết nối mô hình chấm câu",
          failedModel: proxyErr.failedModel,
          status: "error"
        });
      }
    }
  }

  // Option B: Evaluate via Gemini if available
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: evalPrompt,
        config: {
          systemInstruction: "You are an expert bilingual Vietnamese-English translation coach. Follow the strict evaluation guidelines with precision and return valid JSON only.",
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.INTEGER },
              scoreLabel: { type: Type.STRING },
              userTranslation: { type: Type.STRING },
              incorporatedTargetWord: { type: Type.BOOLEAN },
              targetWordUsed: { type: Type.STRING },
              incorporatedVocabClues: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              whatWentWell: { type: Type.STRING },
              areasForImprovement: { type: Type.STRING },
              correctedSentence: { type: Type.STRING },
              suggestedVocabulary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    translation: { type: Type.STRING },
                    partOfSpeech: { type: Type.STRING },
                    definition: { type: Type.STRING },
                    example: { type: Type.STRING },
                    exampleTranslation: { type: Type.STRING },
                  },
                  required: ["word", "translation"],
                },
              },
            },
            required: [
              "score",
              "scoreLabel",
              "incorporatedTargetWord",
              "targetWordUsed",
              "incorporatedVocabClues",
              "whatWentWell",
              "areasForImprovement",
              "correctedSentence",
              "suggestedVocabulary",
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || "{}");

      // Direct LLM evaluation (preserve model's authoritative evaluation)
      const didIncorporate = Boolean(parsed.incorporatedTargetWord);
      // Do NOT overwrite evaluation.incorporatedTargetWord with a regex check!
      // Do NOT overwrite evaluation.incorporatedVocabClues!

      const strengthGained = didIncorporate ? 30 : 10;
      const newStrength = Math.min(100, prevStrength + strengthGained);

      return res.json({
        intent: "submission",
        evaluation: {
          score: typeof parsed.score === "number" ? parsed.score : (didIncorporate ? 90 : 75),
          scoreLabel: parsed.scoreLabel || (didIncorporate ? "Xuất sắc! 🌟" : "Làm tốt lắm! 👏"),
          userTranslation: trimmed,
          incorporatedTargetWord: didIncorporate,
          targetWordUsed: parsed.targetWordUsed || targetWord,
          incorporatedVocabClues: Array.isArray(parsed.incorporatedVocabClues)
            ? parsed.incorporatedVocabClues
            : [],
          whatWentWell: parsed.whatWentWell || "",
          areasForImprovement: parsed.areasForImprovement || "",
          correctedSentence: parsed.correctedSentence || challenge?.idealTranslation || "Optimal translation.",
          suggestedVocabulary: parsed.suggestedVocabulary || [],
          targetWordPrevStrength: prevStrength,
          targetWordNewStrength: newStrength,
          targetWordStrengthGained: strengthGained,
          augmentedWords: challenge?.targetWordFromCollection ? [
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
        provider: "gemini-api",
        model: "gemini-3.8-flash",
        responseTimeMs: Date.now() - startTime,
      });
    } catch (err) {
      console.error("Gemini evaluation error, falling back to rule evaluator:", err);
    }
  }

  // Fallback programmatic evaluator
  const didIncorporate = targetWord ? lower.includes(targetWord.toLowerCase()) : false;
  const score = didIncorporate ? 92 : 75;
  const strengthGained = didIncorporate ? 30 : 10;
  const newStrength = Math.min(100, prevStrength + strengthGained);

  const matchedClues = (challenge?.keyTargetWords || [])
    .filter((k: any) => lower.includes(k.word.toLowerCase()))
    .map((k: any) => k.word);

  return res.json({
    intent: "submission",
    evaluation: {
      score,
      scoreLabel: didIncorporate ? "Xuất sắc! 🌟" : "Làm tốt lắm! 👏",
      userTranslation: trimmed,
      incorporatedTargetWord: didIncorporate,
      targetWordUsed: targetWord,
      incorporatedVocabClues: matchedClues,
      targetWordPrevStrength: prevStrength,
      targetWordNewStrength: newStrength,
      targetWordStrengthGained: strengthGained,
      whatWentWell: didIncorporate
        ? `Tuyệt vời! Bạn đã sử dụng chính xác từ mục tiêu "${targetWord}" đúng ngữ cảnh.`
        : `Bạn đã truyền tải tốt ý nghĩa câu gốc bằng từ ngữ mạch lạc.`,
      areasForImprovement: didIncorporate
        ? "Cấu trúc câu rất ổn. Chú ý thêm về cách chọn mạo từ để câu hoàn hảo hơn."
        : `Thử vận dụng từ vựng mục tiêu "${targetWord}" để tăng điểm ghi nhớ.`,
      correctedSentence: challenge?.idealTranslation || "Optimal translation.",
      suggestedVocabulary: (challenge?.keyTargetWords || []).map((k: any) => ({
        word: k.word,
        translation: k.translation,
        partOfSpeech: k.partOfSpeech,
      })),
      augmentedWords: challenge?.targetWordFromCollection ? [
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
    provider: "local-evaluator",
    model: "rule-v1",
    responseTimeMs: Date.now() - startTime,
  });
});

// 4. Ask AI Tutor Endpoint
app.post("/api/challenge/ask-ai", async (req: Request, res: Response) => {
  const { challenge, userQuestion, userTranslation } = req.body;
  const proxyKey = extractProxyKey(req);
  const ai = getAI();

  if (userQuestion) {
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

    // Option A: Cloudflare Worker Proxy
    if (proxyKey) {
      try {
        const result = await executeChatCompletionWithRotation(
          {
            messages: [
              { role: "system", content: "You are a friendly, expert bilingual English-Vietnamese tutor. Return JSON with 'answer' and 'suggestedFollowUps'." },
              { role: "user", content: tutorPrompt }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
          },
          proxyKey
        );

        let parsed: any = {};
        try {
          parsed = JSON.parse(result.content);
        } catch {
          const match = result.content.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        }

        if (parsed && parsed.answer) {
          return res.json(parsed);
        }
      } catch (err: any) {
        console.warn("[Ask AI] Cloudflare Worker proxy error:", err);
        if (!ai) {
          return res.status(502).json({
            error: err.message || "Lỗi kết nối mô hình gia sư AI",
            failedModel: err.failedModel,
            status: "error"
          });
        }
      }
    }

    // Option B: Gemini API
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: tutorPrompt,
          config: {
            systemInstruction: "You are a friendly, expert bilingual English-Vietnamese tutor. Return JSON with 'answer' and 'suggestedFollowUps'.",
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                answer: { type: Type.STRING },
                suggestedFollowUps: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["answer"],
            },
          },
        });

        const parsed = JSON.parse(response.text || "{}");
        return res.json(parsed);
      } catch (err) {
        console.error("Ask AI error:", err);
      }
    }
  }

  // Fallback tutor response
  return res.json({
    answer: `Gia sư AI: Về câu hỏi "${userQuestion}" trong câu *"${challenge?.nativeSentence}"*:\n\nTrong giao tiếp hàng ngày ở tình huống "${challenge?.topicContext || "đời sống"}", người bản ngữ ưu tiên cách nói tự nhiên: *"${challenge?.idealTranslation}"*. Cụm từ "${challenge?.targetWordFromCollection?.word || "từ vựng"}" giúp câu diễn đạt chuẩn xác và giàu sắc thái nhất.`,
    suggestedFollowUps: [
      "Có thể dùng từ nào khác đồng nghĩa không?",
      "Cụm này dùng trong văn cảnh trang trọng hay thân mật?",
    ],
  });
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Translation Challenge Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
