import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useCommunityPosts } from "@repo/core";

const CATEGORIES = ["전체", "QnA", "노하우", "안전", "정보"] as const;

const formatTimeAgo = (value: string): string => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "방금";

  const diffMinutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}일 전`;

  return new Date(value).toLocaleDateString();
};

export default function CommunityScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORIES)[number]>("전체");

  const params = useMemo(
    () => ({
      page: 1,
      limit: 20,
      category: selectedCategory === "전체" ? undefined : selectedCategory,
    }),
    [selectedCategory]
  );

  const { data, isLoading, error } = useCommunityPosts(params);
  const posts = data?.data ?? [];

  return (
    <View className="flex-1 bg-canvas">
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <View>
          <Text className="text-[22px] font-extrabold tracking-[-0.6px] text-foreground">커뮤니티</Text>
          <Text className="mt-1 text-sm text-muted-foreground">질문하고, 노하우를 공유해보세요.</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="새 게시글 작성"
          onPress={() => router.push("/community/write")}
          className="rounded-full bg-primary px-4 py-2"
        >
          <Text className="text-xs font-bold text-primary-foreground">+ 글쓰기</Text>
        </TouchableOpacity>
      </View>

      <View className="px-4 pb-3">
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => {
            const selected = selectedCategory === item;
            return (
              <TouchableOpacity
                onPress={() => setSelectedCategory(item)}
                className={`mr-2 rounded-full px-4 py-2 ${
                  selected ? "bg-ink border border-ink" : "bg-surface border-line"
                }`}
              >
                <Text className={`text-sm ${selected ? "font-bold text-surface" : "font-medium text-ink"}`}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {isLoading ? (
        <View className="mt-8 items-center">
          <ActivityIndicator size="large" color="#1E3FCC" />
        </View>
      ) : null}

      {error ? <Text className="px-4 pt-6 text-sm text-destructive">게시글을 불러오지 못했습니다.</Text> : null}

      {!isLoading && !error ? (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/community/${item.id}`)}
              className="mb-3 rounded-card bg-surface p-4"
            >
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-[12.5px] font-bold text-primary">
                  {item.category}
                </Text>
                <Text className="text-xs text-muted-foreground">{formatTimeAgo(item.createdAt)}</Text>
              </View>
              <Text className="mb-1 text-base font-bold text-foreground">{item.title}</Text>
              <Text className="mb-3 text-sm leading-5 text-muted-foreground" numberOfLines={3}>
                {item.content}
              </Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-medium text-muted-foreground">{item.authorName}</Text>
                <View className="flex-row items-center gap-3">
                  <Text className="text-xs text-muted-foreground">좋아요 {item.likesCount}</Text>
                  <Text className="text-xs text-muted-foreground">조회 {item.views}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="rounded-card bg-surface p-6">
              <Text className="text-center text-sm text-muted-foreground">조건에 맞는 게시글이 없습니다.</Text>
            </View>
          }
        />
      ) : null}
    </View>
  );
}
