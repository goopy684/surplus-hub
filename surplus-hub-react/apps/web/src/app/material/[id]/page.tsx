"use client";

import {
  useCreateChatRoom,
  useCurrentUser,
  useDeleteMaterial,
  useMaterialDetail,
  useMaterialLikeStatus,
  useToggleMaterialLike,
} from "@repo/core";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TRADE_METHOD_LABELS: Record<string, string> = {
  DIRECT: "직거래",
  DELIVERY: "배송 협의",
};

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

  return (
    <div className="bg-card min-h-screen pb-24">
      {/* Header with Back Button */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-card/80 backdrop-blur-md z-50 flex items-center px-4 border-b border-border">
        <Link href="/" aria-label="뒤로가기" className="p-2 -ml-2 text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </Link>
        <h1 className="ml-2 font-bold text-lg text-foreground truncate flex-1">{item.title}</h1>
        {isOwner ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/material/${params.id}/edit`}
              className="text-sm text-foreground font-medium px-2 py-1"
            >
              수정
            </Link>
            <button
              onClick={handleDelete}
              disabled={isDeletingMaterial}
              className="text-sm text-destructive font-medium px-2 py-1 disabled:opacity-50"
            >
              삭제
            </button>
          </div>
        ) : (
          <button className="p-2 text-muted-foreground" aria-label="공유">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="pt-14">
        {/* Image */}
        <div className="relative h-80 bg-field">
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

        {/* Seller Profile */}
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-field relative overflow-hidden flex items-center justify-center text-ink-3">
              {item.sellerAvatarUrl ? (
                /* Avatars come from heterogeneous external sources (DiceBear SVGs,
                   Google, S3, user uploads). Skip next/image optimization so the
                   optimizer's upstream content-type validation can't 400 on
                   generator-served SVGs; avatars are tiny so optimization is moot. */
                <Image src={item.sellerAvatarUrl} alt={sellerDisplayName} fill unoptimized className="object-cover" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-7 h-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="font-bold text-foreground">{sellerDisplayName}</h3>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{locationLabel}</span>
                <span>•</span>
                <span className="font-medium">판매자 정보</span>
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>판매자 ID</p>
            <p className="font-semibold text-foreground tabular">{item.sellerId || "-"}</p>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Material Info */}
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">{item.title}</h2>
            <div className="flex text-sm text-muted-foreground mb-4">
              <span>{item.category}</span>
              <span className="mx-2">•</span>
              <span className="tabular">{createdAt}</span>
            </div>
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">
              {item.description}
            </p>
          </div>

          {/* AI Analysis */}
          <div className="rounded-thumb border border-accent-foreground/20 bg-accent p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-accent-foreground">
                <path d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813a3.75 3.75 0 0 0 2.576-2.576l.813-2.846A.75.75 0 0 1 9 4.5Z" />
              </svg>
              <span className="font-bold text-accent-foreground">AI 분석</span>
            </div>
            <p className="text-sm leading-snug text-accent-foreground/90">
              등록 카테고리는 <span className="font-semibold text-accent-foreground">{item.category || "기타"}</span>이며 등록일은{" "}
              <span className="font-semibold text-accent-foreground tabular">{createdAt}</span>입니다. 상세 조건은 채팅으로 확인해 주세요.
            </p>
          </div>

          <div className="rounded-thumb bg-muted p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">상태</span>
              <span className="font-semibold text-foreground">{statusLabel}</span>
            </div>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">카테고리</span>
              <span className="font-semibold text-foreground">{item.category || "기타"}</span>
            </div>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">수량</span>
              <span className="font-semibold text-foreground tabular">{quantityLabel}</span>
            </div>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">거래 방식</span>
              <span className="font-semibold text-foreground">{tradeMethodLabel}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">위치</span>
              <span className="font-semibold text-foreground">{locationLabel}</span>
            </div>
          </div>

          {/* Location Info */}
          <div>
            <h3 className="font-bold text-foreground mb-3">거래 위치</h3>
            <div className="bg-field h-40 rounded-thumb flex items-center justify-center text-ink-3">
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
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 safe-area-bottom flex items-center justify-between z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={() => toggleLike(undefined, {
              onError: () => alert("좋아요 처리에 실패했습니다. 다시 시도해주세요."),
            })}
            disabled={isTogglingLike}
            className={`flex flex-col items-center gap-0.5 disabled:opacity-60 ${isLiked ? "text-primary" : "text-muted-foreground"}`}
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
            <span className="text-xs tabular">
              관심 {likesCount > 0 ? likesCount : ""}
            </span>
          </button>
          <div className="h-8 w-px bg-border"></div>
          <div>
            <div className="flex items-center gap-2 leading-none">
              <p className="font-bold text-foreground">
                <span className="text-xl tabular">{item.price.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground font-medium ml-0.5">원</span>
              </p>
              {(() => {
                const grade = item.conditionGrade;
                const style = grade ? CONDITION_GRADE_STYLES[grade] : undefined;
                return style ? (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-chip ${style.className}`}>
                    {style.label}
                  </span>
                ) : null;
              })()}
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">거래 조건은 판매자와 협의</p>
          </div>
        </div>
        {isOwner ? (
          <Link
            href={`/material/${params.id}/edit`}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-btn font-bold hover:bg-primary/90 transition-colors"
          >
            수정하기
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleStartChat}
            disabled={isCreatingRoom}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-btn font-bold hover:bg-primary/90 transition-colors disabled:opacity-70"
          >
            {isCreatingRoom ? "채팅 연결 중..." : "판매자와 채팅"}
          </button>
        )}
      </div>
    </div>
  );
}
