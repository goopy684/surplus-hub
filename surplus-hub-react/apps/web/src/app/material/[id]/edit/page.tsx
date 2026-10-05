"use client";

import {
  useChatRooms,
  useCurrentUser,
  useMaterialDetail,
  useUpdateMaterial,
} from "@repo/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthGate } from "../../../../components/AuthGate";

// 모노라인 카테고리 아이콘 (viewBox 0 0 24 24, stroke currentColor, 1.8)
function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (name) {
    case "조명": // 전구
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.45.95 1.15 1 1.9l.1.8h5l.1-.8c.05-.75.4-1.45 1-1.9A6 6 0 0 0 12 3Z" />
        </svg>
      );
    case "문/창호": // 문
      return (
        <svg {...common}>
          <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M15 12h.01" />
        </svg>
      );
    case "건축자재": // 벽돌
      return (
        <svg {...common}>
          <path d="M3 8h18M3 16h18M3 4h18v16H3zM9 4v4M15 8v4M9 12v4M15 16v4" />
        </svg>
      );
    case "전기": // 번개
      return (
        <svg {...common}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </svg>
      );
    case "설비": // 렌치
      return (
        <svg {...common}>
          <path d="M14.5 5.5a4 4 0 0 1-5.2 5.2L4 16.2 7.8 20l5.5-5.3a4 4 0 0 1 5.2-5.2l-2.6 2.6-2-2 2.6-2.6Z" />
        </svg>
      );
    default: // 기타 — 박스
      return (
        <svg {...common}>
          <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" />
        </svg>
      );
  }
}

// 업종별 카테고리 — 백엔드 seed_categories / 홈 피드와 동기화
const CATEGORIES = [
  { emoji: "💡", label: "조명" },
  { emoji: "🚪", label: "문/창호" },
  { emoji: "🧱", label: "건축자재" },
  { emoji: "⚡", label: "전기" },
  { emoji: "🔧", label: "설비" },
  { emoji: "📦", label: "기타" },
] as const;

const TRADE_METHODS = [
  { label: "직거래", value: "DIRECT" },
  { label: "배송 협의", value: "DELIVERY" },
] as const;

const STATUS_OPTIONS = [
  { label: "판매중", value: "ACTIVE" },
  { label: "예약중", value: "RESERVED" },
  { label: "거래완료", value: "SOLD" },
] as const;

function EditContent({ id }: { id: string }) {
  const router = useRouter();
  const { data: item, isLoading: isLoadingItem } = useMaterialDetail(id);
  const { data: currentUser } = useCurrentUser();
  const { mutateAsync: updateMaterial, isPending: isSubmitting } = useUpdateMaterial(id);
  const { data: chatRooms } = useChatRooms({ limit: 100 });
  const [buyerId, setBuyerId] = useState("");

  // 이 자재로 대화한 상대 = 구매자 후보 (같은 상대의 방이 여러 개면 하나로)
  const buyerOptions = Array.from(
    new Map(
      (chatRooms?.data ?? [])
        .filter((room) => String(room.materialId) === String(id))
        .map((room) => [room.otherUser.id, room.otherUser.name])
    )
  );

  const [form, setForm] = useState({
    title: "",
    category: "",
    description: "",
    price: "",
    tradeMethod: "DIRECT" as string,
    status: "ACTIVE" as string,
    location: "위치 미정",
    quantity: "1",
    quantityUnit: "개",
  });
  const initializedRef = useRef(false);

  useEffect(() => {
    if (item && !initializedRef.current) {
      const matchedCategory = CATEGORIES.find(
        (cat) => item.category?.includes(cat.label) || cat.label.includes(item.category ?? "")
      );
      const categoryDisplay = matchedCategory
        ? `${matchedCategory.emoji} ${matchedCategory.label}`
        : item.category ?? "";

      setForm({
        title: item.title,
        category: categoryDisplay,
        description: item.description,
        price: String(item.price),
        tradeMethod: item.tradeMethod ?? "DIRECT",
        status: item.status ?? "ACTIVE",
        location: item.location || "위치 미정",
        quantity: item.quantity != null ? String(item.quantity) : "1",
        quantityUnit: item.quantityUnit ?? "개",
      });
      initializedRef.current = true;
    }
  }, [item]);

  // 소유자 확인: 로딩 완료 후 다른 사람이면 상세 페이지로 리다이렉트
  useEffect(() => {
    if (!isLoadingItem && item && currentUser && currentUser.id !== item.sellerId) {
      router.replace(`/material/${id}`);
    }
  }, [isLoadingItem, item, currentUser, id, router]);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.price) {
      alert("제목과 가격을 입력해주세요.");
      return;
    }

    const categoryLabel = CATEGORIES.find(
      (cat) => `${cat.emoji} ${cat.label}` === form.category
    )?.label ?? form.category;

    try {
      await updateMaterial({
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        quantity: form.quantity ? Number(form.quantity) : 1,
        quantityUnit: form.quantityUnit || "개",
        tradeMethod: form.tradeMethod,
        status: form.status,
        location: { address: form.location || "위치 미정" },
        category: categoryLabel,
        ...(form.status === "SOLD" && buyerId ? { buyerId: Number(buyerId) } : {}),
      });
      router.push(`/material/${id}`);
    } catch {
      alert("수정 요청 중 오류가 발생했습니다.");
    }
  };

  if (isLoadingItem) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!item) {
    return <div className="text-center p-8">자재를 찾을 수 없습니다.</div>;
  }

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="sticky top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="font-bold text-lg">자재 수정</h1>
        </div>
      </div>

      {/* Form */}
      <div className="p-4 max-w-lg mx-auto pb-28 space-y-5">
        {/* Title */}
        <div>
          <label htmlFor="edit-title" className="block text-sm font-bold text-foreground mb-2">제목</label>
          <input
            id="edit-title"
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full p-3 border border-border rounded-field text-sm bg-card focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        {/* Category */}
        <div>
          <span id="edit-category-label" className="block text-sm font-bold text-foreground mb-2">카테고리</span>
          <div role="group" aria-labelledby="edit-category-label" className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              const isSelected = form.category === `${cat.emoji} ${cat.label}`;
              return (
                <button
                  key={cat.label}
                  onClick={() => setForm({ ...form, category: `${cat.emoji} ${cat.label}` })}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-chip text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground border border-transparent"
                      : "bg-card text-foreground border border-border"
                  }`}
                >
                  <CategoryIcon name={cat.label} className="w-4 h-4" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="edit-description" className="block text-sm font-bold text-foreground mb-2">상세 설명</label>
          <textarea
            id="edit-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full p-3 border border-border rounded-field text-sm h-28 resize-none bg-card focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        {/* Price */}
        <div>
          <label htmlFor="edit-price" className="block text-sm font-bold text-foreground mb-2">가격</label>
          <div className="relative">
            <input
              id="edit-price"
              type="text"
              value={form.price}
              inputMode="numeric"
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, "") })}
              className="tabular w-full p-3 border border-border rounded-field text-lg font-bold text-foreground bg-card focus:border-primary focus:ring-1 focus:ring-primary outline-none pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">원</span>
          </div>
        </div>

        {/* Quantity */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="edit-quantity" className="block text-sm font-bold text-foreground mb-2">수량</label>
            <input
              id="edit-quantity"
              type="text"
              value={form.quantity}
              inputMode="numeric"
              onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\D/g, "") })}
              className="tabular w-full p-3 border border-border rounded-field text-sm bg-card focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="w-24">
            <label htmlFor="edit-unit" className="block text-sm font-bold text-foreground mb-2">단위</label>
            <input
              id="edit-unit"
              type="text"
              value={form.quantityUnit}
              onChange={(e) => setForm({ ...form, quantityUnit: e.target.value })}
              className="w-full p-3 border border-border rounded-field text-sm bg-card focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>

        {/* Trade Method */}
        <div>
          <span id="edit-trade-label" className="block text-sm font-bold text-foreground mb-2">거래 방식</span>
          <div role="group" aria-labelledby="edit-trade-label" className="flex gap-2">
            {TRADE_METHODS.map((method) => {
              const isSelected = form.tradeMethod === method.value;
              return (
                <button
                  key={method.value}
                  onClick={() => setForm({ ...form, tradeMethod: method.value })}
                  className={`flex-1 py-3 rounded-field text-sm font-medium border transition-colors ${
                    isSelected
                      ? "border-transparent bg-accent text-accent-foreground font-bold"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {method.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status */}
        <div>
          <span id="edit-status-label" className="block text-sm font-bold text-foreground mb-2">판매 상태</span>
          <div role="group" aria-labelledby="edit-status-label" className="flex gap-2">
            {STATUS_OPTIONS.map((option) => {
              const isSelected = form.status === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setForm({ ...form, status: option.value })}
                  className={`flex-1 py-3 rounded-field text-sm font-medium border transition-colors ${
                    isSelected
                      ? "border-transparent bg-accent text-accent-foreground font-bold"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Buyer — 판매중/예약중 → 거래완료로 바꿀 때만 */}
        {form.status === "SOLD" && item.status !== "SOLD" && (
          <div>
            {buyerOptions.length > 0 ? (
              <>
                <label htmlFor="edit-buyer" className="block text-sm font-bold text-foreground mb-2">구매자 선택</label>
                <select
                  id="edit-buyer"
                  value={buyerId}
                  onChange={(e) => setBuyerId(e.target.value)}
                  className="w-full p-3 border border-border rounded-field text-sm bg-card focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">선택 안 함 (채팅 외 거래)</option>
                  {buyerOptions.map(([userId, name]) => (
                    <option key={userId} value={userId}>{name}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted-foreground">구매자를 선택하면 거래 내역과 통계에 반영돼요.</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">이 자재로 대화한 상대가 없어요.</p>
            )}
          </div>
        )}

        {/* Location */}
        <div>
          <label htmlFor="edit-location" className="block text-sm font-bold text-foreground mb-2">거래 위치</label>
          <input
            id="edit-location"
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="거래 위치를 입력하세요"
            className="w-full p-3 border border-border rounded-field text-sm bg-card focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border pb-safe z-50">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !form.title.trim() || !form.price}
            className="w-full bg-primary text-primary-foreground rounded-btn py-4 font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {isSubmitting ? "수정 중..." : "수정 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MaterialEditPage({ params }: { params: { id: string } }) {
  return (
    <AuthGate title="자재 수정은 로그인 후 이용 가능합니다">
      <EditContent id={params.id} />
    </AuthGate>
  );
}
