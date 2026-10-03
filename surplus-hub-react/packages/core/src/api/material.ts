import { apiClient, isNotFoundError, unwrapApiData, unwrapApiMeta } from "./client";
import {
  MaterialCreateInput,
  MaterialUpdateInput,
  MaterialItem,
  MaterialQueryParams,
  MaterialResponse,
  MaterialLikeStatus,
} from "../types";
import { readRecord, readString, normalizeIso, parseNumber, parseOptionalNumber } from "./utils";

const normalizeSort = (sort?: string): "latest" | "price_asc" | "price_desc" => {
  if (!sort) return "latest";

  const sortMap: Record<string, "latest" | "price_asc" | "price_desc"> = {
    latest: "latest",
    price_asc: "price_asc",
    price_desc: "price_desc",
    최신순: "latest",
    낮은가격순: "price_asc",
    높은가격순: "price_desc",
    가격낮은순: "price_asc",
    가격높은순: "price_desc",
    거리순: "latest",
    인기순: "latest",
    distance: "latest",
    popular: "latest",
  };

  return sortMap[sort] ?? "latest";
};

const mapMaterialItem = (raw: unknown): MaterialItem => {
  const item = readRecord(raw);
  const locationObj = readRecord(item.location);
  const sellerObj = readRecord(item.seller);
  const categoryObj = readRecord(item.category);

  const images = Array.isArray(item.images) ? item.images : [];
  const firstImage = images.find((image) => typeof image === "string");

  const location =
    readString(locationObj.address) ||
    readString(item.location as unknown) ||
    readString(item.locationAddress) ||
    "";

  const category =
    readString(categoryObj.name) || readString(item.category as unknown) || "기타";

  const quantity = parseOptionalNumber(item.quantity);
  const locationLat = parseOptionalNumber(
    locationObj.lat ?? item.locationLat ?? item.location_lat
  );
  const locationLng = parseOptionalNumber(
    locationObj.lng ?? item.locationLng ?? item.location_lng
  );

  return {
    id: String(item.id ?? ""),
    title: readString(item.title) || "제목 없는 자재",
    description: readString(item.description) || "",
    price: parseNumber(item.price),
    imageUrl:
      readString(item.imageUrl) ||
      readString(item.thumbnailUrl) ||
      readString(item.thumbnail_url) ||
      (firstImage as string | undefined) ||
      "",
    category,
    location,
    locationLat,
    locationLng,
    quantity,
    quantityUnit: readString(item.quantityUnit ?? item.quantity_unit),
    tradeMethod: readString(item.tradeMethod ?? item.trade_method),
    status: readString(item.status),
    sellerId: String(item.sellerId ?? item.seller_id ?? sellerObj.id ?? ""),
    sellerName: readString(sellerObj.name ?? item.sellerName ?? item.seller_name),
    sellerAvatarUrl:
      readString(sellerObj.avatarUrl) ||
      readString(sellerObj.avatar_url) ||
      readString(sellerObj.profileImageUrl) ||
      readString(sellerObj.profile_image_url) ||
      readString(item.sellerAvatarUrl ?? item.seller_avatar_url),
    likesCount: parseNumber(item.likesCount ?? item.likes_count, 0),
    conditionGrade: readString(item.conditionGrade ?? item.condition_grade),
    createdAt: normalizeIso(item.createdAt ?? item.created_at),
  };
};

export const fetchMaterials = async (
  params: MaterialQueryParams = {}
): Promise<MaterialResponse> => {
  const normalizedSort = normalizeSort(params.sort);

  const response = await apiClient.get("/api/v1/materials/", {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      ...(params.category ? { category: params.category } : {}),
      sort: normalizedSort,
      ...(params.keyword ? { keyword: params.keyword } : {}),
      ...(params.location ? { location: params.location } : {}),
      ...(params.lat !== undefined ? { lat: params.lat } : {}),
      ...(params.lng !== undefined ? { lng: params.lng } : {}),
    },
  });

  const rawItems = unwrapApiData<unknown[]>(response.data);
  const data = Array.isArray(rawItems) ? rawItems.map(mapMaterialItem) : [];

  return {
    data,
    meta: unwrapApiMeta(response.data),
  };
};

export const fetchMaterialById = async (
  id: string
): Promise<MaterialItem | undefined> => {
  if (!id) return undefined;

  try {
    const response = await apiClient.get(`/api/v1/materials/${id}`);
    const rawItem = unwrapApiData<unknown>(response.data);
    return mapMaterialItem(rawItem);
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
};

export const createMaterial = async (
  payload: MaterialCreateInput
): Promise<MaterialItem> => {
  const response = await apiClient.post("/api/v1/materials/", payload);
  const rawItem = unwrapApiData<unknown>(response.data);
  return mapMaterialItem(rawItem);
};

export const fetchMyWishlist = async (
  params: { page?: number; limit?: number } = {}
): Promise<MaterialResponse> => {
  const response = await apiClient.get("/api/v1/users/me/wishlist", {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    },
  });

  const rawItems = unwrapApiData<unknown[]>(response.data);
  const data = Array.isArray(rawItems) ? rawItems.map(mapMaterialItem) : [];

  return {
    data,
    meta: unwrapApiMeta(response.data),
  };
};

export const toggleMaterialLike = async (id: string): Promise<MaterialLikeStatus> => {
  const response = await apiClient.post(`/api/v1/materials/${id}/like`);
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return {
    liked: Boolean(raw.isLiked ?? raw.liked ?? raw.is_liked ?? false),
    likesCount: typeof raw.likesCount === "number" ? raw.likesCount
      : typeof raw.likes_count === "number" ? raw.likes_count
      : 0,
  };
};

export const checkMaterialLike = async (id: string): Promise<MaterialLikeStatus> => {
  const response = await apiClient.get(`/api/v1/materials/${id}/like`);
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return {
    liked: Boolean(raw.isLiked ?? raw.liked ?? raw.is_liked ?? false),
    likesCount: typeof raw.likesCount === "number" ? raw.likesCount
      : typeof raw.likes_count === "number" ? raw.likes_count
      : 0,
  };
};

export const updateMaterial = async (
  id: string,
  payload: MaterialUpdateInput
): Promise<MaterialItem> => {
  const response = await apiClient.put(`/api/v1/materials/${id}`, payload);
  const rawItem = unwrapApiData<unknown>(response.data);
  return mapMaterialItem(rawItem);
};

export const deleteMaterial = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/v1/materials/${id}`);
};
