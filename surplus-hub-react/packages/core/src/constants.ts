// 웹·모바일 공용 도메인 상수.
// 백엔드 seed_categories / ConditionGrade / TradeMethod 값과 맞춰야 한다.

export const MATERIAL_CATEGORIES = ["조명", "문/창호", "건축자재", "전기", "설비", "기타"] as const;

export const CONDITION_GRADES = [
  { value: "상", label: "상 (신품급)" },
  { value: "중", label: "중 (보통)" },
  { value: "하", label: "하 (사용감 있음)" },
] as const;

export const QUANTITY_UNITS = ["개", "장", "박스", "m", "m²", "m³", "kg", "톤", "롤", "세트"] as const;

export const TRADE_METHOD_OPTIONS = [
  { value: "DIRECT", label: "직거래" },
  { value: "DELIVERY", label: "화물·택배" },
  { value: "BOTH", label: "둘 다 가능" },
] as const;

export const TRADE_METHOD_LABELS: Record<string, string> = {
  DIRECT: "직거래",
  DELIVERY: "화물·택배",
  BOTH: "직거래·화물 모두 가능",
};

// "내 주변" 검색 반경 (km)
export const SEARCH_RADIUS_OPTIONS_KM = [5, 10, 30] as const;

// 채팅 원클릭 빠른 답장 (AI 추천과 별개로 항상 노출)
export const QUICK_REPLIES = [
  "현장 직거래 가능합니다",
  "재고 남아있습니다",
  "가격 조정 가능합니다",
  "화물(용달) 발송 가능합니다",
  "규격 사진 보내드릴게요",
] as const;

// 채팅 번역 대상 언어 — 공단·현장 외국인 근로자 주요 모국어
export const TRANSLATION_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "zh", label: "中文" },
  { code: "th", label: "ภาษาไทย" },
  { code: "ne", label: "नेपाली" },
  { code: "uz", label: "Oʻzbekcha" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ko", label: "한국어" },
] as const;

// 분할 구매 금액 — 백엔드 transactions.create_transaction 계산식과 동일하게 유지
export const calcSplitPrice = (price: number, totalQuantity: number, quantity: number): number => {
  if (price <= 0 || !totalQuantity || quantity >= totalQuantity) return price;
  // 백엔드와 같은 정수 반올림: (2*p*q + t) // (2*t). BigInt라 큰 값에서도 1원 오차가 없다.
  const t = BigInt(totalQuantity);
  const rounded = (BigInt(2) * BigInt(price) * BigInt(quantity) + t) / (BigInt(2) * t);
  return Math.max(1, Number(rounded));
};
