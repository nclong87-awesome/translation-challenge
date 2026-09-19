/**
 * Multi-stage JSON repair and sanitization utility for LLM generation outputs.
 * Gracefully repairs common model formatting anomalies (markdown fences, trailing commas,
 * unclosed brackets, and truncated JSON).
 */

export function parseOrRepairJson<T = any>(rawText: string): T {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Empty or non-string input provided for JSON parsing");
  }

  const trimmed = rawText.trim();

  // Stage 1: Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to repair stages
  }

  // Stage 2: Extract from Markdown code fence ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue with extracted content
    }
  }

  // Stage 3: Extract outer JSON object or array bounds
  let candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf("{");
  const firstBracket = candidate.indexOf("[");
  let startIdx = -1;
  let endChar = "";

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endChar = "}";
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endChar = "]";
  }

  if (startIdx !== -1) {
    const lastEnd = candidate.lastIndexOf(endChar);
    if (lastEnd > startIdx) {
      candidate = candidate.slice(startIdx, lastEnd + 1);
    } else {
      candidate = candidate.slice(startIdx);
    }
  }

  // Stage 4: Clean common formatting artifacts (trailing commas, comments)
  let cleaned = candidate
    .replace(/,\s*([}\]])/g, "$1") // Remove trailing commas
    .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "$1"); // Strip JS comments

  try {
    return JSON.parse(cleaned);
  } catch {
    // Stage 5: Fix unclosed braces/brackets for truncated streams
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "{") openBraces++;
        else if (char === "}") openBraces = Math.max(0, openBraces - 1);
        else if (char === "[") openBrackets++;
        else if (char === "]") openBrackets = Math.max(0, openBrackets - 1);
      }
    }

    if (inString) {
      cleaned += '"';
    }
    // Clean any trailing comma before appending closures
    cleaned = cleaned.replace(/,\s*$/, "");
    while (openBrackets > 0) {
      cleaned += "]";
      openBrackets--;
    }
    while (openBraces > 0) {
      cleaned += "}";
      openBraces--;
    }

    try {
      return JSON.parse(cleaned);
    } catch (finalErr: any) {
      const err = new Error(`Corrupted JSON payload could not be parsed: ${finalErr.message}`);
      (err as any).statusCode = 422;
      (err as any).rawText = rawText;
      throw err;
    }
  }
}
