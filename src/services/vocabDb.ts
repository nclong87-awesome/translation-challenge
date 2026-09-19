import { UserVocabItem } from "../types";
import { INITIAL_USER_VOCAB } from "../data/initialVocab";

const DB_NAME = "TranslationChallengeDB";
const DB_VERSION = 1;
const VOCAB_STORE = "vocab_items";
const LEGACY_STORAGE_KEY = "translation_challenge_vocab_collection";

let dbInstance: IDBDatabase | null = null;

/**
 * Open or retrieve the IndexedDB database instance.
 */
export function openVocabDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VOCAB_STORE)) {
        const store = db.createObjectStore(VOCAB_STORE, { keyPath: "id" });
        store.createIndex("by_word", "word", { unique: false });
        store.createIndex("by_lastAppearedAt", "lastAppearedAt", { unique: false });
        store.createIndex("by_strength", "strength", { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Check if legacy localStorage exists and can be migrated.
 */
function getLegacyLocalStorageVocab(): UserVocabItem[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not read legacy localStorage vocab:", e);
  }
  return null;
}

/**
 * Initialize vocabulary database: seeds INITIAL_USER_VOCAB or migrates from localStorage if empty.
 */
export async function initializeVocabDB(): Promise<UserVocabItem[]> {
  const db = await openVocabDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([VOCAB_STORE], "readonly");
    const store = transaction.objectStore(VOCAB_STORE);
    const countRequest = store.count();

    countRequest.onsuccess = async () => {
      if (countRequest.result === 0) {
        // Empty store -> Seed with legacy localStorage or INITIAL_USER_VOCAB
        const legacyItems = getLegacyLocalStorageVocab();
        const seedItems = legacyItems && legacyItems.length > 0 ? legacyItems : INITIAL_USER_VOCAB;

        try {
          await saveAllVocab(seedItems);
          resolve(seedItems);
        } catch (err) {
          reject(err);
        }
      } else {
        // Read existing items
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          resolve((getAllRequest.result as UserVocabItem[]) || []);
        };
        getAllRequest.onerror = () => {
          reject(getAllRequest.error || new Error("Failed to fetch vocab items"));
        };
      }
    };

    countRequest.onerror = () => {
      reject(countRequest.error || new Error("Failed to count vocab items"));
    };
  });
}

/**
 * Fetch all vocabulary items from IndexedDB.
 */
export async function getAllVocab(): Promise<UserVocabItem[]> {
  try {
    const db = await openVocabDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([VOCAB_STORE], "readonly");
      const store = tx.objectStore(VOCAB_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result as UserVocabItem[]) || []);
      };

      request.onerror = () => {
        reject(request.error || new Error("Failed to read from IndexedDB"));
      };
    });
  } catch (err) {
    console.warn("IndexedDB read error, falling back to initial data:", err);
    return getLegacyLocalStorageVocab() || INITIAL_USER_VOCAB;
  }
}

/**
 * Save a single vocabulary item (insert or update) into IndexedDB.
 */
export async function saveVocabItem(item: UserVocabItem): Promise<void> {
  try {
    const db = await openVocabDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([VOCAB_STORE], "readwrite");
      const store = tx.objectStore(VOCAB_STORE);
      const req = store.put(item);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error("Failed to save vocab item to IndexedDB"));
    });
  } catch (err) {
    console.error("IndexedDB save error:", err);
  }
}

/**
 * Save or overwrite the entire vocabulary collection in IndexedDB.
 */
export async function saveAllVocab(items: UserVocabItem[]): Promise<void> {
  try {
    const db = await openVocabDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([VOCAB_STORE], "readwrite");
      const store = tx.objectStore(VOCAB_STORE);

      // Clear existing records and bulk put
      store.clear();
      for (const item of items) {
        store.put(item);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to save collection to IndexedDB"));
    });
  } catch (err) {
    console.error("IndexedDB saveAll error:", err);
  }
}

/**
 * Delete a vocabulary item by ID from IndexedDB.
 */
export async function deleteVocabItem(id: string): Promise<void> {
  try {
    const db = await openVocabDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([VOCAB_STORE], "readwrite");
      const store = tx.objectStore(VOCAB_STORE);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error("Failed to delete vocab item from IndexedDB"));
    });
  } catch (err) {
    console.error("IndexedDB delete error:", err);
  }
}

/**
 * Reset vocabulary collection back to INITIAL_USER_VOCAB defaults.
 */
export async function resetVocabToDefault(): Promise<UserVocabItem[]> {
  await saveAllVocab(INITIAL_USER_VOCAB);
  return INITIAL_USER_VOCAB;
}
