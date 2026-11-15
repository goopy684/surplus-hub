import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Share, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  TRIAGE_PATH_LABELS,
  useConvertTriage,
  useSaveTriageToVault,
  useTriage,
  type TriageDiagnosis,
  type TriagePath,
} from "@repo/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Chip } from "../../components/Chip";
import { TriageReport } from "../../components/TriageReport";

const PATHS: TriagePath[] = ["A", "B", "C"];
const ACTION_LABELS: Record<TriagePath, string> = {
  A: "메인 마켓에 원클릭 등록",
  B: "매입 호가 트랙에 올리기",
  C: "중량 일괄 처분 트랙에 올리기",
};

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

// 소재·규격이 모두 없으면 수요 매칭에 쓸 단어가 없어 서버가 보관을 거절한다.
const isNoDemandTerms = (error: unknown): boolean => {
  const response = (error as { response?: { status?: number; data?: { detail?: { code?: string } } } } | null)
    ?.response;
  return response?.status === 422 && response.data?.detail?.code === "NO_DEMAND_TERMS";
};

const defaultPrice = (diagnosis: TriageDiagnosis, path: TriagePath) =>
  path === "A" ? diagnosis.comparison.directSale : diagnosis.comparison.scrap;

export default function TriageResultScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const triageId = typeof id === "string" ? id : "";
  const { data: diagnosis, isLoading, error, refetch } = useTriage(triageId);
  const convert = useConvertTriage();
  const saveVault = useSaveTriageToVault();
  const [selectedPath, setSelectedPath] = useState<TriagePath | null>(null);
  // null = 사용자가 손대지 않음 → 경로가 바뀌면 그 경로의 추정가로 다시 채운다.
  const [priceText, setPriceText] = useState<string | null>(null);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#1E3FCC" />
      </View>
    );
  }

  if (error || !diagnosis) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
        <Text className="text-center text-base text-ink-2">진단 결과를 불러오지 못했습니다.</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.replace("/triage")}
          className="min-h-[44px] items-center justify-center rounded-btn border border-line bg-surface px-6"
        >
          <Text className="text-[15px] font-semibold text-ink">다시 진단하기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const path = selectedPath ?? diagnosis.dispositionPath;
  const suggested = defaultPrice(diagnosis, path);
  const priceValue = priceText ?? (suggested > 0 ? String(Math.round(suggested)) : "");
  const isListed = diagnosis.status === "LISTED_MATERIAL";
  const isSaved = diagnosis.status === "VAULT_SAVED";

  const handleConvert = async () => {
    if (convert.isPending) return;
    const price = Number(priceValue);
    try {
      const result = await convert.mutateAsync({
        id: triageId,
        input: { path, price: price > 0 ? price : undefined },
      });
      if (result.materialId) router.replace(`/material/${result.materialId}`);
    } catch (convertError) {
      if (statusOf(convertError) === 409) {
        // 이미 전환됨 — 다시 읽어 등록 완료 상태를 보여준다.
        void refetch();
        return;
      }
      Alert.alert("등록 실패", "매물 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const handleSave = () => {
    saveVault.mutate(triageId, {
      onError: (saveError) => {
        if (isNoDemandTerms(saveError)) {
          Alert.alert(
            "저장할 수 없습니다",
            "소재나 규격이 있어야 수요 알림을 보낼 수 있습니다. 소재를 고르거나 규격을 적어 다시 진단해 주세요.",
            [
              { text: "닫기", style: "cancel" },
              { text: "다시 진단하기", onPress: () => router.replace("/triage") },
            ]
          );
          return;
        }
        Alert.alert("저장 실패", "보관함에 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
      },
    });
  };

  const handleShare = async () => {
    if (!diagnosis.shareUrl) return;
    try {
      await Share.share({
        message: `${diagnosis.title} — 버리면 −${Math.abs(diagnosis.comparison.mixedWaste).toLocaleString()}원, 팔면 실질 +${diagnosis.comparison.netBenefit.toLocaleString()}원\n${diagnosis.shareUrl}`,
      });
    } catch {
      // 공유 시트 취소·실패 — 화면 상태와 무관하다.
    }
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <TriageReport diagnosis={diagnosis} />

      <View className="mt-3 rounded-card bg-surface p-5">
        {isListed ? (
          <View className="gap-3">
            <Text className="text-base font-bold text-ink">이미 매물로 등록되었습니다</Text>
            {diagnosis.materialId ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => router.push(`/material/${diagnosis.materialId}`)}
                className="min-h-[52px] items-center justify-center rounded-btn bg-primary"
              >
                <Text className="text-base font-bold text-primary-foreground">매물 보기</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View>
            <Text className="mb-2 text-base font-semibold text-ink">처분 경로</Text>
            <View className="flex-row flex-wrap gap-2">
              {PATHS.map((option) => (
                <Chip
                  key={option}
                  label={`Path ${option} · ${TRIAGE_PATH_LABELS[option]}`}
                  selected={path === option}
                  onPress={() => setSelectedPath(option)}
                />
              ))}
            </View>
            <Text className="mt-2 text-xs text-ink-2">
              AI 추천: Path {diagnosis.dispositionPath}. 직접 바꿀 수 있습니다.
            </Text>

            <Text className="mt-5 mb-2 text-base font-semibold text-ink">희망 가격 (원)</Text>
            <TextInput
              value={priceValue}
              onChangeText={(text) => setPriceText(text.replace(/\D/g, ""))}
              placeholder="0"
              placeholderTextColor="#8A92A3"
              keyboardType="numeric"
              accessibilityLabel="희망 가격(원)"
              className="h-12 rounded-field border-[1.5px] border-line bg-surface px-4 text-[15px] tabular-nums text-ink"
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={ACTION_LABELS[path]}
              accessibilityState={{ disabled: convert.isPending, busy: convert.isPending }}
              disabled={convert.isPending}
              onPress={() => void handleConvert()}
              className={`mt-5 min-h-[52px] items-center justify-center rounded-btn bg-primary ${
                convert.isPending ? "opacity-50" : ""
              }`}
            >
              <Text className="text-base font-bold text-primary-foreground">
                {convert.isPending ? "등록 중…" : ACTION_LABELS[path]}
              </Text>
            </TouchableOpacity>
            {path !== "A" ? (
              <Text className="mt-2 text-xs leading-[18px] text-ink-2">
                메인 마켓에는 노출되지 않고 전문 매입처 트랙에만 올라갑니다. 호가 제안은 채팅으로 받습니다.
              </Text>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaved || saveVault.isPending }}
              disabled={isSaved || saveVault.isPending}
              onPress={handleSave}
              className={`mt-4 min-h-[48px] items-center justify-center rounded-btn bg-field px-4 ${
                saveVault.isPending ? "opacity-50" : ""
              }`}
            >
              <Text className={`text-center text-[15px] font-semibold ${isSaved ? "text-ink-2" : "text-ink"}`}>
                {isSaved ? "보관함에 저장됨" : "보관함에 담아두고 수요 생기면 알림 받기"}
              </Text>
            </TouchableOpacity>
            {isSaved ? (
              <Text className="mt-2 text-xs text-ink-2">주변 수요가 늘어 점수가 오르면 알림을 보내드립니다.</Text>
            ) : null}
          </View>
        )}
      </View>

      {diagnosis.shareUrl ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void handleShare()}
          className="mt-3 min-h-[48px] items-center justify-center rounded-btn border border-line bg-surface"
        >
          <Text className="text-[15px] font-semibold text-ink">결재·공유용 리포트 공유</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}
