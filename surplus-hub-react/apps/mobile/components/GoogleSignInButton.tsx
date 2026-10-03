import { useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { useAuth } from "../contexts/AuthContext";

WebBrowser.maybeCompleteAuthSession();

// OAuth client IDs from Google Cloud Console. Empty/unset → button is hidden
// (the email/password form still works). See eas.json for wiring.
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;

const FAILURE_MESSAGE = "Google 로그인에 실패했습니다. 다시 시도해주세요.";

export function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const router = useRouter();
  const { loginWithGoogle } = useAuth();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId,
    iosClientId,
    webClientId,
  });

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.params?.id_token ?? response.authentication?.idToken;
    if (!idToken) {
      onError?.(FAILURE_MESSAGE);
      return;
    }
    void (async () => {
      try {
        await loginWithGoogle(idToken);
        router.replace("/(tabs)");
      } catch {
        onError?.(FAILURE_MESSAGE);
      }
    })();
  }, [response, loginWithGoogle, router, onError]);

  // Gate like web: hide entirely when no client id is configured.
  if (!webClientId && !androidClientId) return null;

  return (
    <View className="mt-6">
      <View className="mb-4 flex-row items-center">
        <View className="h-px flex-1 bg-border" />
        <Text className="px-3 text-xs text-muted-foreground">또는</Text>
        <View className="h-px flex-1 bg-border" />
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        disabled={!request}
        onPress={() => {
          void promptAsync();
        }}
        className={`h-12 flex-row items-center justify-center rounded-btn border border-border bg-card ${
          !request ? "opacity-60" : ""
        }`}
      >
        <Text className="text-base font-medium text-foreground">Google로 계속하기</Text>
      </TouchableOpacity>
    </View>
  );
}
