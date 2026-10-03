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
  fetchCurrentUser,
  loginUser,
  registerUser,
  googleSignIn,
  type CurrentUser,
} from "@repo/core";
import { tokenCache } from "../utils/tokenCache";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const CLERK_TOKEN_KEY = "clerk_token";

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: if we have a stored access token, hydrate the current user.
  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const accessToken = await tokenCache.getToken(ACCESS_TOKEN_KEY);
        if (!accessToken) {
          return;
        }

        try {
          const currentUser = await fetchCurrentUser();
          if (isMounted) {
            setUser(currentUser);
          }
        } catch {
          // Token is invalid/expired (e.g. 401). Clear it and stay signed out.
          await tokenCache.removeToken(ACCESS_TOKEN_KEY);
          await tokenCache.removeToken(REFRESH_TOKEN_KEY);
          if (isMounted) {
            setUser(null);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginUser({ email, password });
    await tokenCache.saveToken(ACCESS_TOKEN_KEY, result.accessToken);
    await tokenCache.saveToken(REFRESH_TOKEN_KEY, result.refreshToken);
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const result = await registerUser({ email, password, name });
      await tokenCache.saveToken(ACCESS_TOKEN_KEY, result.accessToken);
      await tokenCache.saveToken(REFRESH_TOKEN_KEY, result.refreshToken);
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    },
    [],
  );

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const result = await googleSignIn(idToken);
    await tokenCache.saveToken(ACCESS_TOKEN_KEY, result.accessToken);
    await tokenCache.saveToken(REFRESH_TOKEN_KEY, result.refreshToken);
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);
  }, []);

  const logout = useCallback(async () => {
    await tokenCache.removeToken(ACCESS_TOKEN_KEY);
    await tokenCache.removeToken(REFRESH_TOKEN_KEY);
    await tokenCache.removeToken(CLERK_TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      loginWithGoogle,
      logout,
    }),
    [user, isLoading, login, register, loginWithGoogle, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
