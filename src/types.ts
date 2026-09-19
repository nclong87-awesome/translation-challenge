export interface UserVocabItem {
  id: string;
  word: string; // Supports single word or multi-word phrase
  translation: string;
  definition?: string;
  partOfSpeech?: string;
  strength: number; // 0 to 100
  lastAppearedAt?: string; // ISO timestamp of last appearance
  addedAt: string;
}

export interface ChallengeKeyWord {
  word: string;
  translation: string;
  partOfSpeech?: string;
  hint?: string;
}

export interface ChallengeData {
  id: string;
  nativeSentence: string;
  targetLanguage: string;
  nativeLanguage: string;
  topicContext?: string; // Descriptive 2-4 word label freely chosen by the LLM (e.g. "Kẹt xe giờ tan tầm", "Mượn đồ đồng nghiệp")
  idealTranslation?: string;
  keyTargetWords?: ChallengeKeyWord[];
  targetWordFromCollection?: {
    id?: string;
    word: string; // Supports words and phrases
    translation?: string;
    definition?: string;
    hint?: string;
    strength?: number;
    partOfSpeech?: string;
    lastAppearedAt?: string;
  };
  isDailyConversationFallback?: boolean; // True when generated from common daily vocab
  personalityNote?: string;
  createdAt: string;
  provider?: string;
  model?: string;
  responseTimeMs?: number;
}

export interface ChallengeSuggestedVocab {
  word: string;
  translation: string;
  definition?: string;
  partOfSpeech?: string;
  hint?: string;
  example?: string;
  exampleTranslation?: string;
  askedByUser?: boolean;
}

export interface ChallengeAugmentedWord {
  word: string;
  translation?: string;
  prevStrength: number;
  newStrength: number;
  strengthGained: number;
  isTargetWord?: boolean;
  isVocabClue?: boolean;
  wasAlreadyInCollection?: boolean;
}

export interface ChallengeEvaluation {
  score: number; // 0 - 100
  scoreLabel: string;
  whatWentWell: string;
  areasForImprovement: string;
  correctedSentence: string;
  userTranslation: string;
  suggestedVocabulary: ChallengeSuggestedVocab[];
  incorporatedTargetWord?: boolean;
  targetWordUsed?: string;
  targetWordStrengthGained?: number;
  targetWordNewStrength?: number;
  targetWordPrevStrength?: number;
  augmentedWords?: ChallengeAugmentedWord[];
  incorporatedVocabClues?: string[];
  provider?: string;
  model?: string;
  responseTimeMs?: number;
}

export interface ChallengeTurnResult {
  intent: "submission" | "incomplete" | "assistance";
  agentReply?: string;
  suggestedActions?: Array<{
    label: string;
    action: string;
    payload?: any;
  }>;
  evaluation?: ChallengeEvaluation;
  provider?: string;
  model?: string;
  responseTimeMs?: number;
}

export interface AskAiResponse {
  answer: string;
  suggestedFollowUps?: string[];
}

export interface ApiRequestLog {
  id: string;                         // Unique identifier: `req_${Date.now()}_${random}`
  timestamp: string;                  // ISO 8601 string
  provider: string;                   // e.g., "groq", "openrouter", "gemini", "9flare", "ollama", "cloudflare"
  model: string;                      // e.g., "llama-3.3-70b-versatile", "google/gemini-2.5-flash"
  action?: string;                    // Auto-detected functional category (e.g., "Chat", "Translation Challenge", "AI Quiz")
  prompt: string;                     // Full user prompt content
  systemInstruction?: string;         // System prompt instruction if provided
  schemaDescription?: string;         // Structured JSON schema if enforced
  response: string;                   // Parsed or sanitized response text
  rawResponse?: string;               // Unaltered raw response text or error body
  responseTimeMs: number;             // End-to-end round-trip latency in milliseconds
  status: 'success' | 'error';        // Execution outcome
  statusCode?: number;                // HTTP status code (200, 429, 500, 502, etc.)
  errorMessage?: string;              // Error description if request failed
}

export interface ModelMetricsRecord {
  provider: string;
  model: string;
  lastResponseTimeMs: number | null;
  avgResponseTimeMs: number | null;
  recentResponseTimes: number[];
  recentOutcomes: Array<{
    success: boolean;
    durationMs?: number;
    timestamp: number;
  }>;
  lastTestedAt: number | null;
  lastError: string | null;
  totalCalls: number;
  totalSuccesses: number;
  failureLogs: Array<{
    id: string;
    timestamp: number;
    reason: string;
  }>;
}

export interface LockedModelInfo {
  provider: string;
  model: string;
  lockedAt: number;
  expiresAt: number;
  reason?: string;
}

export interface GatewayStatusResponse {
  metrics: Record<string, ModelMetricsRecord>;
  lockedModels: Record<string, LockedModelInfo>;
  timestamp?: string;
  status?: string;
  service?: string;
}

