/**
 * Safely parse JSON from a fetch Response without throwing SyntaxError on empty or non-JSON payloads.
 */
export async function parseJsonSafe<T = any>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
