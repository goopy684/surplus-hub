import { useState } from "react";
import { ActivityIndicator, FlatList, SafeAreaView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMaterials } from "@repo/core";
import { useRouter } from "expo-router";

export default function SearchScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const { data, isLoading, error } = useMaterials({
    keyword: submittedKeyword || undefined,
    page: 1,
    limit: 20,
  });

  const handleSubmit = () => {
    setSubmittedKeyword(keyword.trim());
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="border-b border-line bg-surface px-5 pt-4 pb-4">
        <Text className="text-[19px] font-bold tracking-[-0.4px] text-ink">검색</Text>
        <Text className="mt-1 text-[13px] text-ink-2">자재명을 검색해 원하는 매물을 찾으세요.</Text>
        <View className="mt-4 flex-row gap-2">
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            onSubmitEditing={handleSubmit}
            placeholder="시멘트, 파이프, 목재 검색..."
            placeholderTextColor="#8C8275"
            className="flex-1 rounded-field border border-line bg-field px-4 py-3 text-base text-ink"
            returnKeyType="search"
          />
          <TouchableOpacity onPress={handleSubmit} className="justify-center rounded-btn bg-primary px-5 py-3">
            <Text className="text-base font-bold text-primary-foreground">검색</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View className="mt-8 items-center">
          <ActivityIndicator size="large" color="#ed701d" />
        </View>
      ) : null}

      {error ? <Text className="px-5 pt-6 text-base text-ink-2">검색 결과를 불러오지 못했습니다.</Text> : null}

      {!isLoading && !error ? (
        <FlatList
          data={data?.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/material/${item.id}`)}
              className="mb-3 rounded-thumb border border-line bg-surface p-4"
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-base font-bold text-ink">{item.title}</Text>
                  <Text className="mt-1 text-sm text-ink-2" numberOfLines={2}>
                    {item.description}
                  </Text>
                  <Text className="mt-2 text-[12.5px] text-ink-2">{item.location || "위치 정보 없음"}</Text>
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
            submittedKeyword ? (
              <View className="rounded-thumb border border-dashed border-line bg-surface p-6">
                <Text className="text-center text-base text-ink-2">검색 결과가 없습니다.</Text>
              </View>
            ) : null
          }
        />
      ) : null}
    </SafeAreaView>
  );
}
