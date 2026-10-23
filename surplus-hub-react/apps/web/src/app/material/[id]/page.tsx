"use client";

import {
  calcSplitPrice,
  TRADE_METHOD_LABELS,
  useCreateChatRoom,
  useCreateTransaction,
  useCurrentUser,
  useDeleteMaterial,
  useMaterialDetail,
  useMaterialLikeStatus,
  useToggleMaterialLike,
} from "@repo/core";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReportModal } from "../../../components/ReportModal";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "판매중",
  RESERVED: "예약중",
  SOLD: "거래완료",
  reserved: "예약중",
  sold: "거래완료",
};

const CONDITION_GRADE_STYLES: Record<string, { label: string; className: string }> = {
  상: { label: "상 (양호)", className: "bg-olive-bg text-olive-tx border border-olive-bd" },
  중: { label: "중 (보통)", className: "bg-card text-muted-foreground border border-border" },
  하: { label: "하 (사용감 있음)", className: "bg-card text-muted-foreground border border-border" },
};

const formatTradeMethod = (tradeMethod?: string): string =>
  tradeMethod ? TRADE_METHOD_LABELS[tradeMethod] ?? tradeMethod : "정보 없음";

const formatStatus = (status?: string): string =>
  status ? STATUS_LABELS[status] ?? status : "정보 없음";

const formatQuantity = (quantity?: number, unit?: string): string =>
  quantity && quantity > 0 ? `${quantity}${unit ? ` ${unit}` : ""}` : "정보 없음";

export default function MaterialDetailPage({ params }: { params: { id: string } }) {
  const { data: item, isLoading } = useMaterialDetail(params.id);
  const { data: currentUser } = useCurrentUser();
  const { data: likeStatus } = useMaterialLikeStatus(params.id);
  const { mutate: toggleLike, isPending: isTogglingLike } = useToggleMaterialLike(params.id);
  const { mutateAsync: createChatRoom, isPending: isCreatingRoom } = useCreateChatRoom();
  const { mutate: deleteMaterial, isPending: isDeletingMaterial } = useDeleteMaterial();
  const {
    mutate: createTransaction,
    isPending: isRequestingPurchase,
    isSuccess: isPurchaseRequested,
    error: purchaseError,
  } = useCreateTransaction();
  const [purchaseQty, setPurchaseQty] = useState<number | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const router = useRouter();

  const isOwner = !!currentUser && !!item && currentUser.id === item.sellerId;
  const isLiked = likeStatus?.liked ?? false;
  const likesCount = likeStatus?.likesCount ?? item?.likesCount ?? 0;

  const handleStartChat = async () => {
    if (!item) {
      router.push("/chat");
      return;
    }

    const materialId = Number(item.id);
    const sellerId = Number(item.sellerId);

    if (!Number.isFinite(materialId) || !Number.isFinite(sellerId) || materialId <= 0 || sellerId <= 0) {
      router.push("/chat");
      return;
    }

    try {
      const room = await createChatRoom({ materialId, sellerId });
      if (room.id) {
        router.push(`/chat/${room.id}`);
        return;
      }
    } catch {
      // Fall back to the chat list when room creation fails.
    }

    router.push("/chat");
  };

  const handlePurchaseRequest = (quantity: number) => {
    // 비로그인 시 채팅 CTA처럼 로그인 게이트가 있는 화면으로 보낸다
    if (!currentUser) {
      router.push("/sign-in");
      return;
    }
    createTransaction({
      material_id: Number(params.id),
      ...(item?.quantity ? { quantity } : {}),
    });
  };

  const handleDelete = () => {
    if (!confirm("정말로 이 자재를 삭제하시겠습니까?")) return;
    deleteMaterial(params.id, {
      onSuccess: () => router.push("/"),
      onError: () => alert("자재 삭제에 실패했습니다. 다시 시도해주세요."),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!item) {
    return <div className="text-center p-8 text-muted-foreground">자재를 찾을 수 없습니다.</div>;
  }

  const createdAt = new Date(item.createdAt).toLocaleDateString();
  const sellerDisplayName = item.sellerName || `판매자 #${item.sellerId}`;
  const rawLocation = item.location;
  const locationLabel = !rawLocation || /^\s*Lat\s*:/i.test(rawLocation) || /Lng\s*:/i.test(rawLocation) ? "위치 정보 없음" : rawLocation;
  const quantityLabel = formatQuantity(item.quantity, item.quantityUnit);
  const statusLabel = formatStatus(item.status);
  const tradeMethodLabel = formatTradeMethod(item.tradeMethod);
  // 예약중·판매완료 등은 서버가 409로 거절하므로 판매중일 때만 구매 요청을 보여준다
  const isOnSale = !item.status || item.status.toUpperCase() === "ACTIVE";
  const totalQty = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const qty = Math.min(purchaseQty ?? totalQty, totalQty);
  const purchaseDetail = (purchaseError as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-surface pb-28">
      {/* Floating header — 사진 위 원형 버튼 */}
      <div className="relative">
      <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 p-3.5">
        <Link href="/" aria-label="뒤로가기" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-foreground shadow-card transition-colors active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden="true" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="sr-only">{item.title}</h1>
        <span className="flex-1" />
        {isOwner ? (
          <div className="flex h-11 items-center gap-1 rounded-full bg-surface px-2 shadow-card">
            <Link
              href={`/material/${params.id}/edit`}
              className="flex h-9 items-center rounded-full px-3 text-sm font-semibold text-foreground transition-colors active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              수정
            </Link>
            <button
              onClick={handleDelete}
              disabled={isDeletingMaterial}
              className="flex h-9 items-center rounded-full px-3 text-sm font-semibold text-destructive transition-colors active:bg-field disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              삭제
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              aria-label="자재 신고"
              className="flex h-11 items-center rounded-full bg-surface px-3.5 text-xs font-semibold text-muted-foreground shadow-card transition-colors hover:text-destructive active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              신고
            </button>
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-foreground shadow-card transition-colors active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="공유">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        targetType="material"
        targetId={Number(item.id) || 0}
        targetLabel="자재"
      />

        {/* Image */}
        <div className="relative h-[340px] bg-field md:rounded-b-card md:overflow-hidden">
          {item.imageUrl ? (
            <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-field text-ink-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-16 h-16">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
          )}
        </div>

      </div>

      {/* Main Content — 사진 위로 올라오는 시트 */}
      <div className="relative z-10 -mt-5 rounded-t-[20px] bg-surface md:mt-0">
        {/* Seller Profile */}
        <div className="mx-5 flex items-center justify-between border-b border-line-2 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-accent text-primary">
              {item.sellerAvatarUrl ? (
                /* Avatars come from heterogeneous external sources (DiceBear SVGs,
                   Google, S3, user uploads). Skip next/image optimization so the
                   optimizer's upstream content-type validation can't 400 on
                   generator-served SVGs; avatars are tiny so optimization is moot. */
                <Image src={item.sellerAvatarUrl} alt={sellerDisplayName} fill unoptimized className="object-cover" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0" />
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-[15px] font-bold text-foreground">{sellerDisplayName}</h3>
                {(item.sellerTrustLevel ?? 0) >= 80 && (
                  <span
                    data-testid="seller-verified-badge"
                    className="inline-flex items-center gap-1 rounded-chip border border-olive-bd bg-olive-bg px-2 py-0.5 text-[11px] font-bold text-olive-tx"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3 w-3">
                      <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                    </svg>
                    사업자 인증
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
                <span>{locationLabel}</span>
                <span>•</span>
                {item.sellerId ? (
                  <Link
                    href={`/profile/reviews?userId=${encodeURIComponent(item.sellerId)}&name=${encodeURIComponent(sellerDisplayName)}`}
                    data-testid="seller-reviews-link"
                    className="font-semibold text-primary hover:underline"
                  >
                    거래 후기 보기
                  </Link>
                ) : (
                  <span className="font-medium">판매자 정보</span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>판매자 ID</p>
            <p className="num font-semibold text-foreground">{item.sellerId || "-"}</p>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5">
          {/* Material Info */}
          <div>
            <div className="mb-1.5 flex text-[12.5px] text-muted-foreground">
              <span>{item.category}</span>
              <span className="mx-2">•</span>
              <span className="tabular">{createdAt}</span>
            </div>
            <h2 className="mb-4 text-[22px] font-extrabold leading-[1.3] tracking-[-0.6px] text-foreground">{item.title}</h2>
            <p className="whitespace-pre-wrap text-[15px] leading-[1.65] text-foreground/90">
              {item.description}
            </p>
          </div>

          {/* AI Analysis */}
          <div className="rounded-card bg-field px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-[18px] w-[18px] text-primary">
                <path d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813a3.75 3.75 0 0 0 2.576-2.576l.813-2.846A.75.75 0 0 1 9 4.5Z" />
              </svg>
              <span className="text-sm font-bold text-foreground">AI 분석</span>
            </div>
            <p className="text-[13.5px] leading-[1.55] text-foreground/80">
              등록 카테고리는 <span className="font-semibold text-foreground">{item.category || "기타"}</span>이며 등록일은{" "}
              <span className="font-semibold text-foreground tabular">{createdAt}</span>입니다. 상세 조건은 채팅으로 확인해 주세요.
            </p>
          </div>

          <div className="rounded-card border border-line-2 px-4 py-1">
            <div className="flex min-h-[44px] items-center justify-between border-b border-line-2 text-sm">
              <span className="text-muted-foreground">상태</span>
              <span className="font-semibold text-foreground">{statusLabel}</span>
            </div>
            <div className="flex min-h-[44px] items-center justify-between border-b border-line-2 text-sm">
              <span className="text-muted-foreground">카테고리</span>
              <span className="font-semibold text-foreground">{item.category || "기타"}</span>
            </div>
            <div className="flex min-h-[44px] items-center justify-between border-b border-line-2 text-sm">
              <span className="text-muted-foreground">수량</span>
              <span className="font-semibold text-foreground tabular">{quantityLabel}</span>
            </div>
            <div className="flex min-h-[44px] items-center justify-between border-b border-line-2 text-sm">
              <span className="text-muted-foreground">거래 방식</span>
              <span className="font-semibold text-foreground">{tradeMethodLabel}</span>
            </div>
            <div className="flex min-h-[44px] items-center justify-between gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">위치</span>
              <div className="flex items-center gap-2 text-right">
                <span className="font-semibold text-foreground">{locationLabel}</span>
                {item.location && (
                  <a
                    href={
                      item.locationLat !== undefined && item.locationLng !== undefined
                        ? `https://map.kakao.com/link/map/${encodeURIComponent(locationLabel)},${item.locationLat},${item.locationLng}`
                        : `https://map.kakao.com/?q=${encodeURIComponent(locationLabel)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="material-map-link"
                    className="shrink-0 rounded-chip border border-line bg-field px-2 py-0.5 text-xs font-bold text-primary transition-colors hover:bg-accent"
                  >
                    지도 보기
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Purchase Request — 분할 구매 */}
          {/* 전체 수량 요청 후 매물이 예약중으로 바뀌어도 내 요청 확인 문구는 남긴다 */}
          {!isOwner && (isOnSale || isPurchaseRequested) && (
            <div className="rounded-card border border-line-2 px-4 py-4">
              <h3 className="mb-3 font-bold text-foreground">구매 요청</h3>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="수량 줄이기"
                    onClick={() => setPurchaseQty(Math.max(1, qty - 1))}
                    disabled={qty <= 1}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-lg font-bold text-foreground transition-colors hover:bg-field active:bg-field disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    −
                  </button>
                  <span className="num min-w-[3ch] text-center text-base font-bold text-foreground" aria-label="구매 수량">
                    {qty}
                  </span>
                  <button
                    type="button"
                    aria-label="수량 늘리기"
                    onClick={() => setPurchaseQty(Math.min(totalQty, qty + 1))}
                    disabled={qty >= totalQty}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-lg font-bold text-foreground transition-colors hover:bg-field active:bg-field disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    +
                  </button>
                  {item.quantityUnit && <span className="text-sm text-muted-foreground">{item.quantityUnit}</span>}
                </div>
                <p className="font-bold text-foreground">
                  <span className="num text-lg">{calcSplitPrice(item.price, totalQty, qty).toLocaleString()}</span>
                  <span className="text-sm font-semibold">원</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => handlePurchaseRequest(qty)}
                disabled={isRequestingPurchase || isPurchaseRequested}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-btn bg-accent text-[15px] font-bold text-accent-foreground transition-colors hover:bg-primary/15 active:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {isRequestingPurchase ? "요청 중..." : "구매 요청"}
              </button>
              {isPurchaseRequested && (
                <p className="mt-2 text-sm text-foreground">
                  구매 요청을 보냈습니다.{" "}
                  <Link href="/profile/purchases" className="font-semibold text-primary underline">
                    구매 내역 보기
                  </Link>
                </p>
              )}
              {purchaseError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {typeof purchaseDetail === "string" ? purchaseDetail : "구매 요청에 실패했습니다. 다시 시도해주세요."}
                </p>
              )}
            </div>
          )}

          {/* Location Info */}
          <div>
            <h3 className="font-bold text-foreground mb-3">거래 위치</h3>
            <div className="flex h-40 items-center justify-center rounded-card bg-field text-ink-3">
              <div className="text-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-8 h-8 mx-auto mb-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span className="text-sm">지도 연동 준비 중</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              {locationLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-line-2 bg-surface pb-safe">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2.5 px-4 py-3 sm:gap-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => toggleLike(undefined, {
              onError: () => alert("좋아요 처리에 실패했습니다. 다시 시도해주세요."),
            })}
            disabled={isTogglingLike}
            aria-pressed={isLiked}
            className={`flex min-h-[44px] min-w-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-btn transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isLiked ? "text-primary" : "text-foreground"}`}
          >
            {isLiked ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
              </svg>
            )}
            <span className="whitespace-nowrap text-xs tabular">
              관심 {likesCount > 0 ? likesCount : ""}
            </span>
          </button>
          <div className="h-9 w-px shrink-0 bg-line-2"></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-none">
              <p className="shrink-0 font-bold text-foreground">
                <span className="num text-lg sm:text-xl">{item.price.toLocaleString()}</span>
                <span className="text-sm font-semibold">원</span>
              </p>
              {(() => {
                const grade = item.conditionGrade;
                const style = grade ? CONDITION_GRADE_STYLES[grade] : undefined;
                return style ? (
                  <span className={`shrink-0 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-chip ${style.className}`}>
                    {style.label}
                  </span>
                ) : null;
              })()}
            </div>
            <p className="mt-0.5 truncate text-[11.5px] font-medium text-muted-foreground">거래 조건은 판매자와 협의</p>
          </div>
        </div>
        {isOwner ? (
          <Link
            href={`/material/${params.id}/edit`}
            className="flex h-[48px] sm:h-[52px] shrink-0 items-center whitespace-nowrap rounded-btn bg-primary px-4 sm:px-6 text-sm sm:text-[15.5px] font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            수정하기
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleStartChat}
            disabled={isCreatingRoom}
            className="flex h-[48px] sm:h-[52px] shrink-0 items-center whitespace-nowrap rounded-btn bg-primary px-4 sm:px-6 text-sm sm:text-[15.5px] font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {isCreatingRoom ? "채팅 연결 중..." : "판매자와 채팅"}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
