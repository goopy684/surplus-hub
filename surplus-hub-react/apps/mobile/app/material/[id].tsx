import { useState } from "react";
import { View, Text, Image, ScrollView, ActivityIndicator, TouchableOpacity, SafeAreaView, Alert } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  TRADE_METHOD_LABELS,
  calcSplitPrice,
  useCreateChatRoom,
  useCreateTransaction,
  useMaterialDetail,
} from "@repo/core";
import { useAuth } from "../../contexts/AuthContext";

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
  const { mutateAsync: createTransaction, isPending: isPurchasing } = useCreateTransaction();
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  // null = 아직 안 건드림 → 매물 전체 수량
  const [purchaseQuantity, setPurchaseQuantity] = useState<number | null>(null);

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

  const handlePurchase = async (quantity: number) => {
    if (!isAuthenticated) {
      Alert.alert("로그인 필요", "구매 요청은 로그인 후 이용할 수 있습니다.", [
        { text: "취소", style: "cancel" },
        { text: "로그인", onPress: () => router.push("/(auth)/login") },
      ]);
      return;
    }

    try {
      await createTransaction({ material_id: Number(id), quantity });
      Alert.alert("구매 요청 완료", "판매자가 확인하면 거래가 진행됩니다.");
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      Alert.alert("구매 요청 실패", typeof detail === "string" ? detail : "잠시 후 다시 시도해 주세요.");
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator size="large" color="#1E3FCC" />
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
  // 예약중·판매완료 등은 서버가 409로 거절하므로 판매중일 때만 구매 요청을 보여준다
  const canPurchase = user?.id !== item.sellerId && (!item.status || item.status.toUpperCase() === "ACTIVE");
  const maxQuantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const quantity = Math.min(purchaseQuantity ?? maxQuantity, maxQuantity);
  const splitPrice = calcSplitPrice(item.price, maxQuantity, quantity);

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
          <Text className="text-[22px] font-extrabold leading-[29px] tracking-[-0.6px] text-ink">{item.title}</Text>
          <Text className="mt-1 text-[12.5px] text-ink-2">
            {item.category || "기타"} · <Text className="tabular-nums">{createdAt}</Text>
          </Text>
          <Text className="mt-4 text-[15px] leading-[25px] text-ink">{item.description}</Text>

          {/* AI 분석 — accent-soft 배경 */}
          <View className="mt-6 rounded-card bg-field p-4">
            <Text className="text-sm font-bold text-primary">AI 분석</Text>
            <Text className="mt-1 text-[13.5px] leading-5 text-ink">
              등록 카테고리는 {item.category || "기타"}이며 등록일은 {createdAt}입니다. 상세 조건은 채팅으로 확인해 주세요.
            </Text>
          </View>

          {/* 스펙 테이블 — field(muted) 배경 */}
          <View className="mt-6 rounded-card border border-line-2 px-4 py-3">
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
          <View className="mt-6 flex-row items-center border-t border-line-2 pt-4">
            {item.sellerAvatarUrl ? (
              <Image source={{ uri: item.sellerAvatarUrl }} className="mr-3 h-12 w-12 rounded-full bg-field" />
            ) : (
              <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-accent">
                <Text className="text-xs font-bold text-primary">판매자</Text>
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
      <View className="border-t border-line-2 bg-surface px-5 py-3">
        {canPurchase ? (
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={() => setPurchaseQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="h-9 w-9 items-center justify-center rounded-chip border border-line bg-surface"
              >
                <Text className="text-base font-bold text-ink">−</Text>
              </TouchableOpacity>
              <Text className="mx-3 text-base font-bold tabular-nums text-ink">
                {quantity}
                {item.quantityUnit ? ` ${item.quantityUnit}` : ""}
              </Text>
              <TouchableOpacity
                onPress={() => setPurchaseQuantity(Math.min(maxQuantity, quantity + 1))}
                disabled={quantity >= maxQuantity}
                className="h-9 w-9 items-center justify-center rounded-chip border border-line bg-surface"
              >
                <Text className="text-base font-bold text-ink">+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => handlePurchase(quantity)}
              disabled={isPurchasing}
              className="h-11 justify-center rounded-btn border border-primary bg-accent px-4"
            >
              <Text className="text-sm font-bold tabular-nums text-primary">
                {isPurchasing ? "요청 중..." : `${splitPrice.toLocaleString()}원 구매 요청`}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => setLiked((previous) => !previous)}
            className="h-12 w-12 items-center justify-center rounded-full"
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
                  <Text className="text-[13px] font-semibold text-ink">원</Text>
                </Text>
              ) : (
                <Text className="text-base font-extrabold text-primary">무료나눔</Text>
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
            className="h-[52px] justify-center rounded-btn bg-primary px-6"
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
