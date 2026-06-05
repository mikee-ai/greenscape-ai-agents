/** ID + token helpers (Workers-native crypto; no external deps). */

export const newId = (): string => crypto.randomUUID();

/** 32-char unguessable hex token for public proposal URLs (/p/:token). */
export function publicToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Unix epoch milliseconds. */
export const now = (): number => Date.now();
