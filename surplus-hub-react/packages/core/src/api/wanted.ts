import { apiClient, unwrapApiData, unwrapApiMeta } from "./client";
import { mapMaterialItem } from "./material";
import { Wanted, WantedCreateInput, WantedListParams, WantedListResponse, WantedStatus } from "../types";
import { normalizeIso, parseOptionalNumber, readNumber, readRecord, readString } from "./utils";

const BASE = "/api/v1/wanted";

const readStatus = (value: unknown): WantedStatus =>
  value === "CLOSED" || value === "HIDDEN" || value === "EXPIRED" ? value : "OPEN";

export const mapWanted = (raw: unknown): Wanted => {
  const item = readRecord(raw);
  const location = readRecord(item.location);
  const requester = readRecord(item.requester);

  return {
    id: String(item.id ?? ""),
    title: readString(item.title) || "제목 없는 요청",
    description: readString(item.description),
    category: readString(item.category) || "기타",
    quantity: parseOptionalNumber(item.quantity),
    quantityUnit: readString(item.quantityUnit),
    budgetMax: parseOptionalNumber(item.budgetMax),
    locationAddress: readString(location.address),
    radiusKm: readNumber(item.radiusKm, 30),
    status: readStatus(item.status),
    expiresAt: normalizeIso(item.expiresAt),
    createdAt: normalizeIso(item.createdAt),
    requester: {
      id: requester.id === undefined || requester.id === null ? "" : String(requester.id),
      name: readString(requester.name),
      avatarUrl: readString(requester.avatarUrl),
      trustLevel: parseOptionalNumber(requester.trustLevel),
    },
    matches: Array.isArray(item.matches) ? item.matches.map(mapMaterialItem) : [],
  };
};

const mapWantedArray = (raw: unknown): Wanted[] => (Array.isArray(raw) ? raw.map(mapWanted) : []);

export const fetchWantedList = async (params: WantedListParams = {}): Promise<WantedListResponse> => {
  const response = await apiClient.get(BASE, { params });
  const meta = readRecord(unwrapApiMeta(response.data));
  return {
    data: mapWantedArray(unwrapApiData<unknown>(response.data)),
    nextCursor: parseOptionalNumber(meta.nextCursor),
    hasMore: meta.hasMore === true,
  };
};

export const fetchMyWanted = async (): Promise<Wanted[]> => {
  const response = await apiClient.get(`${BASE}/me`);
  return mapWantedArray(unwrapApiData<unknown>(response.data));
};

export const fetchWanted = async (id: string): Promise<Wanted> => {
  const response = await apiClient.get(`${BASE}/${id}`);
  return mapWanted(unwrapApiData<unknown>(response.data));
};

export const createWanted = async (input: WantedCreateInput): Promise<Wanted> => {
  const response = await apiClient.post(BASE, input);
  return mapWanted(unwrapApiData<unknown>(response.data));
};

export const closeWanted = async (id: string): Promise<Wanted> => {
  const response = await apiClient.post(`${BASE}/${id}/close`);
  return mapWanted(unwrapApiData<unknown>(response.data));
};
