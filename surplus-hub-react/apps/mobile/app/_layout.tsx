import "../global.css";
import * as Sentry from "@sentry/react-native";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, SafeAreaView } from "react-native";
import { useEffect, useState } from "react";
import { configureApiClient } from "@repo/core";
import { tokenCache } from "../utils/tokenCache";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { usePushNotifications } from "../hooks/usePushNotifications";

// Crash/error monitoring. No-op until EXPO_PUBLIC_SENTRY_DSN is set (build env),
// so the app runs unchanged without a DSN.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_ENV || (__DEV__ ? "development" : "production"),
  tracesSampleRate: __DEV__ ? 1.0 : 0.1,
});

// 앱이 켜져 있을 때 도착한 푸시도 배너/사운드로 노출한다.
// shouldSetBadge는 서버가 payload에 담아 보내는 badge(미읽음 수)를 그대로 적용하게 한다 —
// usePushNotifications가 포그라운드 복귀·목록 갱신마다 같은 값으로 다시 맞춘다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

const parseBooleanEnv = (key: string): boolean => {
  const value = process.env[key]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
};

const DEV_AUTH_BYPASS = parseBooleanEnv("EXPO_PUBLIC_DEV_AUTH_BYPASS");

configureApiClient({
  baseUrl: API_BASE_URL,
  tokenProvider: async () => {
    return tokenCache.getToken("access_token");
  },
});

function AppStack() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(legal)" options={{ headerShown: false }} />
      <Stack.Screen name="material/register" options={{ title: "자재 등록" }} />
      <Stack.Screen name="material/[id]" options={{ title: "자재 상세" }} />
      <Stack.Screen name="search" options={{ title: "검색" }} />
      <Stack.Screen name="notifications" options={{ title: "알림" }} />
      <Stack.Screen name="notification-settings" options={{ title: "알림 설정" }} />
    </Stack>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // QueryClientProvider·AuthProvider 아래여야 동작한다. 푸시 불가 환경에서는 no-op.
  usePushNotifications();

  useEffect(() => {
    if (isLoading || DEV_AUTH_BYPASS) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments, router]);

  if (isLoading && !DEV_AUTH_BYPASS) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#ed701d" />
      </SafeAreaView>
    );
  }

  return <AppStack />;
}

function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafeAreaView style={{ flex: 1 }}>
          <AuthGate />
        </SafeAreaView>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Sentry.wrap enables the root error boundary + touch/navigation context.
export default Sentry.wrap(RootLayout);
