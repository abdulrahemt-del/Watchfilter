/**
 * Strip invisible/non-printable Unicode characters that cause ByteString
 * conversion errors in fetch() headers/body — specifically U+FEFF BOM,
 * zero-width spaces, and control characters. Applied to all LLM output
 * before it is forwarded to any external API.
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/﻿/g, "")           // BOM — the root cause of the ByteString error
    .replace(/​/g, "")           // zero-width space
    .replace(/‌/g, "")           // zero-width non-joiner
    .replace(/‍/g, "")           // zero-width joiner
    .replace(/ /g, " ")          // non-breaking space → regular space
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")  // C0 control chars
    .trim();
}

export function sanitizeInsight(ins: import("@/app/api/youtube/insights/route").Insight): import("@/app/api/youtube/insights/route").Insight {
  return {
    ...ins,
    title:          sanitizeText(ins.title),
    explanation:    sanitizeText(ins.explanation),
    why_it_matters: sanitizeText(ins.why_it_matters),
    assets: {
      note: {
        title:   sanitizeText(ins.assets.note.title),
        content: sanitizeText(ins.assets.note.content),
      },
      task: {
        title:       sanitizeText(ins.assets.task.title),
        description: sanitizeText(ins.assets.task.description),
      },
      content: {
        title: sanitizeText(ins.assets.content.title),
        angle: sanitizeText(ins.assets.content.angle),
      },
    },
  };
}
