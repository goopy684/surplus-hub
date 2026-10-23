import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SEARCH_RADIUS_OPTIONS_KM,
  TRADE_METHOD_OPTIONS,
  useAiSearch,
  useMaterials,
  type AiSearchResult,
} from "@repo/core";
import { useRouter } from "expo-router";
import { Chip } from "../components/Chip";

export default function SearchScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [tradeMethod, setTradeMethod] = useState<string | undefined>();
  const [nearby, setNearby] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // 하이브리드 AI 검색이 기본. 검색어가 없거나 AI 검색이 실패하면 기존 키워드 목록으로 대체한다.
  const aiResult = useAiSearch({
    q: submittedKeyword,
    tradeMethod,
    ...(nearby
      ? { locationLat: nearby.lat, locationLng: nearby.lng, radiusKm: nearby.radiusKm, sortBy: "distance" }
      : {}),
    page: 1,
    limit: 20,
  });
  // 거래방식·내 주변 필터는 AI 검색 API만 지원한다. 필터가 켜져 있으면 필터 없는 키워드 목록으로 바꾸지 않는다.
  const filtersActive = !!tradeMethod || !!nearby;
  const keywordFallback = !filtersActive && (!submittedKeyword || !!aiResult.error);
  // AI 검색이 살아 있으면 키워드를 빼서 이미 캐시된 기본 목록 쿼리를 재사용 (불필요한 키워드 요청 방지)
  const keywordResult = useMaterials({
    keyword: keywordFallback ? submittedKeyword || undefined : undefined,
    page: 1,
    limit: 20,
  });
  const { data, isLoading, error } = keywordFallback ? keywordResult : aiResult;
  const items: AiSearchResult[] = data?.data ?? [];

  const handleSubmit = () => {
    setSubmittedKeyword(keyword.trim());
  };

  const selectRadius = async (radiusKm: number | null) => {
    if (radiusKm === null) {
      setNearby(null);
      return;
    }
    if (nearby) {
      setNearby({ ...nearby, radiusKm });
      return;
    }

    setIsLocating(true);
    try {
      const Location = require("expo-location") as typeof import("expo-location");

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("권한 필요", "위치 접근 권한이 필요합니다.");
        return;
      }

      const { coords } = await Location.getCurrentPositionAsync({});
      setNearby({ lat: coords.latitude, lng: coords.longitude, radiusKm });
    } catch {
      Alert.alert("오류", "위치 정보를 가져오지 못했습니다.");
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="border-b border-line bg-surface px-5 pt-4 pb-4">
        <Text className="text-[19px] font-bold tracking-[-0.4px] text-ink">검색</Text>
        <Text className="mt-1 text-[13px] text-ink-2">현장 용어로 검색해도 AI가 비슷한 매물을 찾아드려요.</Text>
        <View className="mt-4 flex-row gap-2">
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            onSubmitEditing={handleSubmit}
            placeholder="아시바, 분홍색 단열재, 녹 안 스는 파이프"
            placeholderTextColor="#8A92A3"
            className="flex-1 rounded-field border-[1.5px] border-line bg-surface px-4 py-3 text-base text-ink"
            returnKeyType="search"
          />
          <TouchableOpacity onPress={handleSubmit} className="justify-center rounded-chip bg-primary px-5 py-3">
            <Text className="text-base font-bold text-primary-foreground">검색</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ gap: 8 }}>
          <Chip label="전체" selected={!tradeMethod} onPress={() => setTradeMethod(undefined)} />
          {TRADE_METHOD_OPTIONS.map(({ value, label }) => (
            <Chip key={value} label={label} selected={tradeMethod === value} onPress={() => setTradeMethod(value)} />
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-2"
          contentContainerStyle={{ gap: 8, alignItems: "center" }}
        >
          <Text className="text-[13px] font-semibold text-ink-2">내 주변</Text>
          <Chip label="끄기" selected={!nearby} onPress={() => selectRadius(null)} />
          {SEARCH_RADIUS_OPTIONS_KM.map((radiusKm) => (
            <Chip
              key={radiusKm}
              label={`${radiusKm}km`}
              selected={nearby?.radiusKm === radiusKm}
              onPress={() => selectRadius(radiusKm)}
            />
          ))}
          {isLocating ? <ActivityIndicator color="#1E3FCC" /> : null}
        </ScrollView>
      </View>

      {isLoading ? (
        <View className="mt-8 items-center">
          <ActivityIndicator size="large" color="#1E3FCC" />
        </View>
      ) : null}

      {error ? <Text className="px-5 pt-6 text-base text-ink-2">검색 결과를 불러오지 못했습니다.</Text> : null}

      {!isLoading && !error ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/material/${item.id}`)}
              className="mb-3 rounded-card border border-line-2 bg-surface p-4"
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-base font-bold text-ink">{item.title}</Text>
                  <Text className="mt-1 text-sm text-ink-2" numberOfLines={2}>
                    {item.description}
                  </Text>
                  <Text className="mt-2 text-[12.5px] text-ink-2">
                    {item.distanceKm !== undefined ? `${item.distanceKm.toFixed(1)}km · ` : ""}
                    {item.location || "위치 정보 없음"}
                  </Text>
                </View>
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
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            submittedKeyword || filtersActive ? (
              <View className="rounded-card bg-field p-6">
                <Text className="text-center text-base text-ink-2">
                  {submittedKeyword ? "검색 결과가 없습니다." : "검색어를 입력하면 필터가 적용됩니다."}
                </Text>
              </View>
            ) : null
          }
        />
      ) : null}
    </SafeAreaView>
  );
}
