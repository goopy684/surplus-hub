import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { useTriageVault } from "@repo/core";
import { useRouter } from "expo-router";

export default function TriageVaultScreen() {
  const router = useRouter();
  const { data = [], isLoading, error, refetch, isRefetching } = useTriageVault(true);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#1E3FCC" />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-canvas"
      data={data}
      keyExtractor={(item) => item.id ?? item.shareToken}
      contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      ListHeaderComponent={
        error ? <Text className="pb-2 text-base text-ink-2">보관함을 불러오지 못했습니다.</Text> : null
      }
      ListEmptyComponent={
        error ? null : (
          <View className="items-center gap-3 rounded-card bg-surface px-6 py-10">
            <Text className="text-lg font-bold text-ink">보관함이 비어 있어요</Text>
            <Text className="text-center text-sm leading-[21px] text-ink-2">
              지금 팔지 않을 자재도 진단해 담아두면 수요가 생길 때 알려드립니다.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.push("/triage")}
              className="mt-2 min-h-[52px] items-center justify-center rounded-btn bg-primary px-8"
            >
              <Text className="text-base font-bold text-primary-foreground">3초 가치진단</Text>
            </TouchableOpacity>
          </View>
        )
      }
      renderItem={({ item }) => {
        const thumbnail = item.imageUrls[0];
        const isListed = item.status === "LISTED_MATERIAL";
        return (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${item.title} 진단 결과 보기`}
            disabled={!item.id}
            onPress={() => router.push(`/triage/${item.id}`)}
            className="flex-row gap-3 rounded-card bg-surface p-4"
          >
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} className="h-16 w-16 rounded-thumb bg-field" resizeMode="cover" />
            ) : (
              <View className="h-16 w-16 rounded-thumb bg-field" />
            )}
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text numberOfLines={1} className="flex-1 text-[15px] font-semibold text-ink">
                  {item.title}
                </Text>
                {isListed ? (
                  <View className="rounded-chip border border-line bg-surface px-2 py-0.5">
                    <Text className="text-[11.5px] font-bold text-ink-2">등록 완료</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-xs text-ink-2">
                Path {item.dispositionPath}
                {item.pathLabel ? ` · ${item.pathLabel}` : ""}
              </Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-[13px] font-semibold tabular-nums text-ink">유동성 {item.liquidityScore}점</Text>
                {item.scoreDelta !== 0 ? (
                  <Text
                    className={`text-[13px] font-bold tabular-nums ${
                      item.scoreDelta > 0 ? "text-olive-tx" : "text-destructive"
                    }`}
                  >
                    {item.scoreDelta > 0 ? "+" : "−"}
                    {Math.abs(item.scoreDelta)}점
                  </Text>
                ) : null}
              </View>
              <Text className="text-[13px] font-bold tabular-nums text-olive-tx">
                실질 +{item.comparison.netBenefit.toLocaleString()}원
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}
