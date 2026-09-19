import { ApiRequestLog } from "../types";
import { saveApiRequestLogToDB, getApiRequestLogsFromDB, clearApiRequestLogsFromDB } from "../db/indexedDB";

/**
 * Detects the functional action category of an LLM prompt.
 */
export function detectActionCategory(
  prompt: string, 
  systemInstruction?: string, 
  schemaDescription?: string,
  explicitAction?: string,
  response?: string
): string {
  if (explicitAction) return explicitAction;

  const combined = `${prompt || ""} ${systemInstruction || ""} ${schemaDescription || ""}`.toLowerCase();
  const resp = (response || "").toLowerCase();

  if (combined.includes('status": "connected"') || combined.includes("/api/test-llm") || combined.includes("connection test")) {
    return "Connection Test";
  }
  if (combined.includes("evaluate a language learner's translation attempt") || combined.includes("challenge-turn") || combined.includes("quy tắc đánh giá")) {
    return "Challenge Evaluation";
  }
  if (combined.includes("translation challenge tutor") || combined.includes("ask-ai-challenge") || combined.includes("language tutor")) {
    return "Challenge Ask AI";
  }
  if (combined.includes("translation challenge") || combined.includes("generate-challenge") || combined.includes("mode a (collection candidates")) {
    return "Translation Challenge";
  }
  if (combined.includes("generate-quiz") || combined.includes("quizquestion")) {
    return "AI Quiz";
  }
  if (combined.includes("grammar") || combined.includes("polish")) {
    return "Grammar Polish";
  }
  if (combined.includes("personality") || combined.includes("learner profiling")) {
    return "Learner Profile";
  }
  return "Chat";
}

/**
 * Records an API request and response log into IndexedDB.
 */
export async function logApiRequest(params: {
  provider: string;
  model: string;
  prompt: string;
  systemInstruction?: string;
  schemaDescription?: string;
  response: string;
  rawResponse?: string;
  responseTimeMs: number;
  status: 'success' | 'error';
  statusCode?: number;
  errorMessage?: string;
  action?: string;
}): Promise<void> {
  const action = detectActionCategory(
    params.prompt, 
    params.systemInstruction, 
    params.schemaDescription, 
    params.action,
    params.response
  );
  const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();

  const entry: ApiRequestLog = {
    id,
    timestamp,
    provider: params.provider || "auto",
    model: params.model || "auto",
    action,
    prompt: params.prompt || "",
    systemInstruction: params.systemInstruction,
    schemaDescription: params.schemaDescription,
    response: params.response || "",
    rawResponse: params.rawResponse !== undefined ? params.rawResponse : (params.status === "error" ? undefined : params.response),
    responseTimeMs: Math.max(1, Math.round(params.responseTimeMs || 0)),
    status: params.status,
    statusCode: params.statusCode ?? (params.status === "success" ? 200 : 500),
    errorMessage: params.errorMessage
  };

  await saveApiRequestLogToDB(entry);
}

export { getApiRequestLogsFromDB, clearApiRequestLogsFromDB };
