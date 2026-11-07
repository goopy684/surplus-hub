import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  CommunityComment,
  CommunityPost,
  createComment,
  fetchComments,
  fetchCommunityPost,
  togglePostLike,
} from "@repo/core";

export default function CommunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [postData, commentsData] = await Promise.all([
        fetchCommunityPost(id),
        fetchComments(id),
      ]);
      setPost(postData);
      setComments(commentsData);
    } catch {
      setError("게시글을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleLike = async () => {
    if (!post || !id) return;
    try {
      const res = await togglePostLike(id);
      setLiked(res.liked);
      setPost((prev) => (prev ? { ...prev, likesCount: res.likesCount } : prev));
    } catch {
      // 비로그인 또는 네트워크 오류 무시
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim() || !id || submitting) return;
    setSubmitting(true);
    try {
      const created = await createComment(id, newComment.trim());
      setComments((prev) => [...prev, created]);
      setNewComment("");
    } catch {
      // 댓글 작성 오류 무시
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#1E3FCC" />
      </SafeAreaView>
    );
  }

  if (error || !post) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas px-4">
        <Text className="text-sm text-destructive">{error ?? "게시글을 찾을 수 없습니다."}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View className="mb-3 bg-surface p-5">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-xs font-bold text-primary">{post.category}</Text>
              <Text className="text-xs text-muted-foreground">조회 {post.views}</Text>
            </View>
            <Text className="mb-2 text-lg font-extrabold text-foreground">{post.title}</Text>
            <Text className="mb-4 text-xs text-muted-foreground">{post.authorName}</Text>
            <Text className="mb-5 text-sm leading-6 text-foreground">{post.content}</Text>
            <View className="flex-row items-center justify-between border-t border-line-2 pt-3">
              <TouchableOpacity
                onPress={handleToggleLike}
                className={`rounded-full border px-4 py-2 ${
                  liked ? "border-primary bg-accent" : "border-line bg-surface"
                }`}
              >
                <Text className={`text-xs font-bold ${liked ? "text-primary" : "text-foreground"}`}>
                  좋아요 {post.likesCount}
                </Text>
              </TouchableOpacity>
              <Text className="text-xs text-muted-foreground">댓글 {comments.length}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View className="mx-4 mb-2 rounded-card bg-surface p-4">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-xs font-bold text-foreground">{item.authorName}</Text>
            </View>
            <Text className="text-sm text-foreground">{item.content}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View className="mx-4 rounded-card bg-surface p-6">
            <Text className="text-center text-xs text-muted-foreground">아직 댓글이 없습니다.</Text>
          </View>
        }
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        className="flex-row items-center border-t border-line-2 bg-surface px-4 py-3"
      >
        <TextInput
          value={newComment}
          onChangeText={setNewComment}
          placeholder="댓글을 입력하세요..."
          className="mr-2 h-11 flex-1 rounded-full bg-field px-4 text-sm text-foreground"
        />
        <TouchableOpacity
          onPress={handleSendComment}
          disabled={submitting}
          className="h-11 items-center justify-center rounded-full bg-primary px-4"
        >
          <Text className="text-xs font-bold text-primary-foreground">등록</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
