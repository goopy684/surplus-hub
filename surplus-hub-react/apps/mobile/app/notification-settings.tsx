import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationPreferences,
} from "@repo/core";

// Switch는 className을 받지 않아 토큰 대신 색상값을 직접 넘긴다 (ActivityIndicator color와 동일 예외).
// design.md 토큰 미러링 — false = `--line`(border-line), true = `--accent`(bg-primary).
// design.md를 바꾸면 이 두 값도 같이 바꿔야 조용히 어긋나지 않는다.
const TRACK_COLOR = { false: "#e2e4e9", true: "#ed701d" } as const;

const CATEGORIES: Array<{
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}> = [
  { key: "pushChat", label: "채팅", description: "새 채팅 메시지가 오면 알려드립니다." },
  { key: "pushMaterial", label: "자재 거래", description: "관심 자재와 내 거래 상태 변화를 알려드립니다." },
  { key: "pushCommunity", label: "커뮤니티", description: "내 글에 달린 댓글과 답글을 알려드립니다." },
  {
    key: "pushMarketing",
    label: "광고성·마케팅 정보 (선택)",
    // 정보통신망법 제50조 — 광고성 정보는 명시적 사전 동의가 필요하다.
    description: "이벤트·혜택 등 광고성 정보 수신에 동의합니다. 선택 항목이며 언제든 해제할 수 있습니다.",
  },
];

export default function NotificationSettingsScreen() {
  const { data: preferences, isLoading, error } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [osGranted, setOsGranted] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => {
      Notifications.getPermissionsAsync()
        .then((status) => setOsGranted(status.granted))
        // 권한 조회 자체가 불가한 환경에서는 안내를 띄우지 않는다.
        .catch(() => setOsGranted(null));
    };

    check();
    // OS 설정에서 권한을 바꾸고 돌아오면 안내 문구도 갱신되어야 한다.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });

    return () => subscription.remove();
  }, []);

  const toggle = (key: keyof NotificationPreferences, value: boolean) => {
    // 훅이 성공 시 서버 응답으로 캐시를 갱신한다.
    const patch: Partial<NotificationPreferences> = { [key]: value };
    update.mutate(patch);
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator size="large" color="#ed701d" />
      </View>
    );
  }

  if (error || !preferences) {
    return (
      <View className="flex-1 items-center justify-center bg-paper px-5">
        <Text className="text-base text-ink-2">알림 설정을 불러오지 못했습니다.</Text>
      </View>
    );
  }

  const isBusy = update.isPending;
  const categoriesDisabled = !preferences.pushEnabled || isBusy;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        {osGranted === false ? (
          <View className="mb-4 rounded-thumb border border-line bg-accent p-4">
            <Text className="text-[15px] font-semibold text-accent-foreground">
              기기 알림 권한이 꺼져 있습니다
            </Text>
            {/* bg-accent(#fdf0e7) 위에서 text-ink-2는 4.38:1로 AA(4.5:1) 미달 — accent-foreground는 5.24:1 */}
            <Text className="mt-1 text-[13.5px] text-accent-foreground">
              시스템 설정에서 알림을 허용해야 아래 설정이 적용됩니다.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="시스템 알림 설정 열기"
              onPress={() => void Linking.openSettings()}
              className="mt-3 min-h-[44px] justify-center self-start rounded-btn border border-line bg-surface px-4"
            >
              <Text className="text-[13px] font-semibold text-ink">설정 열기</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View className="rounded-thumb border border-line bg-surface px-4">
          <View className="min-h-[44px] flex-row items-center justify-between gap-3 py-4">
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-ink">푸시 알림 받기</Text>
              <Text className="mt-1 text-[13.5px] text-ink-2">
                끄면 아래 항목과 관계없이 푸시 알림을 보내지 않습니다.
              </Text>
            </View>
            <Switch
              accessibilityLabel="푸시 알림 받기"
              value={preferences.pushEnabled}
              disabled={isBusy}
              onValueChange={(value) => toggle("pushEnabled", value)}
              trackColor={TRACK_COLOR}
              ios_backgroundColor={TRACK_COLOR.false}
            />
          </View>
        </View>

        <View className="mt-4 rounded-thumb border border-line bg-surface px-4">
          <Text className="pt-4 text-[13px] font-semibold text-ink-2">알림 종류</Text>
          {CATEGORIES.map((category) => (
            <View
              key={category.key}
              className={`min-h-[44px] flex-row items-center justify-between gap-3 border-t border-line-2 py-4 ${
                preferences.pushEnabled ? "" : "opacity-50"
              }`}
            >
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-ink">{category.label}</Text>
                <Text className="mt-1 text-[13.5px] text-ink-2">{category.description}</Text>
              </View>
              <Switch
                accessibilityLabel={category.label}
                value={preferences[category.key]}
                disabled={categoriesDisabled}
                onValueChange={(value) => toggle(category.key, value)}
                trackColor={TRACK_COLOR}
                ios_backgroundColor={TRACK_COLOR.false}
              />
            </View>
          ))}
        </View>

        {update.error ? (
          <Text className="mt-4 text-[13.5px] text-destructive">
            설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
