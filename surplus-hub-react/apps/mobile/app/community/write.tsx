import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useCreateCommunityPost } from "@repo/core";

const CATEGORY_OPTIONS = [
  { label: "질문/답변 (QnA)", value: "QnA" },
  { label: "노하우", value: "노하우" },
  { label: "안전", value: "안전" },
  { label: "정보", value: "정보" },
] as const;

export default function CommunityWriteScreen() {
  const router = useRouter();
  const { mutate: createPost, isPending } = useCreateCommunityPost();

  const [category, setCategory] = useState<string>(CATEGORY_OPTIONS[0].value);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleSubmit = () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent || isPending) {
      Alert.alert("입력 확인", "제목과 내용을 모두 입력해주세요.");
      return;
    }

    createPost(
      {
        title: trimmedTitle,
        content: trimmedContent,
        category,
      },
      {
        onSuccess: (created) => {
          if (created?.id) {
            router.replace(`/community/${created.id}`);
          } else {
            router.back();
          }
        },
        onError: () => {
          Alert.alert("오류", "게시글 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
        },
      }
    );
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="rounded-card bg-surface p-4">
          <Text className="mb-2 text-xs font-bold text-muted-foreground">카테고리</Text>
          <View className="mb-5 flex-row flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((option) => {
              const selected = category === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={`카테고리 ${option.label}`}
                  onPress={() => setCategory(option.value)}
                  className={`rounded-full border px-3.5 py-2 ${
                    selected ? "border-ink bg-ink" : "border-line bg-surface"
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      selected ? "font-bold text-surface" : "font-medium text-ink"
                    }`}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text className="mb-2 text-xs font-bold text-muted-foreground">제목</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="제목을 입력하세요"
            placeholderTextColor="#7D786F"
            className="mb-5 rounded-field border border-line bg-field px-3.5 py-3 text-sm text-foreground"
          />

          <Text className="mb-2 text-xs font-bold text-muted-foreground">내용</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="현장 노하우, 자재 질문, 안전 정보를 자유롭게 공유해보세요."
            placeholderTextColor="#7D786F"
            multiline
            textAlignVertical="top"
            className="min-h-[180px] rounded-field border border-line bg-field p-3.5 text-sm leading-5 text-foreground"
          />

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="게시글 등록"
            onPress={handleSubmit}
            disabled={!title.trim() || !content.trim() || isPending}
            className={`mt-6 min-h-[48px] items-center justify-center rounded-field py-3 ${
              title.trim() && content.trim() && !isPending ? "bg-primary" : "bg-muted"
            }`}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                className={`text-sm font-bold ${
                  title.trim() && content.trim() ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                등록하기
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
