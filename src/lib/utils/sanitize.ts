/**
 * SANITIZATION LAYER
 *
 * Root cause: U+FEFF (BOM, charCode 65279) prepended to Vercel env vars
 * at the time they were copy-pasted into the dashboard.
 *
 * When used in `Authorization: Bearer ${key}`, "Bearer " occupies indices
 * 0-6 (7 chars), placing the BOM at index 7 — exactly the error reported.
 *
 * Fix: strip BOM and all non-Latin1-safe chars from every string that
 * touches an HTTP header or external API payload.
 */

/**
 * Sanitize any text field (insight titles, note content, task descriptions).
 * Strips BOM, zero-width chars, and all non-printable-ASCII / non-Latin1 chars.
 * Safe to apply to any LLM output before sending to Notion / Todoist.
 */
export function sanitizeText(text: string): string {
  if (!text) return "";

  return text
    .replace(/﻿/g, "")       // U+FEFF BOM — root cause of the ByteString crash
    .replace(/​/g, "")       // zero-width space
    .replace(/‌/g, "")       // zero-width non-joiner
    .replace(/‍/g, "")       // zero-width joiner
    .replace(/[^\x20-\x7E\n\r\t]/g, "")  // strip everything outside printable ASCII
    .trim();
}

/**
 * Sanitize an API key or auth token before placing it in an HTTP header.
 * More aggressive than sanitizeText — strips any whitespace and control chars
 * that could silently corrupt `Authorization: Bearer ${key}`.
 */
export function sanitizeApiKey(key: string | undefined): string {
  if (!key) return "";
  return key
    .replace(/﻿/g, "")
    .replace(/​/g, "")
    .replace(/‌/g, "")
    .replace(/‍/g, "")
    .replace(/[^\x21-\x7E]/g, "")  // strip ALL whitespace + non-printable + BOM
    .trim();
}

/**
 * Returns first N character codes of a string — for diagnostic logging
 * without leaking the actual secret value.
 */
export function debugCharCodes(str: string, n = 10): string {
  return [...str.slice(0, n)].map(c => c.charCodeAt(0)).join(", ");
}

/**
 * Scan a string and return any suspicious char codes (> 127 or known BOM values).
 */
export function findSuspiciousChars(str: string): Array<{ index: number; char: string; code: number }> {
  const hits: Array<{ index: number; char: string; code: number }> = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 127 || code === 0 || (code >= 0x0001 && code <= 0x001F && code !== 9 && code !== 10 && code !== 13)) {
      hits.push({ index: i, char: str[i], code });
    }
  }
  return hits;
}
