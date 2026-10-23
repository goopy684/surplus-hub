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
        <ActivityIndicator size="large" color="#1E3FCC" />
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
      numColumns={2}
      columnWrapperStyle={{ paddingHorizontal: 20, gap: 12 }}
      contentContainerStyle={{ paddingBottom: 112, rowGap: 24 }}
      ListHeaderComponent={
        <View>
          {/* MASTHEAD — B 카탈로그: 굵은 타이틀 + 원형 알림 (지역선택은 RN 미지원으로 생략) */}
          <View className="flex-row items-center justify-between bg-surface px-5 pt-4 pb-3">
            <View className="flex-1 pr-3">
              <Text className="text-[22px] font-extrabold tracking-[-0.6px] text-ink">자투리</Text>
              <Text className="mt-0.5 text-[13px] text-ink-2">내 주변 잔여 자재를 찾아보세요</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : "알림"}
              onPress={() => router.push("/notifications")}
              className="min-h-[44px] flex-row items-center justify-center gap-1.5 rounded-chip bg-field px-4"
            >
              <Text className="text-[13px] font-semibold text-ink">알림</Text>
              {/* 미읽음 배지 — 0이면 렌더하지 않는다 */}
              {unreadCount > 0 ? (
                <View className="rounded-chip bg-primary px-1.5 py-0.5">
                  <Text className="text-xs font-bold tabular-nums text-primary-foreground">
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
                placeholderTextColor="#8A92A3"
                className="h-12 rounded-chip bg-field pl-4 pr-20 text-[15px] text-ink"
                returnKeyType="search"
              />
              <TouchableOpacity
                onPress={handleSearch}
                className="absolute right-1.5 top-1.5 h-9 justify-center rounded-chip bg-primary px-4"
              >
                <Text className="text-sm font-bold text-primary-foreground">검색</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* CATEGORY RAIL — 필터 칩 (활성 = ink 채움 + 흰 글자) */}
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
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  className={`h-[38px] justify-center rounded-chip border px-4 ${
                    isActive ? "border-ink bg-ink" : "border-line bg-surface"
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      isActive ? "font-bold text-surface" : "font-medium text-ink"
                    }`}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* LIST HEADER — 실데이터 카운트 + 정렬 (모바일 정렬 고정: 최신순) */}
          <View className="mb-2 flex-row items-baseline justify-between bg-surface px-5 pb-1">
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
        <View className="items-center gap-3 bg-surface px-5 pt-12 pb-6">
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
              className="min-h-[48px] justify-center rounded-chip border border-line bg-surface px-8"
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
        const meta = [formatLocation(item.location), item.createdAt ? new Date(item.createdAt).toLocaleDateString() : null]
          .filter(Boolean)
          .join(" · ");

        return (
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => router.push(`/material/${item.id}`)}
            className="flex-1 gap-2"
          >
            {/* 정사각 썸네일 — rounded-thumb, field 배경, 그림자/보더 없음 */}
            <View className="relative aspect-square w-full overflow-hidden rounded-thumb bg-field">
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} className="h-full w-full" resizeMode="cover" />
              ) : null}
              {!isSold && (item.status === "RESERVED" || hasGrade) ? (
                <View className="absolute left-2 top-2 flex-row gap-1">
                  {item.status === "RESERVED" ? (
                    <View className="rounded-chip bg-surface px-2.5 py-1">
                      <Text className="text-[11.5px] font-bold text-ink">예약중</Text>
                    </View>
                  ) : null}
                  {hasGrade ? (
                    <View
                      className={`rounded-chip border px-2.5 py-0.5 ${
                        grade === "상" ? "border-olive-bd bg-olive-bg" : "border-line bg-surface"
                      }`}
                    >
                      <Text className={`text-[11.5px] font-bold ${grade === "상" ? "text-olive-tx" : "text-ink-2"}`}>
                        {grade}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {isSold ? (
                <View className="absolute inset-0 items-center justify-center bg-ink/60">
                  <Text className="text-xs font-bold text-surface">판매완료</Text>
                </View>
              ) : null}
            </View>

            <View className="gap-0.5">
              <Text
                numberOfLines={2}
                className={`text-[14px] font-semibold leading-[19px] tracking-[-0.2px] ${
                  isSold ? "text-ink-2" : "text-ink"
                }`}
              >
                {item.title}
              </Text>
              {item.price > 0 ? (
                <Text className={isSold ? "text-ink-2" : "text-ink"}>
                  <Text className="text-[17px] font-bold tracking-[-0.4px] tabular-nums">{item.price.toLocaleString()}</Text>
                  <Text className="text-[13px] font-semibold">원</Text>
                </Text>
              ) : (
                <Text className="text-base font-extrabold text-primary">무료나눔</Text>
              )}
              <Text numberOfLines={1} className="text-xs text-ink-2">
                {meta}
              </Text>
              {(item.likesCount ?? 0) > 0 || (item.quantity && item.quantity > 0) ? (
                <View className="flex-row items-center">
                  {item.quantity && item.quantity > 0 ? (
                    <Text className="text-xs text-ink-2">
                      수량 {item.quantity}
                      {item.quantityUnit ? ` ${item.quantityUnit}` : ""}
                    </Text>
                  ) : null}
                  {(item.likesCount ?? 0) > 0 ? (
                    <Text className="ml-auto text-xs tabular-nums text-ink-2">관심 {item.likesCount}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}
