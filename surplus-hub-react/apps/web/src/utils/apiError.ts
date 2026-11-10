/** API 오류 응답의 detail 문자열(FastAPI HTTPException). 없으면 undefined. */
export const apiErrorDetail = (error: unknown): string | undefined => {
  const detail = (error as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
  return typeof detail === "string" ? detail : undefined;
};
