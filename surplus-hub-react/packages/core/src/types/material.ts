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
  status?: string;
  buyerId?: number;
}

export interface MaterialLikeStatus {
  liked: boolean;
  likesCount: number;
}
