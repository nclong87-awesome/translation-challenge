export const ACCESS_KEY_STORAGE_KEY = "app_access_key";
export const SAMPLE_MODE_STORAGE_KEY = "app_sample_mode";

export function getStoredAccessKey(): string | null {
  try {
    const key = localStorage.getItem(ACCESS_KEY_STORAGE_KEY);
    if (key && key.trim().length > 0) {
      return key.trim();
    }
  } catch (err) {
    console.error("Failed to read access key from localStorage:", err);
  }
  return null;
}

export function setStoredAccessKey(key: string): void {
  try {
    localStorage.setItem(ACCESS_KEY_STORAGE_KEY, key.trim());
    // Clear sample mode flag if a real key is provided
    localStorage.removeItem(SAMPLE_MODE_STORAGE_KEY);
  } catch (err) {
    console.error("Failed to save access key to localStorage:", err);
  }
}

export function removeStoredAccessKey(): void {
  try {
    localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
  } catch (err) {
    console.error("Failed to remove access key from localStorage:", err);
  }
}

export function isStoredSampleMode(): boolean {
  try {
    return localStorage.getItem(SAMPLE_MODE_STORAGE_KEY) === "true";
  } catch (err) {
    console.error("Failed to read sample mode from localStorage:", err);
    return false;
  }
}

export function setStoredSampleMode(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(SAMPLE_MODE_STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(SAMPLE_MODE_STORAGE_KEY);
    }
  } catch (err) {
    console.error("Failed to set sample mode in localStorage:", err);
  }
}

export function clearStoredSampleMode(): void {
  try {
    localStorage.removeItem(SAMPLE_MODE_STORAGE_KEY);
  } catch (err) {
    console.error("Failed to remove sample mode from localStorage:", err);
  }
}

