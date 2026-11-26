import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { formatWantedSpec, useCloseWanted, useWanted } from "@repo/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";

const ENDED_LABELS: Record<string, string> = { CLOSED: "마감", EXPIRED: "기간 만료" };

// ponytail: 모바일엔 신고 컴포넌트가 아직 없다 — 웹 ReportModal(targetType "wanted")만 신고를 받는다
export default function WantedDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: wanted, isLoading } = useWanted(id);
  const { mutate: closeWanted, isPending: isClosing } = useCloseWanted();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator size="large" color="#1E3FCC" />
      </View>
    );
  }

  if (!wanted) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <Text className="text-ink-2">구매 요청을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const isOwner = !!user && user.id === wanted.requester.id;
  const isOpen = wanted.status === "OPEN";
  const endedLabel = ENDED_LABELS[wanted.status];
  const spec = formatWantedSpec(wanted);

  const handleClose = () => {
    Alert.alert("요청 마감", "마감하면 목록과 매칭 알림에서 빠집니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "마감하기",
        style: "destructive",
        onPress: () =>
          closeWanted(wanted.id, { onError: () => Alert.alert("오류", "마감하지 못했습니다. 다시 시도해주세요.") }),
      },
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-paper" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View className="flex-row items-center gap-2">
        {endedLabel ? (
          <View className="rounded-chip border border-line bg-field px-2.5 py-0.5">
            <Text className="text-[11.5px] font-bold text-ink-2">{endedLabel}</Text>
          </View>
        ) : null}
        <Text className="text-xs font-semibold text-ink-2">{wanted.category}</Text>
      </View>
      <Text className={`mt-1.5 text-[22px] font-extrabold leading-[29px] tracking-[-0.6px] ${endedLabel ? "text-ink-2" : "text-ink"}`}>
        {wanted.title}
      </Text>
      {spec ? <Text className="mt-2 text-[15px] font-semibold text-ink">{spec}</Text> : null}
      <Text className="mt-1.5 text-[12.5px] text-ink-2">
        {[
          wanted.locationAddress,
          `반경 ${wanted.radiusKm}km`,
          `${new Date(wanted.createdAt).toLocaleDateString()} 등록`,
          isOpen ? `${new Date(wanted.expiresAt).toLocaleDateString()}까지` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {wanted.requester.name ? <Text className="mt-1 text-[12.5px] text-ink-2">요청자 {wanted.requester.name}</Text> : null}
      {wanted.description ? (
        <Text className="mt-4 text-[15px] leading-[24px] text-ink">{wanted.description}</Text>
      ) : null}

      <Text className="mt-8 text-[15px] font-extrabold tracking-[-0.3px] text-ink">맞는 매물</Text>
      {wanted.matches.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap justify-between gap-y-5">
          {wanted.matches.map((item) => (
            <TouchableOpacity
              key={item.id}
              accessibilityRole="link"
              onPress={() => router.push(`/material/${item.id}`)}
              className="w-[48%] gap-2"
            >
              <View className="aspect-square w-full overflow-hidden rounded-thumb bg-field">
                {item.imageUrl ? <Image source={{ uri: item.imageUrl }} className="h-full w-full" resizeMode="cover" /> : null}
              </View>
              <Text numberOfLines={2} className="text-[14px] font-semibold leading-[19px] text-ink">
                {item.title}
              </Text>
              {item.price > 0 ? (
                <Text className="text-ink">
                  <Text className="text-[17px] font-bold tabular-nums">{item.price.toLocaleString()}</Text>
                  <Text className="text-[13px] font-semibold">원</Text>
                </Text>
              ) : (
                <Text className="text-base font-extrabold text-primary">무료나눔</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text className="mt-2 text-sm text-ink-2">
          {isOwner && isOpen ? "아직 맞는 매물이 없어요. 올라오면 알림으로 알려드립니다." : "아직 맞는 매물이 없어요."}
        </Text>
      )}

      {isOpen ? (
        isOwner ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: isClosing, busy: isClosing }}
            disabled={isClosing}
            onPress={handleClose}
            className={`mt-8 min-h-[48px] items-center justify-center rounded-btn border border-line bg-surface ${isClosing ? "opacity-50" : ""}`}
          >
            <Text className="text-sm font-semibold text-ink">{isClosing ? "마감 중…" : "마감하기"}</Text>
          </TouchableOpacity>
        ) : (
          <View className="mt-8">
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.push("/material/register")}
              className="min-h-[52px] items-center justify-center rounded-btn bg-primary"
            >
              <Text className="text-base font-bold text-primary-foreground">맞는 자재 등록하기</Text>
            </TouchableOpacity>
            <Text className="mt-2 text-center text-xs text-ink-2">
              자재를 등록하면 요청자에게 알림이 가고, 매물 채팅으로 연락이 옵니다.
            </Text>
          </View>
        )
      ) : null}
    </ScrollView>
  );
}
