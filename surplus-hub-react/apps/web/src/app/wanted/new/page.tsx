"use client";

import {
  MATERIAL_CATEGORIES,
  QUANTITY_UNITS,
  WANTED_EXPIRY_OPTIONS_DAYS,
  WANTED_RADIUS_OPTIONS_KM,
  WantedCreateInput,
  useCreateWanted,
  validateWantedInput,
} from "@repo/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGate } from "../../../components/AuthGate";

const CHIP_BASE =
  "flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-chip border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const CHIP_ACTIVE = "border-ink bg-ink font-bold text-surface";
const CHIP_INACTIVE = "border-line bg-surface font-medium text-foreground hover:bg-field active:bg-field";
const INPUT_CLASS =
  "w-full min-h-[52px] rounded-field border-[1.5px] border-line bg-surface px-3.5 py-3 text-[15.5px] text-foreground placeholder:text-ink-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const SECTION_TITLE = "mb-2 block text-sm font-bold text-foreground";

// 입력은 숫자만 받는다. 빈 칸은 undefined로 둬 서버 기본값(없음)을 쓴다
const toOptionalNumber = (value: string): number | undefined => (value.trim() ? Number(value) : undefined);

function WantedNewContent() {
  const router = useRouter();
  const { mutateAsync: createWanted, isPending } = useCreateWanted();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState<string>(QUANTITY_UNITS[0]);
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(30);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleUseCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMessage("이 브라우저에서는 위치를 사용할 수 없습니다.");
      return;
    }
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoMessage("현재 위치가 추가되었습니다.");
      },
      () => setGeoMessage("위치 권한이 없어 현재 위치를 가져오지 못했습니다.")
    );
  };

  const handleSubmit = async () => {
    if (isPending) return;
    const qty = toOptionalNumber(quantity);
    const input: Partial<WantedCreateInput> = {
      title: title.trim(),
      category: category ?? undefined,
      description: description.trim() || undefined,
      quantity: qty,
      quantityUnit: qty !== undefined ? quantityUnit : undefined,
      budgetMax: toOptionalNumber(budget),
      locationAddress: address.trim(),
      lat: coords?.lat,
      lng: coords?.lng,
      radiusKm,
      expiresInDays,
    };
    const invalid = validateWantedInput(input);
    if (invalid) {
      setSubmitError(invalid);
      return;
    }
    setSubmitError(null);

    try {
      const wanted = await createWanted(input as WantedCreateInput);
      router.push(`/wanted/${wanted.id}`);
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
      const detail = response?.data?.detail;
      setSubmitError(
        response?.status === 429
          ? "구매 요청은 하루 10건, 진행 중 20건까지 올릴 수 있습니다."
          : response?.status === 400 && typeof detail === "string"
            ? detail
            : "등록에 실패했습니다. 잠시 후 다시 시도해주세요."
      );
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <div className="sticky top-0 z-50 flex h-14 items-center gap-1 bg-surface px-2">
        <button
          type="button"
          aria-label="뒤로가기"
          onClick={() => router.back()}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-lg font-extrabold tracking-[-0.4px] text-foreground">구해요 등록</h1>
      </div>

      <div className="mx-auto max-w-lg space-y-6 px-5 py-4 pb-28">
        <p className="text-sm text-muted-foreground">찾는 자재를 올려두면 근처에 맞는 매물이 등록될 때 알려드립니다.</p>

        <section>
          <label htmlFor="wanted-title" className={SECTION_TITLE}>
            제목
          </label>
          <input
            id="wanted-title"
            type="text"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: SUS304 파이프 50A"
            className={INPUT_CLASS}
          />
        </section>

        <section>
          <span id="wanted-category-label" className={SECTION_TITLE}>
            품목
          </span>
          <div role="group" aria-labelledby="wanted-category-label" className="flex flex-wrap gap-2">
            {MATERIAL_CATEGORIES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={category === option}
                onClick={() => setCategory(option)}
                className={`${CHIP_BASE} ${category === option ? CHIP_ACTIVE : CHIP_INACTIVE}`}
              >
                {option}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label htmlFor="wanted-quantity" className={SECTION_TITLE}>
            수량 (선택)
          </label>
          <div className="flex gap-2">
            <input
              id="wanted-quantity"
              type="text"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
              placeholder="예: 20"
              className={`${INPUT_CLASS} num`}
            />
            <select
              aria-label="단위"
              value={quantityUnit}
              onChange={(e) => setQuantityUnit(e.target.value)}
              className="min-h-[52px] w-28 flex-shrink-0 rounded-field border-[1.5px] border-line bg-surface px-3 text-[15.5px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {QUANTITY_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section>
          <label htmlFor="wanted-budget" className={SECTION_TITLE}>
            최대 예산 (선택)
          </label>
          <div className="relative">
            <input
              id="wanted-budget"
              type="text"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))}
              placeholder="예: 300000"
              className={`${INPUT_CLASS} num pr-10`}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">원</span>
          </div>
        </section>

        <section>
          <label htmlFor="wanted-description" className={SECTION_TITLE}>
            설명 (선택)
          </label>
          <textarea
            id="wanted-description"
            value={description}
            maxLength={2000}
            rows={4}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="규격·상태·납기 등 판매자가 알아야 할 내용을 적어주세요"
            className={`${INPUT_CLASS} resize-none leading-[1.6]`}
          />
        </section>

        <section>
          <label htmlFor="wanted-address" className={SECTION_TITLE}>
            지역
          </label>
          <input
            id="wanted-address"
            type="text"
            value={address}
            maxLength={200}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예: 경기 안산시 단원구"
            className={INPUT_CLASS}
          />
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-btn border border-line bg-surface px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            현재 위치 사용
          </button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {geoMessage ?? "현재 위치를 기준으로 반경 안의 매물을 찾습니다."}
          </p>
        </section>

        <section>
          <span id="wanted-radius-label" className={SECTION_TITLE}>
            찾는 반경
          </span>
          <div role="group" aria-labelledby="wanted-radius-label" className="flex flex-wrap gap-2">
            {WANTED_RADIUS_OPTIONS_KM.map((km) => (
              <button
                key={km}
                type="button"
                aria-pressed={radiusKm === km}
                onClick={() => setRadiusKm(km)}
                className={`${CHIP_BASE} ${radiusKm === km ? CHIP_ACTIVE : CHIP_INACTIVE}`}
              >
                {km}km
              </button>
            ))}
          </div>
        </section>

        <section>
          <span id="wanted-expiry-label" className={SECTION_TITLE}>
            마감 기간
          </span>
          <div role="group" aria-labelledby="wanted-expiry-label" className="flex flex-wrap gap-2">
            {WANTED_EXPIRY_OPTIONS_DAYS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={expiresInDays === days}
                onClick={() => setExpiresInDays(days)}
                className={`${CHIP_BASE} ${expiresInDays === days ? CHIP_ACTIVE : CHIP_INACTIVE}`}
              >
                {days}일
              </button>
            ))}
          </div>
        </section>

        <div className="space-y-3">
          {submitError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {submitError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full min-h-[56px] rounded-btn bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {isPending ? "등록 중…" : "구해요 등록하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WantedNewPage() {
  return (
    <AuthGate title="구해요 등록은 로그인 후 이용 가능합니다">
      <WantedNewContent />
    </AuthGate>
  );
}
