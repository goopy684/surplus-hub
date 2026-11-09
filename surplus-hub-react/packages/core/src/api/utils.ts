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
