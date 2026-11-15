// 거래 전 AI 유동성 진단 (백엔드 /api/v1/ai/triage 와 1:1)

export type TriagePath = "A" | "B" | "C";
export type TriageStatus = "DIAGNOSED" | "VAULT_SAVED" | "LISTED_MATERIAL";

/**
 * 소재 칩 — 백엔드 triage.MATERIALS 키와 동기화. 고철 단가·소재 가치에만 쓰인다.
 * 재사용 수요의 기본값은 품목(MATERIAL_CATEGORIES, TriageInput.category)이 정한다.
 * 선택 사항: 금속이 아니거나 모르면 고르지 않는다.
 */
export const TRIAGE_MATERIAL_OPTIONS = [
  { key: "sus304", label: "SUS304" },
  { key: "sus316", label: "SUS316" },
  { key: "sus430", label: "SUS430(자성)" },
  { key: "copper", label: "구리(동)" },
  { key: "brass", label: "황동" },
  { key: "aluminum", label: "알루미늄" },
  { key: "wire", label: "전선·케이블" },
  { key: "steel", label: "철·강재" },
  { key: "cast_iron", label: "주철" },
  { key: "lead", label: "납" },
  { key: "nickel", label: "니켈합금" },
  { key: "carbide", label: "초경" },
  { key: "titanium", label: "티타늄" },
  { key: "battery", label: "납축 배터리" },
  { key: "battery_li", label: "리튬 배터리" },
] as const;

/** 물량 칩 → 대략 중량(kg). 정확한 중량을 모를 때 3초 입력용 */
export const TRIAGE_VOLUME_OPTIONS = [
  { label: "손수레", weightKg: 50 },
  { label: "파렛트", weightKg: 300 },
  { label: "1톤 트럭", weightKg: 1000 },
] as const;

export const TRIAGE_PATH_LABELS: Record<TriagePath, string> = {
  A: "원형 재사용 직거래",
  B: "소재 매입 호가 비딩",
  C: "중량 일괄 처분",
};

/** 이 점수 이상이면서 경로 A인 매물에 '고유동성' 배지를 붙인다 */
export const HIGH_LIQUIDITY_SCORE = 70;

export interface TriageInput {
  /** 업로드된 URL만 (data URL 금지). 최대 3장 */
  imageUrls?: string[];
  specText?: string;
  labelText?: string;
  /** 품목 — MATERIAL_CATEGORIES(6개 업종) 중 하나. 비우면 서버가 메모에서 추정한다 */
  category?: string;
  /** 소재 — TRIAGE_MATERIAL_OPTIONS의 key. 모르면 비운다 */
  materialKey?: string;
  conditionGrade?: string;
  quantity?: number;
  quantityUnit?: string;
  weightKg?: number;
  lat?: number;
  lng?: number;
  locationAddress?: string;
}

export interface TriageComparison {
  /** 혼합폐기물 처리 시 손실 (음수) */
  mixedWaste: number;
  /** 일반 고철 파쇄 시 회수액 */
  scrap: number;
  /** 자투리 직거래 예상 판매 대금 */
  directSale: number;
  /** 판매 대금 + 폐기비 회피액 */
  netBenefit: number;
  priceBasis: "similar_listings" | "category_default" | string;
  similarPriceCount: number;
}

export interface TriageBreakdown {
  condition: number;
  spec: number;
  demand: number;
  materialValue: number;
  reuseScore: number;
  materialBonus: number;
  searchCount: number;
  similarActiveCount: number;
  similarSoldCount: number;
}

export interface TriageDiagnosis {
  /** 공유 리포트(비로그인 조회)에는 없다 */
  id?: string;
  status: TriageStatus;
  title: string;
  category?: string;
  materialKey?: string;
  materialLabel?: string;
  conditionGrade?: string;
  specText?: string;
  imageUrls: string[];
  quantity?: number;
  quantityUnit?: string;
  weightKg?: number;
  /** 중량을 입력하지 않아 기본값으로 계산했는지 */
  weightEstimated: boolean;
  locationAddress?: string;
  liquidityScore: number;
  initialScore: number;
  /** 현재 점수 − 최초 점수 */
  scoreDelta: number;
  matchProbability7d: number;
  expectedDays: number;
  breakdown: TriageBreakdown;
  /** 지역 데이터가 부족해 품목 기본값으로 추정했는지 */
  coldStart: boolean;
  analysisMode: "vision" | "vision_cached" | "rule_based" | string;
  dispositionPath: TriagePath;
  pathLabel: string;
  pathReason: string;
  comparison: TriageComparison;
  shareToken: string;
  shareUrl?: string;
  materialId?: string;
  createdAt: string;
}

export interface TriageConvertInput {
  price?: number;
  title?: string;
  description?: string;
  /** 판매자의 경로 재지정 */
  path?: TriagePath;
}

export interface TriageConvertResult {
  diagnosis: TriageDiagnosis;
  materialId: string;
}

export interface HotDemandItem {
  key: string;
  label: string;
  searchCount: number;
  liquidityScore: number;
}

export interface HotDemands {
  scope: "nearby" | "all";
  radiusKm: number;
  items: HotDemandItem[];
  /** 최근 7일 매물 전환 기준 폐기비 회피액 합계 (추정) */
  weeklyDisposalSaved: number;
  weeklyListedCount: number;
}

export interface HotDemandParams {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  minScore?: number;
}
