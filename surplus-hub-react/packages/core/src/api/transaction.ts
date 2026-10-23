import { apiClient, unwrapApiData, unwrapApiMeta } from "./client";
import { Transaction, TransactionCreate, TransactionResponse } from "../types";
import { readRecord, readString, readNumber, normalizeIso } from "./utils";

const mapTransaction = (raw: unknown): Transaction => {
  const item = readRecord(raw);

  return {
    id: String(item.id ?? ""),
    materialId: String(item.materialId ?? item.material_id ?? ""),
    materialTitle: readString(item.materialTitle ?? item.material_title),
    sellerId: String(item.sellerId ?? item.seller_id ?? ""),
    sellerName: readString(item.sellerName ?? item.seller_name),
    buyerId: String(item.buyerId ?? item.buyer_id ?? ""),
    buyerName: readString(item.buyerName ?? item.buyer_name),
    price: readNumber(item.price),
    quantity: typeof item.quantity === "number" ? item.quantity : undefined,
    status: readString(item.status) || "PENDING",
    note: readString(item.note),
    createdAt: normalizeIso(item.createdAt ?? item.created_at),
    confirmedAt: readString(item.confirmedAt ?? item.confirmed_at),
    completedAt: readString(item.completedAt ?? item.completed_at),
  };
};

export const fetchMyTransactions = async (
  params: { page?: number; limit?: number; offset?: number; role?: "seller" | "buyer" } = {}
): Promise<TransactionResponse> => {
  const response = await apiClient.get("/api/v1/transactions/", {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      ...(params.offset !== undefined && { offset: params.offset }),
      ...(params.role !== undefined && { role: params.role }),
    },
  });

  const rawItems = unwrapApiData<unknown[]>(response.data);
  const data = Array.isArray(rawItems) ? rawItems.map(mapTransaction) : [];

  return {
    data,
    meta: unwrapApiMeta(response.data),
  };
};

export const createTransaction = async (body: TransactionCreate): Promise<Transaction> => {
  const response = await apiClient.post("/api/v1/transactions/", body);
  return mapTransaction(unwrapApiData<unknown>(response.data));
};

export const fetchTransactionDetail = async (transactionId: string | number): Promise<Transaction> => {
  const id = Number(transactionId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Invalid transaction ID: ${transactionId}`);
  }
  const response = await apiClient.get(`/api/v1/transactions/${id}`);
  return mapTransaction(unwrapApiData<unknown>(response.data));
};

export const confirmTransaction = async (transactionId: string | number): Promise<Transaction> => {
  const id = Number(transactionId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Invalid transaction ID: ${transactionId}`);
  }
  const response = await apiClient.patch(`/api/v1/transactions/${id}/confirm`);
  return mapTransaction(unwrapApiData<unknown>(response.data));
};

export const completeTransaction = async (transactionId: string | number): Promise<Transaction> => {
  const id = Number(transactionId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Invalid transaction ID: ${transactionId}`);
  }
  const response = await apiClient.patch(`/api/v1/transactions/${id}/complete`);
  return mapTransaction(unwrapApiData<unknown>(response.data));
};
