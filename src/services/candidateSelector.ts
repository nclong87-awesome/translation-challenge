import { UserVocabItem } from "../types";

// Fallback pool of common daily conversational words and phrases
export const DAILY_CONVERSATION_FALLBACK_POOL: Array<Omit<UserVocabItem, "id" | "addedAt">> = [
  {
    word: "catch up with",
    translation: "gặp gỡ trò chuyện sau thời gian dài",
    partOfSpeech: "phrase",
    definition: "To talk to someone you have not seen for some time to find out what they have been doing.",
    strength: 0,
  },
  {
    word: "run out of",
    translation: "hết, cạn kiệt (tiền, pin, thời gian)",
    partOfSpeech: "phrase",
    definition: "To finish, use, or sell all of something, so that there is none left.",
    strength: 0,
  },
  {
    word: "make an appointment",
    translation: "hẹn lịch, đặt hẹn",
    partOfSpeech: "phrase",
    definition: "An arrangement to meet someone at a particular time and place.",
    strength: 0,
  },
  {
    word: "grab a bite",
    translation: "đi ăn nhanh một bữa",
    partOfSpeech: "phrase",
    definition: "To get something to eat quickly, usually informal.",
    strength: 0,
  },
  {
    word: "keep an eye on",
    translation: "để mắt tới, trông coi giúp",
    partOfSpeech: "phrase",
    definition: "To watch or take care of something or someone carefully.",
    strength: 0,
  },
  {
    word: "convenient",
    translation: "tiện lợi, thuận tiện",
    partOfSpeech: "adjective",
    definition: "Suitable for your purposes and needs and causing the least difficulty.",
    strength: 0,
  },
  {
    word: "postpone",
    translation: "trì hoãn, dời lịch",
    partOfSpeech: "verb",
    definition: "To delay an event and plan or decide that it should happen at a later date or time.",
    strength: 0,
  },
  {
    word: "recommendation",
    translation: "sự giới thiệu, lời khuyên nên thử",
    partOfSpeech: "noun",
    definition: "A suggestion that something is good or suitable for a particular purpose.",
    strength: 0,
  },
  {
    word: "give someone a hand",
    translation: "giúp ai đó một tay",
    partOfSpeech: "phrase",
    definition: "To help someone with something.",
    strength: 0,
  },
  {
    word: "out of order",
    translation: "bị hỏng, không hoạt động",
    partOfSpeech: "phrase",
    definition: "Not working, broken, or temporarily unavailable.",
    strength: 0,
  },
];

export const ONE_DAY_MS = 24 * 60 * 60 * 1000; // 86,400,000 ms (24 hours)

/**
 * Checks whether an item is eligible for review (> 24 hours since last appearance or never appeared)
 */
export function isItemEligibleForReview(item: UserVocabItem, nowMs = Date.now()): boolean {
  if (!item.lastAppearedAt) return true;
  const timeSinceLastAppearance = nowMs - new Date(item.lastAppearedAt).getTime();
  return timeSinceLastAppearance > ONE_DAY_MS;
}

/**
 * Formats time remaining until 24h cooldown expires
 */
export function getTimeUntilReview(item: UserVocabItem, nowMs = Date.now()): string {
  if (!item.lastAppearedAt) return "Sẵn sàng ngay";
  const timeSinceLast = nowMs - new Date(item.lastAppearedAt).getTime();
  const diff = ONE_DAY_MS - timeSinceLast;
  if (diff <= 0) return "Sẵn sàng ngay";
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `Còn ${hours} giờ ${minutes} phút`;
  return `Còn ${minutes} phút`;
}

/**
 * Selects candidate words/phrases:
 * - Prioritizes user collection items last appeared > 1 day ago
 * - Sorts by oldest appearance first, then lowest strength
 * - Falls back to daily conversation pool if 0 eligible items
 */
export function selectChallengeCandidates(
  collection: UserVocabItem[],
  maxCandidates = 6,
  nowMs = Date.now()
): {
  candidates: UserVocabItem[];
  isDailyConversationFallback: boolean;
} {
  // 1. Filter: Words/phrases never appeared OR last appeared more than 1 day ago
  const eligibleFromCollection = collection.filter((item) => isItemEligibleForReview(item, nowMs));

  // 2. If eligible collection items exist, sort by oldest appearance first, then lowest strength
  if (eligibleFromCollection.length > 0) {
    const sorted = [...eligibleFromCollection].sort((a, b) => {
      const aTime = a.lastAppearedAt ? new Date(a.lastAppearedAt).getTime() : 0;
      const bTime = b.lastAppearedAt ? new Date(b.lastAppearedAt).getTime() : 0;
      if (aTime !== bTime) return aTime - bTime; // Oldest appearance first
      return a.strength - b.strength; // Lowest strength first
    });

    return {
      candidates: sorted.slice(0, maxCandidates),
      isDailyConversationFallback: false,
    };
  }

  // 3. Fallback: Use common daily conversational words/phrases
  const fallbackCandidates: UserVocabItem[] = DAILY_CONVERSATION_FALLBACK_POOL.slice(0, maxCandidates).map(
    (item, index) => ({
      ...item,
      id: `fallback-${index}-${Date.now()}`,
      addedAt: new Date().toISOString(),
    })
  );

  return {
    candidates: fallbackCandidates,
    isDailyConversationFallback: true,
  };
}
