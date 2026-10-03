import { useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, TextInput, TouchableOpacity, Image, ScrollView } from "react-native";
import { MaterialItem, useMaterials, useUnreadCount } from "@repo/core";
import { useRouter } from "expo-router";

// 백엔드 seed_categories와 동기화 (조명/문·창호/건자재/전기/설비/기타) — 웹 home과 동일
const CATEGORIES = ["조명", "문/창호", "건축자재", "전기", "설비", "기타"] as const;
const FIXED_SORT = "latest" as const;
const PAGE_SIZE = 20;

const formatLocation = (location?: string): string => {
  if (!location || !location.trim()) return "위치 정보 없음";
  if (/^\s*Lat\s*:/i.test(location) || /Lng\s*:/i.test(location)) return "위치 정보 없음";
  return location;
};

export default function Home() {
  const [searchInput, setSearchInput] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [hasReachedMax, setHasReachedMax] = useState(false);

  const queryParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      category: selectedCategory,
      sort: FIXED_SORT,
      keyword: submittedKeyword.trim() ? submittedKeyword.trim() : undefined,
    }),
    [page, selectedCategory, submittedKeyword]
  );

  const { data, isLoading, isFetching, error } = useMaterials(queryParams);
  const { data: unreadCount = 0 } = useUnreadCount();
  const router = useRouter();

  useEffect(() => {
    setPage(1);
    setMaterials([]);
    setHasReachedMax(false);
  }, [selectedCategory, submittedKeyword]);

  useEffect(() => {
    if (!data) return;

    const incoming = data?.data ?? [];

    setMaterials((previous) => {
      if (page === 1) {
        return incoming;
      }

      const merged = [...previous];
      const seen = new Set(previous.map((item) => item.id));

      for (const item of incoming) {
        if (!seen.has(item.id)) {
          merged.push(item);
          seen.add(item.id);
        }
      }

      return merged;
    });

    setHasReachedMax(incoming.length < PAGE_SIZE);
  }, [data, page]);

  const handleSearch = () => {
    setSubmittedKeyword(searchInput);
  };

  const handleLoadMore = () => {
    if (isFetching || hasReachedMax) return;
    setPage((currentPage) => currentPage + 1);
  };

  const showInitialLoading = isLoading && page === 1 && materials.length === 0;
  const totalCount = data?.meta?.totalCount;

  if (showInitialLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator size="large" color="#ed701d" />
      </View>
    );
  }

  if (error && materials.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <Text className="text-base text-ink-2">자재 목록을 불러오지 못했습니다.</Text>
      </View>
    );
  }

  const chips: Array<{ label: string; value: string | undefined }> = [
    { label: "전체", value: undefined },
    ...CATEGORIES.map((c) => ({ label: c, value: c })),
  ];

  return (
    <FlatList
      className="flex-1 bg-paper"
      data={materials}
      contentContainerStyle={{ paddingBottom: 96 }}
      ListHeaderComponent={
        <View>
          {/* MASTHEAD — 에디토리얼 타이틀 + 알림 진입점 (지역선택은 RN 미지원으로 생략) */}
          <View className="flex-row items-center justify-between border-b border-line bg-surface px-5 pt-3 pb-3.5">
            <View className="flex-1 pr-3">
              <Text className="text-[21px] font-extrabold tracking-[-0.5px] text-ink">자투리</Text>
              <Text className="mt-0.5 text-[13px] text-ink-2">내 주변 잔여 자재를 찾아보세요</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : "알림"}
              onPress={() => router.push("/notifications")}
              className="min-h-[44px] flex-row items-center justify-center gap-1.5 rounded-btn border border-line bg-surface px-4"
            >
              <Text className="text-[13px] font-semibold text-ink">알림</Text>
              {/* 미읽음 배지 — 0이면 렌더하지 않는다. 흰글자-오렌지는 AA 미달이라 accent-soft 칩 사용 */}
              {unreadCount > 0 ? (
                <View className="rounded-chip bg-accent px-1.5 py-0.5">
                  <Text className="text-xs font-semibold tabular-nums text-accent-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          {/* SEARCH — 서버 키워드 검색(useMaterials.keyword). 홈이 유일한 검색 진입점 */}
          <View className="bg-surface px-5 pb-3.5">
            <View className="relative">
              <TextInput
                value={searchInput}
                onChangeText={setSearchInput}
                onSubmitEditing={handleSearch}
                placeholder="시멘트, 파이프, 목재 검색..."
                placeholderTextColor="#8C8275"
                className="rounded-field border border-line bg-field px-4 py-3 pr-20 text-base text-ink"
                returnKeyType="search"
              />
              <TouchableOpacity
                onPress={handleSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-btn bg-primary px-4 py-2"
              >
                <Text className="text-sm font-bold text-primary-foreground">검색</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* CATEGORY RAIL — 필터 칩 (활성 = accent-soft + accent 보더 + accent-text) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="bg-surface"
            contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}
          >
            {chips.map((chip) => {
              const isActive = selectedCategory === chip.value;
              return (
                <TouchableOpacity
                  key={chip.label}
                  onPress={() => setSelectedCategory(chip.value)}
                  className={`rounded-xl border px-3.5 py-2.5 ${
                    isActive ? "border-primary bg-accent" : "border-line bg-surface"
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      isActive ? "font-semibold text-accent-foreground" : "font-medium text-ink"
                    }`}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* LIST HEADER — 실데이터 카운트 + 정렬 (모바일 정렬 고정: 최신순) */}
          <View className="flex-row items-baseline justify-between border-b-2 border-ink bg-surface px-5 pb-2">
            {typeof totalCount === "number" ? (
              <Text className="text-[13px] font-semibold text-ink-2">
                전체 <Text className="font-bold tabular-nums text-ink">{totalCount.toLocaleString()}</Text>건
              </Text>
            ) : (
              <View />
            )}
            <Text className="text-[13px] font-semibold text-ink">최신순</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View className="items-center gap-3 border-t border-line bg-surface px-5 pt-12 pb-6">
          <Text className="text-lg font-medium text-ink">아직 등록된 자재가 없어요</Text>
          <Text className="text-sm text-ink-2">첫 자재를 등록해보세요!</Text>
        </View>
      }
      ListFooterComponent={
        !hasReachedMax && materials.length > 0 ? (
          <View className="items-center bg-surface pt-6 pb-4">
            <TouchableOpacity
              onPress={handleLoadMore}
              disabled={isFetching}
              className="min-h-[48px] justify-center rounded-btn border border-line bg-surface px-8"
            >
              <Text className="text-sm font-semibold text-ink">
                {isFetching ? "불러오는 중..." : "더 보기"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null
      }
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const isSold = item.status === "SOLD";
        const grade = item.conditionGrade;
        const hasGrade = grade === "상" || grade === "중" || grade === "하";
        const hasRow1 = hasGrade || item.status === "RESERVED" || Boolean(item.createdAt);
        const meta = [item.category, formatLocation(item.location)].filter(Boolean).join(" · ");

        return (
          <TouchableOpacity
            onPress={() => router.push(`/material/${item.id}`)}
            className="flex-row gap-3.5 bg-surface px-5"
          >
            {/* Thumbnail 100×100 — rounded-thumb + line-2 보더, 피드에 그림자/카드박스 없음 */}
            <View className="relative my-4 h-[100px] w-[100px] overflow-hidden rounded-thumb border border-line-2 bg-field">
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} className="h-full w-full" resizeMode="cover" />
              ) : null}
              {isSold ? (
                <View className="absolute inset-0 items-center justify-center bg-foreground/70">
                  <Text className="text-xs font-bold text-surface">판매완료</Text>
                </View>
              ) : null}
            </View>

            {/* Info column — border-b는 정보 컬럼에만 들여쓴 헤어라인 */}
            <View className="flex-1 border-b border-line-2 py-4">
              {hasRow1 ? (
                <View className="flex-row items-center gap-1.5">
                  {hasGrade ? (
                    <View
                      className={`rounded-chip border px-2 py-0.5 ${
                        grade === "상" ? "border-olive-bd bg-olive-bg" : "border-line bg-surface"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${grade === "상" ? "text-olive-tx" : "text-ink-2"}`}
                      >
                        {grade}
                      </Text>
                    </View>
                  ) : null}
                  {item.status === "RESERVED" ? (
                    <View className="rounded-chip bg-field px-2 py-0.5">
                      <Text className="text-xs font-semibold text-ink-2">예약중</Text>
                    </View>
                  ) : null}
                  {item.createdAt ? (
                    <Text className="ml-auto text-xs tabular-nums text-ink-2">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <Text
                numberOfLines={2}
                className={`mt-0.5 text-[17px] font-semibold leading-[22px] tracking-[-0.3px] ${
                  isSold ? "text-ink-2" : "text-ink"
                }`}
              >
                {item.title}
              </Text>

              {item.quantity && item.quantity > 0 ? (
                <Text className="mt-1 text-[13.5px] text-ink-2">
                  수량 {item.quantity}
                  {item.quantityUnit ? ` ${item.quantityUnit}` : ""}
                </Text>
              ) : null}

              <Text numberOfLines={1} className="mt-1 text-[12.5px] text-ink-2">
                {meta}
              </Text>

              <View className="mt-auto flex-row items-baseline justify-between pt-1.5">
                {item.price > 0 ? (
                  <Text>
                    <Text className={`text-[20px] font-bold tracking-[-0.5px] tabular-nums ${isSold ? "text-ink-2" : "text-ink"}`}>
                      {item.price.toLocaleString()}
                    </Text>
                    <Text className="text-[13px] font-medium text-ink-2"> 원</Text>
                  </Text>
                ) : (
                  <Text className="text-base font-bold text-ink">무료나눔</Text>
                )}
                <View className="flex-row items-center gap-2">
                  {item.sellerName ? (
                    <Text numberOfLines={1} className="max-w-[120px] text-[12.5px] text-ink-2">
                      {item.sellerName}
                    </Text>
                  ) : null}
                  {(item.likesCount ?? 0) > 0 ? (
                    <Text className="text-[12.5px] tabular-nums text-ink-2">♥ {item.likesCount}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}
