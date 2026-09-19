import { ApiRequestLog } from "../types";
import { PROVIDER_OPTIONS } from "../config/llmProviders";

const DB_NAME = "VocabLearnerDB";
const DB_VERSION = 5;
const STORES = {
  apiLogs: "apiLogs"
};

/**
 * Calculates dynamic maximum capacity for API history entries.
 * Retains at least 100 entries, scaling proportionally with the number of available models.
 */
export function getMaxApiLogsLimit(): number {
  const totalModelsCount = PROVIDER_OPTIONS.reduce((acc, provider) => {
    if (provider.id === "auto") return acc;
    return acc + (provider.models ? provider.models.length : 0);
  }, 0);
  return Math.max(100, totalModelsCount * 15);
}

/**
 * Helper to open the IndexedDB instance with version management.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.apiLogs)) {
        db.createObjectStore(STORES.apiLogs, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves a request/response log entry to the 'apiLogs' store.
 * Automatically deletes oldest records if the collection exceeds the retention limit.
 */
export async function saveApiRequestLogToDB(log: ApiRequestLog): Promise<void> {
  try {
    const db = await openDB();
    const maxLogs = getMaxApiLogsLimit();

    const tx = db.transaction([STORES.apiLogs], "readwrite");
    const store = tx.objectStore(STORES.apiLogs);

    // Persist new entry
    store.put(log);

    // Read all records to trim to max logs limit (FIFO)
    const allLogsReq = store.getAll();
    allLogsReq.onsuccess = () => {
      const allLogs = (allLogsReq.result ?? []) as ApiRequestLog[];
      if (allLogs.length > maxLogs) {
        // Sort oldest first and delete overflow entries
        allLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const toDelete = allLogs.slice(0, allLogs.length - maxLogs);
        for (const item of toDelete) {
          if (item.id) store.delete(item.id);
        }
      }
    };

    tx.oncomplete = () => {
      // Dispatch event to trigger reactive UI updates in Request History Modals
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vocab-api-logs-updated"));
      }
    };
  } catch (err) {
    console.warn("Notice: could not save API request log to IndexedDB:", err);
  }
}

/**
 * Retrieves logged entries sorted newest first up to the specified limit.
 */
export async function getApiRequestLogsFromDB(limit?: number): Promise<ApiRequestLog[]> {
  try {
    const db = await openDB();
    const maxLimit = typeof limit === "number" ? limit : getMaxApiLogsLimit();

    const tx = db.transaction([STORES.apiLogs], "readonly");
    const store = tx.objectStore(STORES.apiLogs);

    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const logs = (request.result ?? []) as ApiRequestLog[];
        // Sort newest first
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        resolve(logs.slice(0, maxLimit));
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn("Notice: could not load API request logs from IndexedDB:", err);
    return [];
  }
}

/**
 * Clears all API request/response logs from IndexedDB.
 */
export async function clearApiRequestLogsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORES.apiLogs], "readwrite");
    tx.objectStore(STORES.apiLogs).clear();

    tx.oncomplete = () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vocab-api-logs-updated"));
      }
    };
  } catch (err) {
    console.warn("Notice: could not clear API request logs in IndexedDB:", err);
  }
}
