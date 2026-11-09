/**
 * Shared low-level helpers for parsing raw API responses.
 * These are internal to the api/ layer and NOT re-exported from the package.
 */

export const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

export const readNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

/**
 * AI가 만든 설명에 남은 마크다운 기호(`**규격:**`, `## 제목`)를 평문으로 정리한다.
 * 백엔드도 저장 전에 지우지만, 이전에 저장된 설명을 위해 표시 단계에서 한 번 더 거른다.
 * `600*600` 같은 규격의 단독 `*`는 남긴다. (백엔드 app/ai/text.py strip_markdown과 같은 규칙)
 */
export const stripMarkdown = (text: string): string =>
  text
    .replace(/\*\*|__|`/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^([ \t]*)[*+][ \t]+/gm, "$1- ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

export const normalizeIso = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
};

/**
 * Like readNumber but strips non-numeric characters (e.g. currency symbols)
 * before parsing.
 */
export const parseNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  return fallback;
};

export const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = parseNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
};
