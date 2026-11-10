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
