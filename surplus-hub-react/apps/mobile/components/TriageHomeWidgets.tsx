import { Text, TouchableOpacity, View } from "react-native";
import { useHotDemands } from "@repo/core";
import { useRouter } from "expo-router";

// 홈 헤더용 진단 진입점: 배너(항상) + 급구 전광판(데이터 있을 때만).
// 홈에서는 위치 권한을 묻지 않는다 — 좌표 없이 부르면 서버가 전 지역 기준으로 집계한다.
export function TriageHomeWidgets() {
  const router = useRouter();
  const { data } = useHotDemands();
  const items = data?.items.slice(0, 5) ?? [];
  const showBoard = !!data && (items.length > 0 || data.weeklyDisposalSaved > 0);

  return (
    <View className="gap-3 bg-surface px-5 pb-3">
      <View className="rounded-card bg-accent p-4">
        <Text className="text-[17px] font-extrabold tracking-[-0.4px] text-ink">내 창고 자재 3초 가치진단</Text>
        <Text className="mt-1 text-[13px] leading-[19px] text-ink-2">
          버리기 전에 확인하세요. 사진 한 장이면 폐기·고철·직거래 손익을 비교해 드립니다.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="3초 가치진단 시작"
          onPress={() => router.push("/triage")}
          className="mt-3 min-h-[44px] self-start justify-center rounded-btn bg-ink px-5"
        >
          <Text className="text-sm font-bold text-surface">진단 시작</Text>
        </TouchableOpacity>
      </View>

      {showBoard && data ? (
        <View className="rounded-card border border-line-2 bg-surface p-4">
          <Text className="text-[15px] font-bold text-ink">
            {data.scope === "nearby" ? `지금 내 주변 ${data.radiusKm}km 급구 품목` : "지금 많이 찾는 급구 품목"}
          </Text>
          {items.map((item, index) => (
            <View key={item.key || item.label} className="flex-row items-center gap-3 border-b border-line-2 py-2.5">
              <Text className="w-5 text-[15px] font-extrabold tabular-nums text-primary">{index + 1}</Text>
              <Text numberOfLines={1} className="flex-1 text-[14px] font-semibold text-ink">
                {item.label}
              </Text>
              <View className="items-end">
                <Text className="text-xs font-semibold tabular-nums text-ink">유동성 {item.liquidityScore}점</Text>
                <Text className="text-xs tabular-nums text-ink-2">최근 검색 {item.searchCount}회</Text>
              </View>
            </View>
          ))}
          {data.weeklyDisposalSaved > 0 ? (
            <Text className="mt-2.5 text-[13px] font-semibold text-olive-tx">
              이번 주 폐기비 절감 {data.weeklyDisposalSaved.toLocaleString()}원 (등록 전환 {data.weeklyListedCount}건 기준 추정)
            </Text>
          ) : null}
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => router.push("/triage")}
            className="mt-1 min-h-[44px] justify-center"
          >
            <Text className="text-[13px] font-semibold text-ink-2 underline">내 창고에도 있다면 진단해 보기</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
