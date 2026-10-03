import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { useCommunityPosts } from "@repo/core";

const CATEGORIES = ["전체", "질문/답변", "노하우", "안전", "정보"] as const;

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
    <View className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-foreground">커뮤니티</Text>
        <Text className="mt-1 text-sm text-muted-foreground">질문하고, 노하우를 공유해보세요.</Text>
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
                  selected ? "bg-primary" : "bg-card border border-border"
                }`}
              >
                <Text className={`text-xs font-bold ${selected ? "text-primary-foreground" : "text-muted-foreground"}`}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {isLoading ? (
        <View className="mt-8 items-center">
          <ActivityIndicator size="large" color="#ed701d" />
        </View>
      ) : null}

      {error ? <Text className="px-4 pt-6 text-sm text-destructive">게시글을 불러오지 못했습니다.</Text> : null}

      {!isLoading && !error ? (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          renderItem={({ item }) => (
            <View className="mb-3 rounded-thumb border border-border bg-card p-4">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="rounded-chip border border-border bg-card px-2 py-1 text-xs font-bold text-muted-foreground">
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
            </View>
          )}
          ListEmptyComponent={
            <View className="rounded-thumb border border-dashed border-border bg-card p-6">
              <Text className="text-center text-sm text-muted-foreground">조건에 맞는 게시글이 없습니다.</Text>
            </View>
          }
        />
      ) : null}
    </View>
  );
}
