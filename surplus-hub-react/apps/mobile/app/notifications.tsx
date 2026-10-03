import { ActivityIndicator, FlatList, SafeAreaView, Text, TouchableOpacity, View } from "react-native";
import {
  Notification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@repo/core";
import { useRouter } from "expo-router";
import { notificationRoute } from "../hooks/usePushNotifications";

const formatRelativeTime = (dateStr: string): string => {
  const minutes = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString();
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { data, isLoading, error } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = data?.data ?? [];
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  const handlePress = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        // 훅이 성공 시 목록·미읽음 카운트를 자동 무효화한다.
        await markRead.mutateAsync(notification.id);
      } catch {
        // 읽음 처리 실패는 이동을 막지 않는다.
      }
    }
    // 라우트 매핑은 푸시 탭 핸들러와 공유한다 — 두 곳에서 분기하면 갈라진다.
    // null은 이 화면에서 갈 곳이 없다는 뜻이라 그대로 머문다 (커뮤니티 게시글 상세 화면은 없음).
    const route = notificationRoute(notification);
    if (route) router.push(route);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllRead.mutateAsync();
    } catch {
      // 무시 — 다음 새로고침에서 서버 상태가 반영된다.
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-row items-center justify-between border-b border-line bg-surface px-5 pt-4 pb-4">
        <Text className="text-[19px] font-bold tracking-[-0.4px] text-ink">알림</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="알림 전체 읽음 처리"
            onPress={() => void handleMarkAllAsRead()}
            className="min-h-[44px] justify-center rounded-btn border border-line px-4"
          >
            <Text className="text-[13px] font-semibold text-ink">전체 읽음</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <View className="mt-8 items-center">
          <ActivityIndicator size="large" color="#ed701d" />
        </View>
      ) : null}

      {error ? <Text className="px-5 pt-6 text-base text-ink-2">알림을 불러오지 못했습니다.</Text> : null}

      {!isLoading && !error ? (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={item.title || "알림"}
              onPress={() => void handlePress(item)}
              className={`min-h-[44px] border-b border-line-2 px-5 py-4 ${item.isRead ? "bg-surface" : "bg-accent"}`}
            >
              <View className="flex-row items-center gap-2">
                {item.isRead ? null : <View className="h-2 w-2 rounded-full bg-primary" />}
                <Text className="flex-1 text-[15px] font-semibold text-ink" numberOfLines={1}>
                  {item.title || "알림"}
                </Text>
                <Text className="text-[12.5px] text-ink-2">{formatRelativeTime(item.createdAt)}</Text>
              </View>
              {item.message ? (
                <Text className="mt-1 text-[13.5px] text-ink-2" numberOfLines={2}>
                  {item.message}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="items-center px-5 pt-12">
              <Text className="text-base text-ink-2">새로운 알림이 없습니다.</Text>
            </View>
          }
        />
      ) : null}
    </SafeAreaView>
  );
}
