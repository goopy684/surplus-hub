"use client";

import {
  MATERIAL_CATEGORIES,
  TRIAGE_MATERIAL_OPTIONS,
  TRIAGE_VOLUME_OPTIONS,
  TriageInput,
  dataUrlToFile,
  uploadImage,
  useCreateTriage,
} from "@repo/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import { AuthGate } from "../../components/AuthGate";

// 백엔드 /api/v1/upload/image 허용 형식·용량과 동일 (register 페이지와 같은 규칙)
const UPLOAD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MOBILE_IMAGE_TYPE_ALIASES = ["image/jpg", "image/pjpeg", "image/x-png"];
const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|heic|heif)$/i;
const MAX_UPLOAD_MB = 10;
const MAX_PHOTOS = 3;

const isAllowedImage = (file: File) =>
  UPLOAD_IMAGE_TYPES.includes(file.type) ||
  MOBILE_IMAGE_TYPE_ALIASES.includes(file.type) ||
  (file.type === "" && IMAGE_EXTENSION_RE.test(file.name));

const CONDITION_OPTIONS = ["상", "중", "하"] as const;

const CHIP_BASE =
  "flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-chip border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const CHIP_ACTIVE = "border-ink bg-ink font-bold text-surface";
const CHIP_INACTIVE = "border-line bg-surface font-medium text-foreground hover:bg-field active:bg-field";
const INPUT_CLASS =
  "w-full min-h-[52px] rounded-field border-[1.5px] border-line bg-surface px-3.5 py-3 text-[15.5px] text-foreground placeholder:text-ink-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const SECTION_TITLE = "mb-2 block text-sm font-bold text-foreground";

function TriageInputContent() {
  const router = useRouter();
  const { mutateAsync: createTriage, isPending: isDiagnosing } = useCreateTriage();
  const [images, setImages] = useState<{ url: string; file: File }[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [materialKey, setMaterialKey] = useState<string | null>(null);
  const [conditionGrade, setConditionGrade] = useState<string | null>(null);
  const [volumeLabel, setVolumeLabel] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [specText, setSpecText] = useState("");
  const [labelText, setLabelText] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isBusy = isUploading || isDiagnosing;
  const canSubmit = images.length > 0 || !!category || !!materialKey || specText.trim().length > 0;

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const rejected: string[] = [];
    files.forEach((file) => {
      if (!isAllowedImage(file) || file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        rejected.push(file.name);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        // 업로드 시 파일을 다시 읽지 못하는 모바일 브라우저용 폴백 (register와 동일)
        (file as File & { __previewDataUrl?: string }).__previewDataUrl = reader.result as string;
        setImages((prev) => [...prev, { url: reader.result as string, file }].slice(0, MAX_PHOTOS));
      };
      reader.readAsDataURL(file);
    });
    setPhotoError(
      rejected.length > 0
        ? `JPG·PNG·WEBP·HEIC 형식, ${MAX_UPLOAD_MB}MB 이하 사진만 올릴 수 있습니다. 제외된 사진: ${rejected.join(", ")}`
        : null
    );
  };

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
    if (!canSubmit || isBusy) return;
    setSubmitError(null);

    let imageUrls: string[] = [];
    if (images.length > 0) {
      setIsUploading(true);
      try {
        imageUrls = await Promise.all(
          images.map(async (img) => {
            try {
              return await uploadImage(img.file);
            } catch (err) {
              // 원본 File 핸들이 무효화된 경우 미리보기로 인메모리 File을 만들어 1회 재시도
              const fallbackFile = dataUrlToFile(img.url, img.file.name, img.file.type);
              if (!fallbackFile) throw err;
              return uploadImage(fallbackFile);
            }
          })
        );
      } catch {
        setSubmitError("사진 업로드에 실패했습니다. 다시 시도해주세요.");
        return;
      } finally {
        setIsUploading(false);
      }
    }

    const volumeWeight = TRIAGE_VOLUME_OPTIONS.find((option) => option.label === volumeLabel)?.weightKg;
    const typedWeight = Number(weightInput);
    const weightKg = volumeWeight ?? (typedWeight > 0 ? typedWeight : undefined);
    const input: TriageInput = {
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
      ...(specText.trim() ? { specText: specText.trim() } : {}),
      ...(labelText.trim() ? { labelText: labelText.trim() } : {}),
      ...(category ? { category } : {}),
      ...(materialKey ? { materialKey } : {}),
      ...(conditionGrade ? { conditionGrade } : {}),
      ...(weightKg ? { weightKg } : {}),
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    };

    try {
      const diagnosis = await createTriage(input);
      router.push(`/triage/${diagnosis.id}`);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setSubmitError(
        status === 429
          ? "오늘 진단 횟수를 모두 사용했습니다. 내일 다시 시도해주세요."
          : "진단에 실패했습니다. 잠시 후 다시 시도해주세요."
      );
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <div className="sticky top-0 z-50 flex h-14 items-center gap-1 bg-surface px-2">
        <button
          type="button"
          aria-label="뒤로가기"
          onClick={() => router.push("/")}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-lg font-extrabold tracking-[-0.4px] text-foreground">내 창고 자재 3초 가치진단</h1>
      </div>

      <div className="mx-auto max-w-lg space-y-6 px-5 py-4 pb-28">
        {/* 1. 사진 */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">사진 (선택)</span>
            <span className="tabular text-xs text-muted-foreground">
              {images.length}/{MAX_PHOTOS}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {images.length < MAX_PHOTOS ? (
              <label className="flex h-24 w-24 flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-thumb border-[1.5px] border-dashed border-ink-3/60 bg-canvas transition-colors hover:bg-field active:bg-field focus-within:ring-2 focus-within:ring-ring">
                <input
                  type="file"
                  multiple
                  accept={UPLOAD_IMAGE_TYPES.join(",")}
                  onChange={handleImageChange}
                  className="sr-only"
                  aria-label="사진 추가"
                />
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="mb-1 h-6 w-6 text-muted-foreground">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.122 2.122 0 0 0-1.791-1.006H9.637a2.122 2.122 0 0 0-1.791 1.006l-.822 1.316Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                </svg>
                <span className="text-xs text-muted-foreground">추가</span>
              </label>
            ) : null}
            {images.map((img, idx) => (
              <div key={idx} className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-thumb border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 원본·미리보기 data URL을 그대로 보여준다 */}
                <img src={img.url} alt={`진단 사진 ${idx + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={`사진 ${idx + 1} 삭제`}
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute right-0 top-0 flex h-11 w-11 items-start justify-end p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/60 text-surface transition-colors active:bg-ink/80">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </span>
                </button>
              </div>
            ))}
          </div>
          {photoError ? <p className="mt-1.5 text-xs text-destructive">{photoError}</p> : null}
        </section>

        {/* 2. 품목 — 재사용 수요의 기본값을 정한다 */}
        <section>
          <span id="triage-category-label" className={SECTION_TITLE}>
            품목
          </span>
          <div
            role="group"
            aria-labelledby="triage-category-label"
            aria-describedby="triage-category-help"
            className="flex flex-wrap gap-2"
          >
            {MATERIAL_CATEGORIES.map((option) => {
              const isActive = category === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setCategory(isActive ? null : option)}
                  className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <p id="triage-category-help" className="mt-1.5 text-xs text-muted-foreground">
            고르지 않으면 메모에서 추정합니다.
          </p>
        </section>

        {/* 3. 소재 — 고철 단가 계산에만 쓴다. 모르면 비워 둔다 */}
        <section>
          <span id="triage-material-label" className={SECTION_TITLE}>
            소재 (선택)
          </span>
          <div
            role="group"
            aria-labelledby="triage-material-label"
            aria-describedby="triage-material-help"
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              aria-pressed={!materialKey}
              onClick={() => setMaterialKey(null)}
              className={`${CHIP_BASE} ${!materialKey ? CHIP_ACTIVE : CHIP_INACTIVE}`}
            >
              모름
            </button>
            {TRIAGE_MATERIAL_OPTIONS.map((option) => {
              const isActive = materialKey === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setMaterialKey(isActive ? null : option.key)}
                  className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p id="triage-material-help" className="mt-1.5 text-xs text-muted-foreground">
            금속이면 골라주세요. 고철 단가 계산에 씁니다.
          </p>
        </section>

        {/* 4. 상태 */}
        <section>
          <span id="triage-condition-label" className={SECTION_TITLE}>
            상태 (선택)
          </span>
          <div role="group" aria-labelledby="triage-condition-label" className="flex gap-2">
            {CONDITION_OPTIONS.map((grade) => {
              const isActive = conditionGrade === grade;
              return (
                <button
                  key={grade}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setConditionGrade(isActive ? null : grade)}
                  className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {grade}
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. 물량 — 칩과 직접 입력 중 하나만 */}
        <section>
          <span id="triage-volume-label" className={SECTION_TITLE}>
            물량 (선택)
          </span>
          <div role="group" aria-labelledby="triage-volume-label" className="flex flex-wrap gap-2">
            {TRIAGE_VOLUME_OPTIONS.map((option) => {
              const isActive = volumeLabel === option.label;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    setVolumeLabel(isActive ? null : option.label);
                    setWeightInput("");
                  }}
                  className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="relative mt-2">
            <input
              type="text"
              inputMode="numeric"
              aria-label="직접 입력(kg)"
              placeholder="직접 입력(kg)"
              value={weightInput}
              onChange={(e) => {
                setWeightInput(e.target.value.replace(/\D/g, ""));
                setVolumeLabel(null);
              }}
              className={`${INPUT_CLASS} num pr-12`}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">kg</span>
          </div>
        </section>

        {/* 6. 규격·메모 / 라벨 문구 */}
        <section className="space-y-3">
          <div>
            <label htmlFor="triage-spec" className={SECTION_TITLE}>
              규격·메모
            </label>
            <input
              id="triage-spec"
              type="text"
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              placeholder="예: 304 스텐 파이프 50A 두 본, 미사용"
              aria-describedby="triage-spec-help"
              className={INPUT_CLASS}
            />
            <p id="triage-spec-help" className="mt-1.5 text-xs text-muted-foreground">
              키보드 마이크로 말해도 됩니다
            </p>
          </div>
          <div>
            <label htmlFor="triage-label" className={SECTION_TITLE}>
              라벨 문구 (선택)
            </label>
            <input
              id="triage-label"
              type="text"
              value={labelText}
              onChange={(e) => setLabelText(e.target.value)}
              placeholder="예: KS D 3576"
              className={INPUT_CLASS}
            />
          </div>
        </section>

        {/* 7. 위치 */}
        <section>
          <span className={SECTION_TITLE}>위치 (선택)</span>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn border border-line bg-surface px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            현재 위치 사용
          </button>
          {geoMessage ? <p className="mt-1.5 text-xs text-muted-foreground">{geoMessage}</p> : null}
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
            disabled={!canSubmit || isBusy}
            className="w-full min-h-[56px] rounded-btn bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {isUploading ? "사진 업로드 중…" : isDiagnosing ? "진단 중…" : "3초 진단 받기"}
          </button>
          {!canSubmit ? (
            <p className="text-center text-xs text-muted-foreground">사진·품목·소재·규격 중 하나만 있어도 진단할 수 있습니다.</p>
          ) : null}
          <Link
            href="/triage/vault"
            className="flex min-h-[48px] w-full items-center justify-center rounded-btn border border-line bg-surface text-sm font-semibold text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            내 창고 보관함 보기
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function TriagePage() {
  return (
    <AuthGate title="가치진단은 로그인 후 이용 가능합니다">
      <TriageInputContent />
    </AuthGate>
  );
}
