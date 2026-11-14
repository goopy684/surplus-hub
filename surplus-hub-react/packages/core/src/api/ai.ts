import { apiClient, unwrapApiData } from "./client";
import {
  AiImageAnalysis,
  AiDisposalChannel,
  AiDisposalEvaluateInput,
  AiDisposalEvaluation,
  DamageLevel,
  DisposalRoute,
  AiDescription,
  AiPriceSuggestion,
  AiChatSuggestion,
  AiCommunityAnswer,
  AiDiscussionSummary,
  AiSearchParams,
  AiSearchResponse,
  AiSearchResult,
  AiSearchSuggestions,
  Category,
} from "../types";
import { readRecord, readString, readNumber } from "./utils";

export const analyzeImage = async (
  imageUrl: string,
  keyword?: string
): Promise<AiImageAnalysis> => {
  const response = await apiClient.post("/api/v1/ai/analyze-image", {
    imageUrl,
    keyword,
  });
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return {
    title: readString(raw.titleSuggestion ?? raw.title) || "제목 없음",
    category: readString(raw.category) || "기타",
    description: readString(raw.description) || "",
    condition: readString(raw.condition),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
    quantity: typeof raw.quantity === "number" && raw.quantity > 0 ? raw.quantity : undefined,
    quantityUnit: readString(raw.quantityUnit),
    materialType: readString(raw.materialType),
    damageLevel: readDamageLevel(raw.damageLevel),
    isMixedWaste: raw.isMixedWaste === true,
    recyclableMaterial: readString(raw.recyclableMaterial),
  };
};

const DISPOSAL_ROUTES: DisposalRoute[] = ["REUSE", "RECYCLE", "SCRAP"];

const readDamageLevel = (value: unknown): DamageLevel =>
  value === "MINOR" || value === "SEVERE" ? value : "NONE";

const readRoute = (value: unknown): DisposalRoute =>
  DISPOSAL_ROUTES.includes(value as DisposalRoute) ? (value as DisposalRoute) : "REUSE";

const mapDisposalEvaluation = (data: unknown): AiDisposalEvaluation => {
  const raw = readRecord(data);
  const ev = readRecord(raw.evidence);
  return {
    advisoryId: readNumber(raw.advisoryId),
    recommendedRoute: readRoute(raw.recommendedRoute),
    selectedRoute: readRoute(raw.selectedRoute),
    canOverrideToReuse: raw.canOverrideToReuse !== false,
    overrideReason: readString(raw.overrideReason),
    headline: readString(raw.headline) || "",
    reasoning: readString(raw.reasoning) || "",
    evidence: {
      conditionGrade: readString(ev.conditionGrade),
      category: readString(ev.category),
      damageLevel: readDamageLevel(ev.damageLevel),
      isMixedWaste: ev.isMixedWaste === true,
      recyclableMaterial: readString(ev.recyclableMaterial),
      similarActiveCount: readNumber(ev.similarActiveCount),
      similarSoldCount: readNumber(ev.similarSoldCount),
      completedTradeCount: readNumber(ev.completedTradeCount),
    },
    steps: Array.isArray(raw.steps) ? raw.steps.filter((t): t is string => typeof t === "string") : [],
    channels: Array.isArray(raw.channels)
      ? raw.channels.map((c): AiDisposalChannel => {
          const r = readRecord(c);
          return { name: readString(r.name) || "", description: readString(r.description) || "", url: readString(r.url) };
        })
      : [],
  };
};

/** 모듈 0: 판매글·시세 생성 전에 처분 경로(REUSE/RECYCLE/SCRAP)를 판정하고 기록한다 */
export const evaluateDisposal = async (input: AiDisposalEvaluateInput): Promise<AiDisposalEvaluation> => {
  const response = await apiClient.post("/api/v1/ai/evaluate-disposal", input);
  return mapDisposalEvaluation(unwrapApiData<unknown>(response.data));
};

/** 판매자 경로 재지정. SCRAP → REUSE는 overrideReason 필수, 혼합 폐기물은 서버가 422로 거부 */
export const overrideDisposalRoute = async (
  advisoryId: number,
  selectedRoute: DisposalRoute,
  overrideReason?: string
): Promise<AiDisposalEvaluation> => {
  const response = await apiClient.patch(`/api/v1/ai/disposal-advisories/${advisoryId}`, {
    selectedRoute,
    overrideReason,
  });
  return mapDisposalEvaluation(unwrapApiData<unknown>(response.data));
};

export const generateDescription = async (
  title: string,
  category: string,
  imageUrl?: string,
  spec: { tags?: string[]; condition?: string; quantity?: number; quantityUnit?: string } = {}
): Promise<AiDescription> => {
  const response = await apiClient.post("/api/v1/ai/generate-description", {
    title,
    category,
    imageUrl,
    ...spec,
  });
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return {
    description: readString(raw.description) || "",
  };
};

export const suggestPrice = async (
  title: string,
  category: string,
  description?: string,
  spec: { condition?: string; quantity?: number } = {}
): Promise<AiPriceSuggestion> => {
  const response = await apiClient.post("/api/v1/ai/suggest-price", {
    title,
    category,
    description,
    ...spec,
  });
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return {
    price: readNumber(raw.suggestedPrice ?? raw.price ?? raw.suggested_price, 0),
    marketPrice: {
      min: readNumber(raw.priceRangeLow ?? raw.price_range_low, 0),
      ideal: readNumber(raw.suggestedPrice ?? raw.suggested_price, 0),
      max: readNumber(raw.priceRangeHigh ?? raw.price_range_high, 0),
      similarCount: readNumber(raw.similarCount ?? raw.similar_count, 0),
    },
    reasoning: readString(raw.reasoning),
  };
};

export const getChatSuggestions = async (
  roomId: string,
  messages: { content: string; senderId: string }[]
): Promise<AiChatSuggestion> => {
  const response = await apiClient.post("/api/v1/ai/chat-suggestions", {
    roomId,
    messages: messages.slice(-10),
  });
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions.filter((s: unknown) => typeof s === "string")
    : [];
  return { suggestions };
};

export const getCommunityAnswer = async (
  postId: string,
  title: string,
  content: string
): Promise<AiCommunityAnswer> => {
  const response = await apiClient.post("/api/v1/ai/community-answer", {
    postId,
    title,
    content,
  });
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return {
    answer: readString(raw.answer) || "",
  };
};

export const summarizeDiscussion = async (
  postId: string,
  comments: { author: string; content: string }[]
): Promise<AiDiscussionSummary> => {
  const response = await apiClient.post("/api/v1/ai/summarize-discussion", {
    postId,
    comments,
  });
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  const summaryArray = Array.isArray(raw.summary)
    ? raw.summary.filter((s: unknown) => typeof s === "string")
    : typeof raw.summary === "string"
    ? [raw.summary, ...(Array.isArray(raw.keyPoints) ? raw.keyPoints : [])].filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];
  return { summary: summaryArray };
};

const mapSearchResult = (raw: unknown): AiSearchResult => {
  const item = readRecord(raw);
  return {
    id: String(item.id ?? ""),
    title: readString(item.title) || "제목 없음",
    description: readString(item.description),
    price: readNumber(item.price),
    category: readString(item.category),
    // 백엔드는 location을 {address, lat, lng} 객체로 준다
    location: readString(item.location) ?? readString(readRecord(item.location).address),
    imageUrl: readString(item.thumbnailUrl ?? item.imageUrl ?? item.image_url),
    score: typeof item.score === "number" ? item.score : undefined,
    distanceKm: typeof item.distanceKm === "number" ? item.distanceKm : undefined,
  };
};

export const aiSearch = async (params: AiSearchParams): Promise<AiSearchResponse> => {
  const response = await apiClient.get("/api/v1/ai/search", { params });
  const raw = readRecord(unwrapApiData<unknown>(response.data));

  // 백엔드 응답이 배열인 경우와 {data, total, page} 형태 모두 처리
  let items: AiSearchResult[] = [];
  if (Array.isArray(raw.data)) {
    items = raw.data.map(mapSearchResult);
  } else if (Array.isArray(unwrapApiData<unknown>(response.data))) {
    items = (unwrapApiData<unknown[]>(response.data) as unknown[]).map(mapSearchResult);
  }

  return {
    data: items,
    total: readNumber(raw.total, items.length),
    page: readNumber(raw.page, params.page ?? 1),
  };
};

export const getSearchSuggestions = async (
  keyword: string,
  limit = 5
): Promise<AiSearchSuggestions> => {
  if (keyword.length < 2) return { suggestions: [] };
  const response = await apiClient.get("/api/v1/ai/search/suggestions", {
    params: { q: keyword, limit },
  });
  const raw = unwrapApiData<unknown>(response.data);
  const suggestions = Array.isArray(raw)
    ? (raw as unknown[]).map((s) => typeof s === "string" ? s : readString(readRecord(s).text) ?? "").filter(Boolean)
    : Array.isArray(readRecord(raw).suggestions)
    ? (readRecord(raw).suggestions as unknown[]).map((s) => typeof s === "string" ? s : readString(readRecord(s).text) ?? "").filter(Boolean)
    : [];
  return { suggestions };
};

export const translateText = async (
  text: string,
  targetLanguage: string = "en"
): Promise<string> => {
  const response = await apiClient.post("/api/v1/ai/translate", {
    text,
    sourceLanguage: "auto",
    targetLanguage,
  });
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return readString(raw.translatedText) ?? text;
};

export const fetchCategories = async (): Promise<Category[]> => {
  const response = await apiClient.get("/api/v1/categories/");
  const raw = unwrapApiData<unknown>(response.data);

  if (Array.isArray(raw)) {
    return (raw as unknown[]).map((item) => {
      const r = readRecord(item);
      return {
        id: String(r.id ?? ""),
        name: readString(r.name) || "기타",
        slug: readString(r.slug),
      };
    });
  }
  return [];
};
