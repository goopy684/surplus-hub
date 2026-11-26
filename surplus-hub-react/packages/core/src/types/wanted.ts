// 구매 요청(구해요) — 백엔드 /api/v1/wanted 와 1:1
import { MATERIAL_CATEGORIES } from "../constants";
import { MaterialItem } from "./material";

/** EXPIRED는 응답 전용 — 만료된 OPEN을 서버가 바꿔 내려준다 */
export type WantedStatus = "OPEN" | "CLOSED" | "HIDDEN" | "EXPIRED";

export const WANTED_RADIUS_OPTIONS_KM = [5, 10, 30, 50, 100] as const;
export const WANTED_EXPIRY_OPTIONS_DAYS = [7, 30, 90] as const;

export interface WantedRequester {
  id: string;
  name?: string;
  avatarUrl?: string;
  trustLevel?: number;
}

export interface Wanted {
  id: string;
  title: string;
  description?: string;
  category: string;
  quantity?: number;
  quantityUnit?: string;
  budgetMax?: number;
  locationAddress?: string;
  radiusKm: number;
  status: WantedStatus;
  expiresAt: string;
  createdAt: string;
  requester: WantedRequester;
  /** 상세 조회에만 채워진다 (목록은 빈 배열) */
  matches: MaterialItem[];
}

export interface WantedCreateInput {
  title: string;
  description?: string;
  category: string;
  quantity?: number;
  quantityUnit?: string;
  budgetMax?: number;
  locationAddress: string;
  lat: number;
  lng: number;
  radiusKm?: number;
  expiresInDays?: number;
}

export interface WantedListParams {
  category?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  cursor?: number;
  limit?: number;
}

export interface WantedListResponse {
  data: Wanted[];
  nextCursor?: number;
  hasMore: boolean;
}

/** "수량 20 m · 예산 300,000원 이하" — 값이 있는 항목만 (웹·모바일 목록·상세 공용) */
export const formatWantedSpec = (wanted: Pick<Wanted, "quantity" | "quantityUnit" | "budgetMax">): string =>
  [
    wanted.quantity ? `수량 ${wanted.quantity.toLocaleString()}${wanted.quantityUnit ? ` ${wanted.quantityUnit}` : ""}` : null,
    wanted.budgetMax === 0 ? "무상 희망" : wanted.budgetMax ? `예산 ${wanted.budgetMax.toLocaleString()}원 이하` : null,
  ]
    .filter(Boolean)
    .join(" · ");

const inRange = (value: number | undefined, min: number, max: number) =>
  value === undefined || (Number.isInteger(value) && value >= min && value <= max);

/** 백엔드 POST /wanted 검증(§3.6)과 같은 한도. 첫 번째 오류 문구만 돌려준다 */
export const validateWantedInput = (input: Partial<WantedCreateInput>): string | null => {
  const title = input.title?.trim() ?? "";
  if (title.length < 2 || title.length > 100) return "제목은 2~100자로 입력해주세요.";
  if (!input.category || !(MATERIAL_CATEGORIES as readonly string[]).includes(input.category)) {
    return "품목을 골라주세요.";
  }
  if ((input.description?.length ?? 0) > 2000) return "설명은 2,000자까지 입력할 수 있습니다.";
  if (!inRange(input.quantity, 0, 1_000_000)) return "수량은 0~1,000,000 사이 정수로 입력해주세요.";
  if ((input.quantityUnit?.length ?? 0) > 20) return "단위는 20자까지 입력할 수 있습니다.";
  if (!inRange(input.budgetMax, 0, 2_000_000_000)) return "예산은 20억 원 이하로 입력해주세요.";
  const address = input.locationAddress?.trim() ?? "";
  if (!address || address.length > 200) return "지역을 입력해주세요.";
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return "현재 위치를 추가해주세요. 근처 매물을 찾는 기준이 됩니다.";
  }
  if (!inRange(input.radiusKm, 5, 100)) return "반경은 5~100km로 골라주세요.";
  if (!inRange(input.expiresInDays, 1, 90)) return "마감 기간은 1~90일로 골라주세요.";
  return null;
};
