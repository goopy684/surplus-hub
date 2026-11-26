import { useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { MATERIAL_CATEGORIES, formatWantedSpec, useWantedList } from "@repo/core";
import { useRouter } from "expo-router";
import { Chip } from "../../components/Chip";

export default function WantedListScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const { data, isLoading, error, refetch, isRefetching } = useWantedList(category ? { category } : {});

  return (
    <FlatList
      className="flex-1 bg-canvas"
      data={data?.data ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      ListHeaderComponent={
        <View className="gap-3">
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push("/wanted/new")}
            className="min-h-[52px] items-center justify-center rounded-btn bg-primary"
          >
            <Text className="text-base font-bold text-primary-foreground">구해요 등록</Text>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="전체" selected={category === undefined} onPress={() => setCategory(undefined)} />
            {MATERIAL_CATEGORIES.map((name) => (
              <Chip key={name} label={name} selected={category === name} onPress={() => setCategory(name)} />
            ))}
          </ScrollView>
          {error ? <Text className="text-base text-ink-2">구매 요청을 불러오지 못했습니다.</Text> : null}
        </View>
      }
      ListEmptyComponent={
        isLoading ? (
          <ActivityIndicator size="large" color="#1E3FCC" className="mt-10" />
        ) : error ? null : (
          <View className="items-center gap-2 rounded-card bg-surface px-6 py-10">
            <Text className="text-lg font-bold text-ink">아직 올라온 구매 요청이 없어요</Text>
            <Text className="text-center text-sm leading-[21px] text-ink-2">
              찾는 자재를 먼저 올려두면 맞는 매물이 등록될 때 알려드립니다.
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => {
        const spec = formatWantedSpec(item);
        return (
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => router.push(`/wanted/${item.id}`)}
            className="rounded-card bg-surface p-4"
          >
            <Text className="text-xs font-semibold text-ink-2">{item.category}</Text>
            <Text numberOfLines={2} className="mt-0.5 text-[15px] font-semibold leading-[20px] text-ink">
              {item.title}
            </Text>
            {spec ? <Text className="mt-1 text-[13px] text-ink">{spec}</Text> : null}
            <Text numberOfLines={1} className="mt-1 text-xs text-ink-2">
              {[item.locationAddress, `반경 ${item.radiusKm}km`, new Date(item.createdAt).toLocaleDateString()]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}
