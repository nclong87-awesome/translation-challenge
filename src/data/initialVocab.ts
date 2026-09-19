import { UserVocabItem } from "../types";

const NOW = Date.now();
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

export const INITIAL_USER_VOCAB: UserVocabItem[] = [
  {
    id: "vocab-1",
    word: "resilience",
    translation: "sự kiên cường, khả năng phục hồi",
    definition: "The capacity to recover quickly from difficulties; toughness.",
    partOfSpeech: "noun",
    strength: 25,
    // Last appeared 3 days ago -> ELIGIBLE (> 24 hours)
    lastAppearedAt: new Date(NOW - 3 * ONE_DAY).toISOString(),
    addedAt: new Date(NOW - 5 * ONE_DAY).toISOString(),
  },
  {
    id: "vocab-2",
    word: "tweak",
    translation: "tinh chỉnh, điều chỉnh nhỏ",
    definition: "To make fine adjustments to a mechanism or system.",
    partOfSpeech: "verb",
    strength: 40,
    // Last appeared 2 days ago -> ELIGIBLE (> 24 hours)
    lastAppearedAt: new Date(NOW - 2 * ONE_DAY).toISOString(),
    addedAt: new Date(NOW - 4 * ONE_DAY).toISOString(),
  },
  {
    id: "vocab-3",
    word: "break the ice",
    translation: "phá tan bầu không khí ngượng ngùng",
    definition: "To do or say something that makes people feel more relaxed.",
    partOfSpeech: "idiom",
    strength: 15,
    // Last appeared 4 days ago -> ELIGIBLE (> 24 hours)
    lastAppearedAt: new Date(NOW - 4 * ONE_DAY).toISOString(),
    addedAt: new Date(NOW - 6 * ONE_DAY).toISOString(),
  },
  {
    id: "vocab-4",
    word: "keep an eye on",
    translation: "để mắt tới, trông coi giúp",
    definition: "To watch or take care of something or someone carefully.",
    partOfSpeech: "phrase",
    strength: 70,
    // Last appeared 3 hours ago -> ON COOLDOWN (< 24 hours)
    lastAppearedAt: new Date(NOW - 3 * ONE_HOUR).toISOString(),
    addedAt: new Date(NOW - 2 * ONE_DAY).toISOString(),
  },
  {
    id: "vocab-5",
    word: "catch up with",
    translation: "gặp gỡ hàn huyên tâm sự",
    definition: "To communicate with someone after a period of separation.",
    partOfSpeech: "phrase",
    strength: 55,
    // Last appeared 6 hours ago -> ON COOLDOWN (< 24 hours)
    lastAppearedAt: new Date(NOW - 6 * ONE_HOUR).toISOString(),
    addedAt: new Date(NOW - 2 * ONE_DAY).toISOString(),
  },
  {
    id: "vocab-6",
    word: "adapt to",
    translation: "thích nghi với hoàn cảnh mới",
    definition: "To change ideas or behaviour so they are suitable for a new situation.",
    partOfSpeech: "verb",
    strength: 10,
    // Never appeared -> ELIGIBLE IMMEDIATELY
    lastAppearedAt: undefined,
    addedAt: new Date(NOW - 1 * ONE_DAY).toISOString(),
  },
];

const STORAGE_KEY = "translation_challenge_vocab_collection";

export function loadUserVocab(): UserVocabItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Failed to load user vocab from localStorage", e);
  }
  return INITIAL_USER_VOCAB;
}

export function saveUserVocab(vocab: UserVocabItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vocab));
  } catch (e) {
    console.error("Failed to save user vocab to localStorage", e);
  }
}
