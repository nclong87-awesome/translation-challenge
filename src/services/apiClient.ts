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

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = getStoredAccessKey();
  if (key) {
    // MANDATORY Cloudflare Workers ingress header
    headers["X-Proxy-Key"] = key;
    headers["x-access-key"] = key;
    headers["Authorization"] = `Bearer ${key}`;
  }
  return headers;
}

export async function generateChallenge(userCollection: UserVocabItem[] = []): Promise<ChallengeData> {
  if (isStoredSampleMode()) {
    return mockGenerateChallenge(userCollection);
  }

  const startTime = Date.now();
  const promptSummary = `Generate Vietnamese->English challenge with ${userCollection.length} candidate words`;

  try {
    const res = await fetch("/api/challenge/generate", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        candidates: userCollection,
        isDailyConversationFallback: false,
      }),
    });

    const durationMs = Date.now() - startTime;
    if (res.ok) {
      const data = await res.json();
      if (data && data.nativeSentence) {
        logApiRequest({
          provider: data.provider || "cloudflare-proxy",
          model: data.model || "auto",
          prompt: promptSummary,
          systemInstruction: "Expert bilingual Vietnamese-English translation coach",
          response: JSON.stringify(data),
          responseTimeMs: durationMs,
          status: "success",
          statusCode: res.status,
          action: "Translation Challenge"
        }).catch(() => {});
        return data;
      }
    } else {
      const errText = await res.text();
      logApiRequest({
        provider: "cloudflare-proxy",
        model: "auto",
        prompt: promptSummary,
        response: errText,
        responseTimeMs: durationMs,
        status: "error",
        statusCode: res.status,
        errorMessage: errText,
        action: "Translation Challenge"
      }).catch(() => {});
    }
  } catch (err: any) {
    console.warn("Using local challenge generator fallback:", err);
    logApiRequest({
      provider: "cloudflare-proxy",
      model: "auto",
      prompt: promptSummary,
      response: err.message || String(err),
      responseTimeMs: Date.now() - startTime,
      status: "error",
      statusCode: 500,
      errorMessage: err.message || String(err),
      action: "Translation Challenge"
    }).catch(() => {});
  }

  // Fallback to robust local engine
  return mockGenerateChallenge(userCollection);
}

export async function evaluateChallengeTurn(
  challenge: ChallengeData,
  userMessage: string
): Promise<ChallengeTurnResult> {
  if (isStoredSampleMode()) {
    return mockProcessChallengeTurn(challenge, userMessage);
  }

  const startTime = Date.now();
  const promptSummary = `Evaluate: "${userMessage}" for target: "${challenge?.targetWordFromCollection?.word}"`;

  try {
    const res = await fetch("/api/challenge/evaluate", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        challenge,
        userSubmission: userMessage,
      }),
    });

    const durationMs = Date.now() - startTime;
    if (res.ok) {
      const data = await res.json();
      if (data && (data.intent === "incomplete" || data.evaluation)) {
        logApiRequest({
          provider: data.provider || "cloudflare-proxy",
          model: data.model || "auto",
          prompt: promptSummary,
          response: JSON.stringify(data),
          responseTimeMs: durationMs,
          status: "success",
          statusCode: res.status,
          action: "Challenge Evaluation"
        }).catch(() => {});
        return data;
      }
    } else {
      const errText = await res.text();
      logApiRequest({
        provider: "cloudflare-proxy",
        model: "auto",
        prompt: promptSummary,
        response: errText,
        responseTimeMs: durationMs,
        status: "error",
        statusCode: res.status,
        errorMessage: errText,
        action: "Challenge Evaluation"
      }).catch(() => {});
    }
  } catch (err: any) {
    console.warn("Using local challenge evaluator fallback:", err);
    logApiRequest({
      provider: "cloudflare-proxy",
      model: "auto",
      prompt: promptSummary,
      response: err.message || String(err),
      responseTimeMs: Date.now() - startTime,
      status: "error",
      statusCode: 500,
      errorMessage: err.message || String(err),
      action: "Challenge Evaluation"
    }).catch(() => {});
  }

  // Fallback to local evaluator
  return mockProcessChallengeTurn(challenge, userMessage);
}

export async function askAiTutor(
  challenge: ChallengeData,
  userQuestion: string,
  userTranslation?: string
): Promise<AskAiResponse> {
  if (isStoredSampleMode()) {
    return mockAskAiQuestion(challenge, userQuestion, userTranslation);
  }

  const startTime = Date.now();
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

    const durationMs = Date.now() - startTime;
    if (res.ok) {
      const data = await res.json();
      if (data && data.answer) {
        logApiRequest({
          provider: "cloudflare-proxy",
          model: "auto",
          prompt: userQuestion,
          response: JSON.stringify(data),
          responseTimeMs: durationMs,
          status: "success",
          statusCode: res.status,
          action: "Challenge Ask AI"
        }).catch(() => {});
        return data;
      }
    }
  } catch (err: any) {
    console.warn("Using local AI tutor fallback:", err);
    logApiRequest({
      provider: "cloudflare-proxy",
      model: "auto",
      prompt: userQuestion,
      response: err.message || String(err),
      responseTimeMs: Date.now() - startTime,
      status: "error",
      statusCode: 500,
      errorMessage: err.message || String(err),
      action: "Challenge Ask AI"
    }).catch(() => {});
  }

  return mockAskAiQuestion(challenge, userQuestion, userTranslation);
}
