import { useState } from "react";
import { View, Text, Image, ScrollView, ActivityIndicator, TouchableOpacity, SafeAreaView } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useCreateChatRoom, useMaterialDetail } from "@repo/core";

const TRADE_METHOD_LABELS: Record<string, string> = {
  DIRECT: "직거래",
  DELIVERY: "배송 협의",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "판매중",
  RESERVED: "예약중",
  SOLD: "거래완료",
};

const CONDITION_GRADE_LABELS: Record<string, string> = {
  상: "상 (양호)",
  중: "중 (보통)",
  하: "하 (사용감 있음)",
};

const formatTradeMethod = (tradeMethod?: string): string =>
  tradeMethod ? TRADE_METHOD_LABELS[tradeMethod] ?? tradeMethod : "정보 없음";

const formatStatus = (status?: string): string =>
  status ? STATUS_LABELS[status] ?? status : "정보 없음";

const formatQuantity = (quantity?: number, unit?: string): string =>
  quantity && quantity > 0 ? `${quantity}${unit ? ` ${unit}` : ""}` : "정보 없음";

export default function MaterialDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: item, isLoading } = useMaterialDetail(id);
  const { mutateAsync: createChatRoom, isPending: isCreatingRoom } = useCreateChatRoom();
  const router = useRouter();
  const [liked, setLiked] = useState(false);

  const handleStartChat = async () => {
    if (!item) {
      router.push("/chat");
      return;
    }

    const materialId = Number(item.id);
    const sellerId = Number(item.sellerId);

    if (!Number.isFinite(materialId) || !Number.isFinite(sellerId) || materialId <= 0 || sellerId <= 0) {
      router.push("/chat");
      return;
    }

    try {
      const room = await createChatRoom({ materialId, sellerId });
      if (room.id) {
        router.push(`/chat/${room.id}`);
        return;
      }
    } catch {
      // Fall back to chat list when room creation fails.
    }

    router.push("/chat");
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator size="large" color="#ed701d" />
      </View>
    );
  }

  if (!item) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <Text className="text-ink-2">자재를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const createdAt = new Date(item.createdAt).toLocaleDateString();
  const locationLabel = item.location || "위치 정보 없음";
  const sellerDisplayName = item.sellerName || `판매자 #${item.sellerId}`;
  const statusLabel = formatStatus(item.status);
  const tradeMethodLabel = formatTradeMethod(item.tradeMethod);
  const quantityLabel = formatQuantity(item.quantity, item.quantityUnit);
  const grade = item.conditionGrade;
  const gradeLabel = grade ? CONDITION_GRADE_LABELS[grade] : undefined;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <Stack.Screen options={{ title: "자재 상세" }} />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} className="h-80 w-full bg-field" resizeMode="cover" />
        ) : (
          <View className="h-80 w-full items-center justify-center bg-field">
            <Text className="text-sm text-ink-2">이미지 없음</Text>
          </View>
        )}

        <View className="p-5">
          {/* 제목 · 메타 · 설명 */}
          <Text className="text-[20px] font-bold tracking-[-0.4px] text-ink">{item.title}</Text>
          <Text className="mt-1 text-[12.5px] text-ink-2">
            {item.category || "기타"} · <Text className="tabular-nums">{createdAt}</Text>
          </Text>
          <Text className="mt-4 text-[15px] leading-6 text-ink">{item.description}</Text>

          {/* AI 분석 — accent-soft 배경 */}
          <View className="mt-6 rounded-thumb bg-accent p-4">
            <Text className="text-sm font-bold text-accent-foreground">AI 분석</Text>
            <Text className="mt-1 text-sm leading-5 text-accent-foreground">
              등록 카테고리는 {item.category || "기타"}이며 등록일은 {createdAt}입니다. 상세 조건은 채팅으로 확인해 주세요.
            </Text>
          </View>

          {/* 스펙 테이블 — field(muted) 배경 */}
          <View className="mt-6 rounded-thumb bg-muted p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm text-ink-2">상태</Text>
              <Text className="text-sm font-semibold text-ink">{statusLabel}</Text>
            </View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm text-ink-2">카테고리</Text>
              <Text className="text-sm font-semibold text-ink">{item.category || "기타"}</Text>
            </View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm text-ink-2">수량</Text>
              <Text className="text-sm font-semibold tabular-nums text-ink">{quantityLabel}</Text>
            </View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm text-ink-2">거래 방식</Text>
              <Text className="text-sm font-semibold text-ink">{tradeMethodLabel}</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-ink-2">위치</Text>
              <Text className="text-sm font-semibold text-ink">{locationLabel}</Text>
            </View>
          </View>

          {/* 판매자 */}
          <View className="mt-6 flex-row items-center border-t border-line pt-4">
            {item.sellerAvatarUrl ? (
              <Image source={{ uri: item.sellerAvatarUrl }} className="mr-3 h-12 w-12 rounded-full bg-field" />
            ) : (
              <View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-field">
                <Text className="text-xs font-bold text-ink-2">판매자</Text>
              </View>
            )}
            <View className="flex-1">
              <Text className="text-base font-bold text-ink">{sellerDisplayName}</Text>
              <Text className="text-xs text-ink-2">{locationLabel}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 하단 액션 바 */}
      <View className="border-t border-line bg-surface px-4 py-3">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => setLiked((previous) => !previous)}
            className="h-12 w-12 items-center justify-center rounded-thumb border border-line"
          >
            <Text className={`text-lg ${liked ? "text-primary" : "text-ink-2"}`}>{liked ? "♥" : "♡"}</Text>
          </TouchableOpacity>
          <View className="ml-3 flex-1">
            <View className="flex-row items-center gap-2">
              {item.price > 0 ? (
                <Text>
                  <Text className="text-[20px] font-bold tracking-[-0.5px] tabular-nums text-ink">
                    {item.price.toLocaleString()}
                  </Text>
                  <Text className="text-[13px] font-medium text-ink-2"> 원</Text>
                </Text>
              ) : (
                <Text className="text-base font-bold text-ink">무료나눔</Text>
              )}
              {gradeLabel ? (
                <View
                  className={`rounded-chip border px-2 py-0.5 ${
                    grade === "상" ? "border-olive-bd bg-olive-bg" : "border-line bg-surface"
                  }`}
                >
                  <Text className={`text-xs font-semibold ${grade === "상" ? "text-olive-tx" : "text-ink-2"}`}>
                    {gradeLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-0.5 text-xs font-medium text-ink-2">거래 조건은 판매자와 협의</Text>
          </View>
          <TouchableOpacity
            onPress={handleStartChat}
            disabled={isCreatingRoom}
            className="rounded-btn bg-primary px-5 py-3"
          >
            <Text className="text-sm font-bold text-primary-foreground">
              {isCreatingRoom ? "채팅 연결 중..." : "판매자와 채팅"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
