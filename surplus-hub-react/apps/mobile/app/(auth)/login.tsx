import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";

const getErrorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      response?: { status?: number; data?: { detail?: string } };
      message?: string;
    };

    if (maybeError.response?.status === 401) {
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    }
    if (maybeError.response?.data?.detail) {
      return maybeError.response.data.detail;
    }
    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return "로그인 중 오류가 발생했습니다.";
};

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFormValid = email.trim().length > 0 && password.length > 0;

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-3xl font-bold text-foreground">로그인</Text>
          <Text className="mt-2 text-sm text-muted-foreground">
            계정에 로그인하고 잉여 자재를 거래해보세요.
          </Text>

          <View className="mt-8">
            <Text className="mb-1 text-sm font-medium text-muted-foreground">이메일</Text>
            <TextInput
              className="h-12 rounded-field border border-border bg-field p-3 text-base text-foreground"
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View className="mt-4">
            <Text className="mb-1 text-sm font-medium text-muted-foreground">비밀번호</Text>
            <TextInput
              className="h-12 rounded-field border border-border bg-field p-3 text-base text-foreground"
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호를 입력하세요"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {error ? (
            <Text className="mt-4 text-sm font-medium text-destructive">{error}</Text>
          ) : null}

          <TouchableOpacity
            onPress={() => {
              void handleSubmit();
            }}
            disabled={!isFormValid || isSubmitting}
            className={`mt-6 items-center rounded-btn py-3.5 ${
              !isFormValid || isSubmitting ? "bg-primary/60" : "bg-primary"
            }`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-base font-bold text-primary-foreground">로그인</Text>
            )}
          </TouchableOpacity>

          <GoogleSignInButton onError={setError} />

          <TouchableOpacity
            className="mt-4 items-center"
            onPress={() => router.push("/(auth)/forgot-password")}
          >
            <Text className="text-sm text-muted-foreground">비밀번호를 잊으셨나요?</Text>
          </TouchableOpacity>

          <View className="mt-6 flex-row items-center justify-center">
            <Text className="text-sm text-muted-foreground">계정이 없으신가요? </Text>
            <Link href="/(auth)/register" replace asChild>
              <TouchableOpacity>
                <Text className="text-sm font-bold text-primary">회원가입</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
