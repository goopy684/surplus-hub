"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loginUser,
  registerUser,
  googleSignIn,
  fetchCurrentUser,
  type CurrentUser,
} from "@repo/core";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const LEGACY_CLERK_KEY = "clerk_token";

const setTokens = (accessToken: string, refreshToken?: string): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    /* storage unavailable */
  }
};

const clearTokens = (): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(LEGACY_CLERK_KEY);
  } catch {
    /* storage unavailable */
  }
};

const readAccessToken = (): string | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
};

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isSignedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const me = await fetchCurrentUser();
      setUser(me);
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  // Restore session on mount from a stored access token.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!readAccessToken()) {
        if (active) setIsLoading(false);
        return;
      }
      await loadUser();
      if (active) setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginUser({ email, password });
      setTokens(result.accessToken, result.refreshToken);
      await loadUser();
    },
    [loadUser]
  );

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const result = await registerUser({ email, password, name });
      setTokens(result.accessToken, result.refreshToken);
      await loadUser();
    },
    [loadUser]
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      const result = await googleSignIn(idToken);
      setTokens(result.accessToken, result.refreshToken);
      await loadUser();
    },
    [loadUser]
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isSignedIn: !!user,
      login,
      signup,
      loginWithGoogle,
      logout,
      refresh: loadUser,
    }),
    [user, isLoading, login, signup, loginWithGoogle, logout, loadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
