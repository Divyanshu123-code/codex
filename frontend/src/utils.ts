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

/**
 * Safely format dates without throwing RangeError on invalid time values.
 */
export function formatSafeDate(dateVal: any): string {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toISOString();
  } catch {
    return String(dateVal);
  }
}

export function formatSafeTime(dateVal: any): string {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleTimeString();
  } catch {
    return String(dateVal);
  }
}

export function formatSafeDateTime(dateVal: any): string {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleString();
  } catch {
    return String(dateVal);
  }
}
