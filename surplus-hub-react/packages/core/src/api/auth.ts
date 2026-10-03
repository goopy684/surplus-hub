import { apiClient, unwrapApiData } from "./client";

// Native email/password auth against the backend (replaces Clerk).
// Endpoints:
//   POST /api/v1/auth/register          JSON  { email, password, name }
//   POST /api/v1/auth/login/access-token  form  { username, password }
//   POST /api/v1/auth/refresh-token     JSON  { refreshToken }
// All return { status, data: { ...accessToken, refreshToken, tokenType } }.

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export interface AuthResult extends AuthTokens {
  id: string;
  email: string;
  name: string;
}

const readString = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

const mapTokens = (raw: Record<string, unknown>): AuthTokens => ({
  accessToken: readString(raw.accessToken ?? raw.access_token),
  refreshToken: readString(raw.refreshToken ?? raw.refresh_token),
  tokenType: readString(raw.tokenType ?? raw.token_type) || "bearer",
});

const mapAuthResult = (raw: Record<string, unknown>): AuthResult => ({
  ...mapTokens(raw),
  id: readString(raw.id),
  email: readString(raw.email),
  name: readString(raw.name),
});

export interface RegisterParams {
  email: string;
  password: string;
  name: string;
}

export const registerUser = async (params: RegisterParams): Promise<AuthResult> => {
  const response = await apiClient.post("/api/v1/auth/register", params);
  return mapAuthResult(unwrapApiData<Record<string, unknown>>(response.data));
};

export interface LoginParams {
  email: string;
  password: string;
}

export const loginUser = async (params: LoginParams): Promise<AuthResult> => {
  // The backend login route uses OAuth2PasswordRequestForm, which requires
  // form-encoded `username`/`password` (not JSON).
  const body = new URLSearchParams();
  body.append("username", params.email);
  body.append("password", params.password);
  const response = await apiClient.post("/api/v1/auth/login/access-token", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return mapAuthResult(unwrapApiData<Record<string, unknown>>(response.data));
};

export const refreshTokens = async (refreshToken: string): Promise<AuthTokens> => {
  const response = await apiClient.post("/api/v1/auth/refresh-token", { refreshToken });
  return mapTokens(unwrapApiData<Record<string, unknown>>(response.data));
};

export const googleSignIn = async (idToken: string): Promise<AuthResult> => {
  const response = await apiClient.post("/api/v1/auth/google", { idToken });
  return mapAuthResult(unwrapApiData<Record<string, unknown>>(response.data));
};

export interface ForgotPasswordResult {
  message: string;
  // Only present in local/dev (no email provider) — the reset link, for testing.
  devResetUrl?: string;
}

export const requestPasswordReset = async (email: string): Promise<ForgotPasswordResult> => {
  const response = await apiClient.post("/api/v1/auth/forgot-password", { email });
  const data = unwrapApiData<Record<string, unknown>>(response.data);
  return {
    message: typeof data.message === "string" ? data.message : "",
    devResetUrl: typeof data.devResetUrl === "string" ? data.devResetUrl : undefined,
  };
};

export const resetPassword = async (
  token: string,
  newPassword: string
): Promise<{ message: string }> => {
  const response = await apiClient.post("/api/v1/auth/reset-password", {
    token,
    newPassword,
  });
  const data = unwrapApiData<Record<string, unknown>>(response.data);
  return { message: typeof data.message === "string" ? data.message : "" };
};
