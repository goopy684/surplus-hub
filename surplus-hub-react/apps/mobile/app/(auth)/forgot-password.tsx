import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link } from "expo-router";
import { requestPasswordReset } from "@repo/core";

const getErrorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      response?: { data?: { detail?: string } };
      message?: string;
    };

    if (maybeError.response?.data?.detail) {
      return maybeError.response.data.detail;
    }
    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return "요청 중 오류가 발생했습니다.";
};

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const isFormValid = email.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;

    setError(null);
    setSuccessMessage(null);
    setDevResetUrl(null);
    setIsSubmitting(true);
    try {
      const result = await requestPasswordReset(email.trim());
      setSuccessMessage(
        result.message ||
          "가입된 이메일이라면 비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해주세요.",
      );
      setDevResetUrl(result.devResetUrl ?? null);
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
          <Text className="text-3xl font-bold text-foreground">비밀번호 찾기</Text>
          <Text className="mt-2 text-sm text-muted-foreground">
            가입하신 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.
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
              editable={!isSubmitting}
            />
          </View>

          {error ? (
            <Text className="mt-4 text-sm font-medium text-destructive">{error}</Text>
          ) : null}

          {successMessage ? (
            <Text className="mt-4 text-sm font-medium text-foreground">{successMessage}</Text>
          ) : null}

          {devResetUrl ? (
            <View className="mt-3">
              <Text className="text-xs text-muted-foreground">[개발용] 이메일 발송 없이 테스트용 링크입니다.</Text>
              <TouchableOpacity
                onPress={() => {
                  void Linking.openURL(devResetUrl);
                }}
              >
                <Text className="mt-1 text-xs font-medium text-primary underline">
                  [개발용] 재설정 링크 열기
                </Text>
              </TouchableOpacity>
            </View>
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
              <Text className="text-base font-bold text-primary-foreground">재설정 링크 받기</Text>
            )}
          </TouchableOpacity>

          <View className="mt-6 flex-row items-center justify-center">
            <Text className="text-sm text-muted-foreground">비밀번호가 기억나셨나요? </Text>
            <Link href="/(auth)/login" replace asChild>
              <TouchableOpacity>
                <Text className="text-sm font-bold text-primary">로그인</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
