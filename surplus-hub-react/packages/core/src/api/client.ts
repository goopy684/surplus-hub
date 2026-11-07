import axios from "axios";

type MaybePromise<T> = T | Promise<T>;
type TokenProvider = () => MaybePromise<string | null | undefined>;

export interface ApiResponseMeta {
  totalCount?: number;
  page?: number;
  limit?: number;
  hasNextPage?: boolean;
  totalPages?: number;
  [key: string]: unknown;
}

interface ApiClientConfig {
  baseUrl?: string;
  tokenProvider?: TokenProvider | null;
  staticToken?: string | null;
}

const DEFAULT_API_BASE_URL =
  typeof process !== "undefined" && process.env?.NODE_ENV === "production"
    ? ""
    : "http://localhost:8000";

let configuredBaseUrl: string | null = null;
let configuredTokenProvider: TokenProvider | null = null;
let configuredStaticToken: string | null = null;

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

const readEnv = (key: string): string | undefined => {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.[key];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const hasAuthToken = (): boolean => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return false;
  try {
    return !!(localStorage.getItem("access_token") || localStorage.getItem("clerk_token"));
  } catch {
    return false;
  }
};

const getBrowserToken = (): string | null => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem("access_token") || localStorage.getItem("clerk_token");
  } catch {
    return null;
  }
};

let warnedEmptyBaseUrl = false;

const resolveBaseUrl = (): string => {
  const baseUrl = normalizeBaseUrl(
    configuredBaseUrl ||
      readEnv("NEXT_PUBLIC_API_URL") ||
      readEnv("EXPO_PUBLIC_API_URL") ||
      readEnv("API_URL") ||
      DEFAULT_API_BASE_URL
  );

  // baseUrl이 비면 모든 요청이 현재 오리진 상대경로로 나가 조용히 404가 된다.
  // 기존 동작은 유지하고(throw 금지) 서버·클라이언트 양쪽에서 한 번만 경고한다.
  if (!baseUrl && !warnedEmptyBaseUrl) {
    warnedEmptyBaseUrl = true;
    console.warn(
      "[@repo/core] API baseUrl이 비어 있습니다. NEXT_PUBLIC_API_URL(웹) 또는 EXPO_PUBLIC_API_URL(모바일)을 설정하세요. " +
        "설정 전까지 모든 API 요청이 상대경로로 나갑니다."
    );
  }

  return baseUrl;
};

const resolveAccessToken = async (): Promise<string | null> => {
  if (configuredTokenProvider) {
    const token = await configuredTokenProvider();
    if (token) return token;
  }

  if (configuredStaticToken) {
    return configuredStaticToken;
  }

  return (
    getBrowserToken() ||
    readEnv("NEXT_PUBLIC_API_TOKEN") ||
    readEnv("EXPO_PUBLIC_API_TOKEN") ||
    readEnv("API_TOKEN") ||
    null
  );
};

export const apiClient = axios.create({
  baseURL: resolveBaseUrl(),
  timeout: 15000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await resolveAccessToken();
  if (token && !config.headers?.["Authorization"]) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

const getBrowserRefreshToken = (): string | null => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem("refresh_token");
  } catch {
    return null;
  }
};

const persistBrowserTokens = (accessToken: string, refreshToken?: string): void => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem("access_token", accessToken);
    if (refreshToken) {
      localStorage.setItem("refresh_token", refreshToken);
    }
  } catch {
    /* storage unavailable */
  }
};

const clearBrowserTokens = (): void => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("clerk_token");
  } catch {
    /* storage unavailable */
  }
};

const refreshAccessTokenSingleFlight = async (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise;

  const refreshToken = getBrowserRefreshToken();
  if (!refreshToken) return null;

  refreshPromise = (async () => {
    try {
      const baseUrl = apiClient.defaults.baseURL || resolveBaseUrl();
      const response = await axios.post(
        `${baseUrl}/api/v1/auth/refresh`,
        { refreshToken },
        { timeout: 10000 }
      );
      const payload = unwrapApiData<Record<string, unknown>>(response.data);
      const nextAccess =
        typeof payload?.accessToken === "string"
          ? payload.accessToken
          : typeof payload?.access_token === "string"
            ? payload.access_token
            : null;
      const nextRefresh =
        typeof payload?.refreshToken === "string"
          ? payload.refreshToken
          : typeof payload?.refresh_token === "string"
            ? payload.refresh_token
            : undefined;

      if (!nextAccess) {
        clearBrowserTokens();
        return null;
      }

      persistBrowserTokens(nextAccess, nextRefresh);
      return nextAccess;
    } catch {
      clearBrowserTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as
      | (typeof error.config & { _retry?: boolean })
      | undefined;
    const status = error?.response?.status;
    const url = String(originalRequest?.url ?? "");

    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/google");

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const nextToken = await refreshAccessTokenSingleFlight();
      if (nextToken) {
        if (originalRequest.headers?.set) {
          originalRequest.headers.set("Authorization", `Bearer ${nextToken}`);
        } else {
          originalRequest.headers = {
            ...(originalRequest.headers ?? {}),
            Authorization: `Bearer ${nextToken}`,
          };
        }
        return apiClient(originalRequest);
      }
    }

    return Promise.reject(error);
  }
);

export const configureApiClient = (config: ApiClientConfig = {}): void => {
  if (config.baseUrl !== undefined) {
    configuredBaseUrl = config.baseUrl ? normalizeBaseUrl(config.baseUrl) : null;
  }
  if (config.tokenProvider !== undefined) {
    configuredTokenProvider = config.tokenProvider;
  }
  if (config.staticToken !== undefined) {
    configuredStaticToken = config.staticToken;
  }
  apiClient.defaults.baseURL = resolveBaseUrl();
};

export const getApiBaseUrl = (): string => apiClient.defaults.baseURL || resolveBaseUrl();

export const isNotFoundError = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 404;

export const unwrapApiData = <T>(payload: unknown): T => {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    ("status" in payload || "meta" in payload)
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export const unwrapApiMeta = (payload: unknown): ApiResponseMeta | undefined => {
  if (payload && typeof payload === "object" && "meta" in payload) {
    return (payload as { meta?: ApiResponseMeta }).meta;
  }
  return undefined;
};
