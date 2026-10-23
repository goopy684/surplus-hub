import { PaginationMeta } from "./material";

export interface TransactionCreate {
  material_id: number;
  /** 분할 구매 수량. 생략하면 매물 전체 수량. */
  quantity?: number;
  note?: string;
}

export interface Transaction {
  id: string;
  materialId: string;
  materialTitle?: string;
  sellerId: string;
  sellerName?: string;
  buyerId: string;
  buyerName?: string;
  price: number;
  quantity?: number;
  status: string;
  note?: string;
  createdAt: string;
  confirmedAt?: string;
  completedAt?: string;
}

export interface TransactionResponse {
  data: Transaction[];
  meta?: PaginationMeta;
}
