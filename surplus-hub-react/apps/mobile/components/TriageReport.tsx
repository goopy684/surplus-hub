import { Text, View } from "react-native";
import type { TriageDiagnosis } from "@repo/core";

const won = (value: number) => Math.abs(value).toLocaleString();
const signed = (value: number) => `${value > 0 ? "+" : "−"}${Math.abs(value)}`;

// 결과 화면 전용 리포트. 숫자는 API가 준 값만 그린다 (design.md 정직성 규칙).
export function TriageReport({ diagnosis }: { diagnosis: TriageDiagnosis }) {
  const { comparison } = diagnosis;
  const grade = diagnosis.conditionGrade;
  const score = Math.max(0, Math.min(100, diagnosis.liquidityScore));
  const amount = [
    diagnosis.quantity && diagnosis.quantity > 0
      ? `수량 ${diagnosis.quantity}${diagnosis.quantityUnit ? ` ${diagnosis.quantityUnit}` : ""}`
      : null,
    // 추정 중량(기본값)은 입력값처럼 보이지 않게 헤더에서 뺀다 — 아래 안내 문구가 대신 설명한다.
    diagnosis.weightKg && !diagnosis.weightEstimated ? `${diagnosis.weightKg.toLocaleString()}kg` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const pathEta =
    diagnosis.dispositionPath === "A"
      ? diagnosis.expectedDays > 0
        ? `예상 소진 약 ${diagnosis.expectedDays}일`
        : null
      : diagnosis.dispositionPath === "B"
        ? "48시간 매입 호가 접수"
        : "즉시 일괄 처분 권장";

  return (
    <View className="gap-3">
      {/* 헤더 */}
      <View className="rounded-card bg-surface p-5">
        <Text className="text-[22px] font-extrabold leading-[29px] tracking-[-0.6px] text-ink">{diagnosis.title}</Text>
        {diagnosis.category || diagnosis.materialLabel || grade || amount ? (
          <View className="mt-3 flex-row flex-wrap items-center gap-1.5">
            {diagnosis.category ? (
              <View className="rounded-chip border border-line bg-surface px-2.5 py-0.5">
                <Text className="text-[11.5px] font-bold text-ink-2">{diagnosis.category}</Text>
              </View>
            ) : null}
            {diagnosis.materialLabel ? (
              <View className="rounded-chip border border-line bg-surface px-2.5 py-0.5">
                <Text className="text-[11.5px] font-bold text-ink-2">{diagnosis.materialLabel}</Text>
              </View>
            ) : null}
            {grade ? (
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
            {amount ? <Text className="text-xs text-ink-2">{amount}</Text> : null}
          </View>
        ) : null}
      </View>

      {/* 유동성 점수 — 단색 게이지 */}
      <View className="rounded-card bg-surface p-5">
        <Text className="text-sm font-semibold text-ink-2">유동성 점수</Text>
        <Text className="mt-1 text-[40px] font-extrabold tracking-[-1px] tabular-nums text-ink">
          {diagnosis.liquidityScore}점
        </Text>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="유동성 점수"
          accessibilityValue={{ min: 0, max: 100, now: score }}
          className="mt-3 h-2.5 overflow-hidden rounded-chip bg-line-2"
        >
          <View className="h-full rounded-chip bg-primary" style={{ width: `${score}%` }} />
        </View>
        <Text className="mt-3 text-[13px] font-medium text-ink-2">
          7일 내 매칭 확률 <Text className="font-bold tabular-nums text-ink">{diagnosis.matchProbability7d}%</Text> (추정)
        </Text>
        {pathEta ? <Text className="mt-1 text-[13px] font-medium text-ink-2">{pathEta}</Text> : null}
        {diagnosis.scoreDelta !== 0 ? (
          <Text
            className={`mt-1 text-[13px] font-bold tabular-nums ${
              diagnosis.scoreDelta > 0 ? "text-olive-tx" : "text-destructive"
            }`}
          >
            최초 진단 대비 {signed(diagnosis.scoreDelta)}점
          </Text>
        ) : null}
      </View>

      {/* 추천 처분 경로 */}
      <View className="rounded-card bg-surface p-5">
        <Text className="text-sm font-semibold text-ink-2">추천 처분 경로</Text>
        <Text className="mt-1 text-lg font-bold text-ink">
          Path {diagnosis.dispositionPath}
          {diagnosis.pathLabel ? ` · ${diagnosis.pathLabel}` : ""}
        </Text>
        {diagnosis.pathReason ? (
          <Text className="mt-1 text-[14px] leading-[22px] text-ink-2">{diagnosis.pathReason}</Text>
        ) : null}
      </View>

      {/* 폐기손실 비교 — 세 번째 카드가 주인공 */}
      <View className="gap-2 rounded-card bg-surface p-5">
        <Text className="mb-1 text-sm font-semibold text-ink-2">폐기손실 비교</Text>
        <View className="rounded-field bg-field p-4">
          <Text className="text-[13px] font-medium text-ink-2">혼합폐기물로 버리면</Text>
          <Text className="mt-1 text-lg font-bold tabular-nums text-destructive">−{won(comparison.mixedWaste)}원</Text>
        </View>
        <View className="rounded-field bg-field p-4">
          <Text className="text-[13px] font-medium text-ink-2">고철로 넘기면</Text>
          <Text className="mt-1 text-lg font-bold tabular-nums text-ink">+{won(comparison.scrap)}원</Text>
        </View>
        <View className="rounded-field border border-olive-bd bg-olive-bg p-4">
          <Text className="text-[13px] font-medium text-olive-tx">자투리로 팔면</Text>
          <Text className="mt-1 text-lg font-bold tabular-nums text-ink">+{won(comparison.directSale)}원 입금</Text>
          <Text className="mt-2 text-[24px] font-extrabold tracking-[-0.6px] tabular-nums text-olive-tx">
            실질 +{won(comparison.netBenefit)}원 이득
          </Text>
          <Text className="mt-0.5 text-xs text-olive-tx">폐기비 회피 포함</Text>
        </View>
      </View>

      {/* 추정 근거 안내 */}
      <View className="gap-1 px-1">
        {diagnosis.coldStart ? (
          <Text className="text-xs leading-[18px] text-ink-2">주변 거래 데이터가 아직 적어 품목 기본값으로 추정했습니다.</Text>
        ) : null}
        {diagnosis.weightEstimated ? (
          <Text className="text-xs leading-[18px] text-ink-2">중량 미입력 — 100kg 기준으로 계산했습니다.</Text>
        ) : null}
        <Text className="text-xs leading-[18px] text-ink-2">
          {comparison.priceBasis === "similar_listings"
            ? `유사 매물 ${comparison.similarPriceCount}건의 중앙값 기준입니다.`
            : "유사 매물이 부족해 품목 평균가로 추정했습니다."}
        </Text>
        <Text className="text-xs leading-[18px] text-ink-2">폐기·고철 단가는 기준 단가표에 따른 추정치입니다.</Text>
      </View>
    </View>
  );
}
