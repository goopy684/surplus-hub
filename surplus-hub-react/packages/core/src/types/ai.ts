export interface AiImageAnalysis {
  title: string;
  category: string;
  description: string;
  /** 상 / 중 / 하 (백엔드에서 정규화) */
  condition?: string;
  tags: string[];
  /** 판매자 키워드에서 읽은 수량 ("PVC 파이프 50개" → 50, "개") */
  quantity?: number;
  quantityUnit?: string;
  /** 처분 경로 판별용 Vision 신호 (백엔드 정규화·키워드 보정) */
  materialType?: string;
  damageLevel?: DamageLevel;
  isMixedWaste?: boolean;
  recyclableMaterial?: string;
}

/** 모듈 0 처분 경로 */
export type DisposalRoute = "REUSE" | "RECYCLE" | "SCRAP";
export type DamageLevel = "NONE" | "MINOR" | "SEVERE";

/** 판정 근거 — 유사 매물·체결 건수는 실제 DB 조회 결과 */
export interface AiDisposalEvidence {
  conditionGrade?: string;
  category?: string;
  damageLevel: DamageLevel;
  isMixedWaste: boolean;
  recyclableMaterial?: string;
  similarActiveCount: number;
  similarSoldCount: number;
  completedTradeCount: number;
}

export interface AiDisposalChannel {
  name: string;
  description: string;
  url?: string;
}

export interface AiDisposalEvaluation {
  advisoryId: number;
  recommendedRoute: DisposalRoute;
  selectedRoute: DisposalRoute;
  /** false = 혼합 건설폐기물 — 직거래 재지정 불가 */
  canOverrideToReuse: boolean;
  overrideReason?: string;
  headline: string;
  reasoning: string;
  evidence: AiDisposalEvidence;
  steps: string[];
  channels: AiDisposalChannel[];
}

export interface AiDisposalEvaluateInput {
  title: string;
  category?: string;
  condition?: string;
  tags?: string[];
  materialType?: string;
  damageLevel?: DamageLevel;
  isMixedWaste?: boolean;
  recyclableMaterial?: string;
}

export interface AiDescription {
  description: string;
}

export interface AiPriceSuggestion {
  price: number;
  marketPrice: {
    min: number;
    ideal: number;
    max: number;
    /** 가격 산정에 참고한 유사 매물 수 (실제 검색 결과 건수, 없으면 0) */
    similarCount: number;
  };
  reasoning?: string;
}

export interface AiChatSuggestion {
  suggestions: string[];
}

export interface AiCommunityAnswer {
  answer: string;
}

export interface AiDiscussionSummary {
  summary: string[];
}

export interface AiSearchParams {
  q: string;
  page?: number;
  limit?: number;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  locationLat?: number;
  locationLng?: number;
  radiusKm?: number;
  dateFrom?: string;
  dateTo?: string;
  tradeMethod?: string;
  sortBy?: string;
}

export interface AiSearchResult {
  id: string;
  title: string;
  description?: string;
  price: number;
  category?: string;
  location?: string;
  imageUrl?: string;
  score?: number;
  /** 검색 기준 좌표가 있을 때만 채워짐 */
  distanceKm?: number;
}

export interface AiSearchResponse {
  data: AiSearchResult[];
  total: number;
  page: number;
}

export interface AiSearchSuggestions {
  suggestions: string[];
}

export interface Category {
  id: string | number;
  name: string;
  slug?: string;
}
