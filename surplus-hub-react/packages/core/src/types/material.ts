import type { DisposalRoute } from "./ai";

export interface MaterialItem {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
  location: string;
  locationLat?: number;
  locationLng?: number;
  quantity?: number;
  quantityUnit?: string;
  tradeMethod?: string;
  status?: string;
  conditionGrade?: string;
  sellerId: string;
  sellerName?: string;
  sellerAvatarUrl?: string;
  sellerTrustLevel?: number;
  likesCount?: number;
  createdAt: string;
}

export interface MaterialLocation {
  address: string;
  lat?: number;
  lng?: number;
}

export interface MaterialCreateInput {
  title: string;
  description: string;
  price: number;
  location: MaterialLocation;
  quantity?: number;
  quantityUnit?: string;
  tradeMethod?: string;
  category?: string;
  conditionGrade?: string;
  status?: string;
  photoUrls?: string[];
  /** 모듈 0 처분 경로 판정 id — 전달하면 서버가 REUSE 확정 여부를 다시 검증한다 */
  advisoryId?: number;
  selectedRoute?: DisposalRoute;
  overrideReason?: string;
}

export interface PaginationMeta {
  totalCount?: number;
  page?: number;
  limit?: number;
  hasNextPage?: boolean;
  totalPages?: number;
  [key: string]: unknown;
}

export interface MaterialResponse {
  data: MaterialItem[];
  meta?: PaginationMeta;
  nextCursor?: string;
}

export interface MaterialQueryParams {
  page?: number;
  limit?: number;
  category?: string;
  sort?: "latest" | "price_asc" | "price_desc" | string;
  keyword?: string;
  location?: string;
  lat?: number;
  lng?: number;
}

export interface MaterialUpdateInput {
  title: string;
  description: string;
  price: number;
  location: MaterialLocation;
  quantity?: number;
  quantityUnit?: string;
  tradeMethod?: string;
  category?: string;
  conditionGrade?: string;
  status?: string;
  buyerId?: number;
  photoUrls?: string[];
}

export interface MaterialLikeStatus {
  liked: boolean;
  likesCount: number;
}
