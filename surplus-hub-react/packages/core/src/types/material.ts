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
  /** 거래 전 AI 진단을 거쳐 등록된 매물만 값이 있다 */
  liquidityScore?: number;
  /** A(직거래) / B(소재 매입) / C(중량 일괄) */
  dispositionPath?: string;
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
  /** 미지정 = 메인 마켓(A). B = 소재 매입 호가, C = 중량 일괄 처분 트랙 */
  track?: "B" | "C";
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
