"use client";

import {
  useCreateMaterial,
  analyzeImage,
  evaluateDisposal,
  overrideDisposalRoute,
  generateDescription,
  suggestPrice,
  uploadImage,
  dataUrlToFile,
  AiPriceSuggestion,
  AiImageAnalysis,
  AiDisposalEvaluation,
  DisposalRoute,
  MATERIAL_CATEGORIES,
  QUANTITY_UNITS,
  TRADE_METHOD_OPTIONS,
} from "@repo/core";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "../../components/AuthGate";

type Step = "upload" | "ai-analyzing" | "ai-result";

// 모노라인 아이콘 (viewBox 0 0 24 24, stroke currentColor 1.8, fill none)
const ICON_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "w-5 h-5",
};

// 카테고리 아이콘 (모노라인 SVG)
const CategoryIcons = {
  조명: (
    <svg {...ICON_PROPS}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.6V16h5.6v-.6c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" />
    </svg>
  ),
  "문/창호": (
    <svg {...ICON_PROPS}>
      <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M4 21h16M15 12h.01" />
    </svg>
  ),
  건축자재: (
    <svg {...ICON_PROPS}>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </svg>
  ),
  전기: (
    <svg {...ICON_PROPS}>
      <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />
    </svg>
  ),
  설비: (
    <svg {...ICON_PROPS}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6 2.6 2.6 6-6a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.7-.7-2.6 2.4-2.4Z" />
    </svg>
  ),
  기타: (
    <svg {...ICON_PROPS}>
      <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3ZM3 7.5 12 12m0 0 9-4.5M12 12v9" />
    </svg>
  ),
} as const;

// 백엔드 /api/v1/upload/image 허용 형식·용량과 동일
const UPLOAD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_UPLOAD_MB = 10;
// 일부 모바일 브라우저는 비표준 MIME을 쓰거나 type을 비운다 — 백엔드가 같은 보정을 한다
const MOBILE_IMAGE_TYPE_ALIASES = ["image/jpg", "image/pjpeg", "image/x-png"];
const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|heic|heif)$/i;

const isAllowedImage = (file: File) =>
  UPLOAD_IMAGE_TYPES.includes(file.type) ||
  MOBILE_IMAGE_TYPE_ALIASES.includes(file.type) ||
  (file.type === "" && IMAGE_EXTENSION_RE.test(file.name));

const CONDITION_GRADES = [
  { label: "상 (양호)", value: "상" },
  { label: "중 (보통)", value: "중" },
  { label: "하 (사용감 있음)", value: "하" },
] as const;

const LOCATIONS = [
  "서울특별시",
  "경기도",
  "인천광역시",
  "부산광역시",
  "대구광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "강원도",
  "충청북도",
  "충청남도",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
] as const;

const AI_ANALYSIS_STEPS = [
  "이미지 인식 및 상태·공종 분석 중",
  "처분 경로 1차 판별 중",
  "규격 판매글 생성 중",
  "유사 매물 시세 산출 중",
] as const;

// 모듈 0 처분 경로 — 직거래(REUSE)일 때만 판매글·시세 LLM과 사진 업로드를 진행한다
const DISPOSAL_ROUTES: { value: DisposalRoute; label: string }[] = [
  { value: "REUSE", label: "Reuse · 직거래 등록" },
  { value: "RECYCLE", label: "Recycle · 재활용 연계" },
  { value: "SCRAP", label: "Scrap · 고철·폐기" },
];

const SCRAP_OVERRIDE_REASONS = [
  "표면 먼지·보관 흔적일 뿐 본품 양호",
  "외포장 손상(내부 자재 정상)",
  "수리·부품용 직거래 수요 있음",
] as const;

const errorDetail = (err: unknown): string | undefined => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : undefined;
};

function RegisterContent() {
  const router = useRouter();
  const { mutateAsync: createMaterial, isPending: isSubmitting } = useCreateMaterial();
  const [step, setStep] = useState<Step>("upload");
  // url = data-URL 미리보기(AI 분석 입력), file = 등록 시 R2 업로드 원본
  const [images, setImages] = useState<{ url: string; file: File }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [marketPrice, setMarketPrice] = useState<AiPriceSuggestion["marketPrice"] | null>(null);
  const [analysis, setAnalysis] = useState<AiImageAnalysis | null>(null);
  const [advisory, setAdvisory] = useState<AiDisposalEvaluation | null>(null);
  // 판매글·시세는 REUSE로 확정될 때 한 번만 생성한다 (Recycle/Scrap 재지정 시 지연 생성)
  const [listingReady, setListingReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showScrapReasons, setShowScrapReasons] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // AI result form
  const [form, setForm] = useState({
    title: "",
    category: "",
    description: "",
    price: "",
    quantity: "1",
    quantityUnit: "개" as string,
    tradeMethod: "DIRECT" as (typeof TRADE_METHOD_OPTIONS)[number]["value"],
    conditionGrade: "" as string,
    location: "" as string,
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // 등록 시 /upload/image가 거절할 사진은 고를 때 바로 걸러 어떤 파일인지 알려준다
      const rejected: string[] = [];
      Array.from(files).forEach((file) => {
        if (!isAllowedImage(file) || file.size > MAX_UPLOAD_MB * 1024 * 1024) {
          rejected.push(file.name);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          // 업로드 시 파일을 다시 읽지 못하는 모바일 브라우저용 JSON 폴백에 쓴다 (file 참조는 그대로 유지)
          (file as File & { __previewDataUrl?: string }).__previewDataUrl = reader.result as string;
          setImages((prev) => [...prev, { url: reader.result as string, file }].slice(0, 10));
        };
        reader.readAsDataURL(file);
      });
      if (rejected.length > 0) {
        alert(`JPG·PNG·WEBP·HEIC 형식, ${MAX_UPLOAD_MB}MB 이하 사진만 올릴 수 있습니다.\n제외된 사진: ${rejected.join(", ")}`);
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  // 판매자가 키워드에 적은 수량("50개")은 AI 추정보다 우선한다
  const keywordQuantity = (result: AiImageAnalysis) => {
    const quantityUnit = (QUANTITY_UNITS as readonly string[]).includes(result.quantityUnit ?? "")
      ? result.quantityUnit
      : undefined;
    return { quantityUnit, quantity: quantityUnit ? result.quantity : undefined };
  };

  // 규격 판매글 + 유사 매물 시세 (LLM) — 직거래로 확정된 자재에만 호출
  const fillListing = async (result: AiImageAnalysis, onStep?: (idx: number) => void) => {
    const { quantity, quantityUnit } = keywordQuantity(result);
    onStep?.(2);
    const descResult = await generateDescription(result.title, result.category, images[0]?.url, {
      tags: result.tags,
      condition: result.condition,
      quantity,
      quantityUnit,
    });
    onStep?.(3);
    const priceResult = await suggestPrice(result.title, result.category, descResult.description, {
      condition: result.condition,
      quantity,
    });
    setMarketPrice(priceResult.marketPrice);
    setForm((prev) => ({ ...prev, description: descResult.description, price: priceResult.price.toString() }));
    setListingReady(true);
  };

  const resetAnalysis = () => {
    setStep("upload");
    setImages([]);
    setKeyword("");
    setAnalysis(null);
    setAdvisory(null);
    setListingReady(false);
    setMarketPrice(null);
    setShowScrapReasons(false);
    setRouteError(null);
  };

  const handleAIAnalysis = async () => {
    setStep("ai-analyzing");
    setAnalysisStep(0);
    setAiError(null);
    setRouteError(null);
    setShowScrapReasons(false);
    setListingReady(false);
    setMarketPrice(null);

    try {
      // Step 1: 이미지 인식 및 상태·공종 분석
      const firstImage = images[0]?.url ?? "";
      const imageAnalysis = await analyzeImage(firstImage, keyword || undefined);

      // Step 2: 처분 경로 1차 판별 (모듈 0)
      setAnalysisStep(1);
      const evaluation = await evaluateDisposal({
        title: imageAnalysis.title,
        category: imageAnalysis.category,
        condition: imageAnalysis.condition,
        tags: imageAnalysis.tags,
        materialType: imageAnalysis.materialType,
        damageLevel: imageAnalysis.damageLevel,
        isMixedWaste: imageAnalysis.isMixedWaste,
        recyclableMaterial: imageAnalysis.recyclableMaterial,
      });

      // 카테고리를 업종 카테고리와 매칭 (백엔드는 이름 일치로 필터하므로 못 찾으면 기타)
      const matchedCategory =
        MATERIAL_CATEGORIES.find(
          (cat) => imageAnalysis.category.includes(cat) || cat.includes(imageAnalysis.category)
        ) ?? "기타";
      const matchedGrade = CONDITION_GRADES.some((g) => g.value === imageAnalysis.condition)
        ? imageAnalysis.condition ?? ""
        : "";
      const { quantity, quantityUnit } = keywordQuantity(imageAnalysis);

      setForm({
        title: imageAnalysis.title,
        category: matchedCategory,
        description: "",
        price: "",
        quantity: quantity ? String(quantity) : "1",
        quantityUnit: quantityUnit ?? "개",
        tradeMethod: "DIRECT",
        conditionGrade: matchedGrade,
        location: "",
      });
      setAnalysis(imageAnalysis);
      setAdvisory(evaluation);

      // Step 3·4: 직거래 판정일 때만 판매글·시세 생성
      if (evaluation.selectedRoute === "REUSE") {
        await fillListing(imageAnalysis, setAnalysisStep);
      }
      setStep("ai-result");
    } catch (err: unknown) {
      let errorMsg = "AI 분석에 실패했습니다. 다시 시도해주세요.";
      // Extract detailed error from server response
      const axiosErr = err as { response?: { data?: { detail?: { message?: string; error?: string; reason?: string } | string } } };
      const detail = axiosErr?.response?.data?.detail;
      if (detail && typeof detail === "object") {
        errorMsg = `${detail.message || "AI 오류"}\n[${detail.error}] ${detail.reason || ""}`;
      } else if (typeof detail === "string") {
        errorMsg = detail;
      }
      setAiError(errorMsg);
      setStep("upload");
    }
  };

  // 판매자 경로 재지정 — 서버에 기록한 뒤, 직거래로 바뀌면 판매글·시세를 그때 생성한다
  const changeRoute = async (route: DisposalRoute, reason?: string) => {
    if (!advisory || !analysis || route === advisory.selectedRoute) return;
    setRouteError(null);
    setIsGenerating(true);
    try {
      const updated = await overrideDisposalRoute(advisory.advisoryId, route, reason);
      setAdvisory(updated);
      setShowScrapReasons(false);
      if (updated.selectedRoute === "REUSE" && !listingReady) {
        try {
          await fillListing(analysis);
        } catch {
          // 경로는 이미 바뀌었다 — 폼을 열어 직접 입력하게 한다
          setListingReady(true);
          setRouteError("판매글·시세 자동 생성에 실패했습니다. 직접 입력해 주세요.");
        }
      }
    } catch (err) {
      setRouteError(errorDetail(err) ?? "경로를 변경하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRouteClick = (route: DisposalRoute) => {
    if (!advisory) return;
    // 일반 Scrap 판정을 직거래로 바꾸려면 사유를 먼저 고른다 (혼합 폐기물은 버튼이 비활성)
    if (route === "REUSE" && advisory.recommendedRoute === "SCRAP" && advisory.selectedRoute !== "REUSE") {
      setShowScrapReasons(true);
      return;
    }
    setShowScrapReasons(false);
    void changeRoute(route);
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
    if (!form.title.trim() || !form.price) {
      alert("제목과 가격을 입력해주세요.");
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      alert("수량은 1 이상이어야 합니다.");
      return;
    }

    // 미리보기 data-URL이 아니라 R2에 올린 URL을 저장한다.
    let photoUrls: string[];
    setIsUploading(true);
    try {
      photoUrls = await Promise.all(
        images.map(async (img) => {
          try {
            return await uploadImage(img.file);
          } catch (err) {
            // 원본 File 핸들이 무효화된 경우(Android ERR_UPLOAD_FILE_CHANGED 등) 미리보기로 인메모리 File을 만들어 1회 재시도
            const fallbackFile = dataUrlToFile(img.url, img.file.name, img.file.type);
            if (!fallbackFile) throw err;
            return uploadImage(fallbackFile);
          }
        })
      );
    } catch {
      alert("사진 업로드에 실패했습니다. 다시 시도해주세요.");
      return;
    } finally {
      setIsUploading(false);
    }

    try {
      await createMaterial({
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        quantity,
        quantityUnit: form.quantityUnit,
        tradeMethod: form.tradeMethod,
        category: form.category || undefined,
        location: {
          address: form.location || "위치 미정",
          ...coords,
        },
        ...(form.conditionGrade ? { conditionGrade: form.conditionGrade } : {}),
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
        ...(advisory ? { advisoryId: advisory.advisoryId } : {}),
      });

      alert("자재가 성공적으로 등록되었습니다.");
      router.push("/");
    } catch {
      alert("등록 요청 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="bg-paper min-h-screen">
      {/* Sticky Header */}
      <div className="sticky top-0 left-0 right-0 h-14 bg-surface flex items-center justify-between px-2 z-50">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="뒤로가기" onClick={() => router.push("/")} className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="text-lg font-extrabold tracking-[-0.4px]">자재 등록</h1>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-3 max-w-lg mx-auto pb-24">
        {/* Step 1: Upload Mode */}
        {step === "upload" && (
          <>
            {/* Image Upload Area */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-sm text-foreground">사진 등록</h3>
                <span className="text-xs text-muted-foreground">{images.length}/10</span>
              </div>

              {images.length === 0 ? (
                // Empty state
                <label className="border-[1.5px] border-dashed border-ink-3/60 bg-canvas rounded-card h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-muted transition-colors">
                  <input type="file" multiple accept={UPLOAD_IMAGE_TYPES.join(",")} onChange={handleImageUpload} className="hidden" />
                  <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-8 h-8 text-accent-foreground"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                      />
                    </svg>
                  </div>
                  <p className="font-bold text-foreground mb-1">사진을 먼저 올려주세요</p>
                  <p className="text-sm text-muted-foreground">AI가 사진을 분석해 자동으로 입력해 드립니다</p>
                </label>
              ) : (
                // Image grid
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  <label className="flex-shrink-0 w-24 h-24 border-[1.5px] border-dashed border-ink-3/60 rounded-thumb flex flex-col items-center justify-center bg-canvas cursor-pointer hover:bg-muted transition-colors">
                    <input type="file" multiple accept={UPLOAD_IMAGE_TYPES.join(",")} onChange={handleImageUpload} className="hidden" />
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-6 h-6 text-muted-foreground mb-1"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.122 2.122 0 0 0-1.791-1.006H9.637a2.122 2.122 0 0 0-1.791 1.006l-.822 1.316Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
                      />
                    </svg>
                    <span className="text-xs text-muted-foreground">추가</span>
                  </label>
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      className="flex-shrink-0 w-24 h-24 relative rounded-thumb overflow-hidden border border-border"
                    >
                      {idx === 0 && (
                        <div className="absolute bottom-1.5 left-1.5 bg-ink text-surface text-[10.5px] px-2 py-0.5 rounded-chip font-bold z-10">
                          대표
                        </div>
                      )}
                      <img src={img.url} alt={`Upload ${idx}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 bg-ink/60 text-surface rounded-full p-0.5 hover:bg-ink/80"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Error */}
            {aiError && (
              <div className="mb-4 rounded-thumb bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive whitespace-pre-wrap">
                <div className="font-semibold mb-1">{aiError.split("\n")[0]}</div>
                {aiError.includes("\n") && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs opacity-70">상세 오류 보기</summary>
                    <pre className="mt-1 text-xs opacity-80 overflow-x-auto">{aiError.split("\n").slice(1).join("\n")}</pre>
                  </details>
                )}
              </div>
            )}

            {/* AI Smart Registration CTA */}
            {images.length > 0 && (
              <div className="space-y-3 mb-6">
                <div className="bg-accent rounded-card p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5 text-accent-foreground flex-shrink-0 mt-0.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                      />
                    </svg>
                    <div>
                      <p className="font-bold text-sm text-accent-foreground mb-1">AI 자동 입력 준비 완료</p>
                      <p className="text-xs text-accent-foreground/80">
                        사진을 분석해 제목, 카테고리, 설명, 시세를 자동으로 작성해드립니다
                      </p>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="키워드 입력 (선택사항)"
                    className="w-full p-2.5 border border-border rounded-field text-sm mb-3 bg-card focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                  <button
                    onClick={handleAIAnalysis}
                    className="w-full min-h-[52px] bg-primary text-primary-foreground rounded-btn font-bold flex items-center justify-center gap-2 transition-colors hover:bg-primary-dark active:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                      />
                    </svg>
                    AI 자동 입력 시작
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 2: AI Analyzing */}
        {step === "ai-analyzing" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mb-6 animate-pulse">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-10 h-10 text-accent-foreground"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                />
              </svg>
            </div>
            <h3 className="font-bold text-lg mb-6">AI가 분석 중입니다</h3>
            <div className="w-full max-w-xs space-y-3">
              {AI_ANALYSIS_STEPS.map((stepName, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  {idx < analysisStep ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-5 h-5 text-success flex-shrink-0"
                    >
                      <path
                        fillRule="evenodd"
                        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : idx === analysisStep ? (
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <div className="w-5 h-5 border-2 border-muted rounded-full flex-shrink-0" />
                  )}
                  <span
                    className={`text-sm ${idx <= analysisStep ? "text-foreground font-medium" : "text-muted-foreground"}`}
                  >
                    {stepName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: AI Result */}
        {step === "ai-result" && advisory && (
          <>
            <DisposalGateCard
              advisory={advisory}
              busy={isGenerating}
              showScrapReasons={showScrapReasons}
              routeError={routeError}
              onRouteClick={handleRouteClick}
              onReason={(reason) => void changeRoute("REUSE", reason)}
            />
            {advisory.selectedRoute !== "REUSE" && <DisposalGuide advisory={advisory} onReset={resetAnalysis} />}
            {advisory.selectedRoute === "REUSE" && !listingReady && isGenerating && (
              <div role="status" className="mb-6 flex items-center gap-3 rounded-card bg-canvas p-4 text-sm text-foreground">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                규격 판매글과 유사 매물 시세를 생성하는 중입니다
              </div>
            )}
          </>
        )}

        {step === "ai-result" && advisory?.selectedRoute === "REUSE" && listingReady && (
          <>
            {/* AI Confidence Badge */}
            <div className="bg-accent rounded-card px-3.5 py-3 mb-6 flex items-start gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 text-accent-foreground flex-shrink-0 mt-0.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                />
              </svg>
              <p className="text-sm text-accent-foreground">
                AI가 자동으로 입력했습니다. 내용을 확인하고 수정할 수 있어요.
              </p>
            </div>

            {/* Form Fields */}
            <div className="space-y-5">
              {/* Title */}
              <div>
                <label htmlFor="reg-title" className="flex items-center gap-2 text-sm font-bold text-foreground mb-2">
                  제목
                  <span className="inline-flex items-center gap-1 text-[11px] bg-accent text-accent-foreground px-2 py-0.5 rounded-chip font-bold">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="w-3 h-3"
                    >
                      <path d="M7.628 1.099a.75.75 0 0 1 .744 0l5.25 3a.75.75 0 0 1 0 1.302l-5.25 3a.75.75 0 0 1-.744 0l-5.25-3a.75.75 0 0 1 0-1.302l5.25-3Z" />
                      <path d="m2.57 7.24-.192.11a.75.75 0 0 0 0 1.302l5.25 3a.75.75 0 0 0 .744 0l5.25-3a.75.75 0 0 0 0-1.303l-.192-.11-4.314 2.465a2.25 2.25 0 0 1-2.232 0L2.57 7.239Z" />
                      <path d="m2.378 10.6-.192.11a.75.75 0 0 0 0 1.302l5.25 3a.75.75 0 0 0 .744 0l5.25-3a.75.75 0 0 0 0-1.303l-.192-.11-4.314 2.465a2.25 2.25 0 0 1-2.232 0L2.378 10.6Z" />
                    </svg>
                    AI
                  </span>
                </label>
                <input
                  id="reg-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full min-h-[52px] px-3.5 py-3 border-[1.5px] border-line rounded-field text-[15.5px] bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              {/* Category */}
              <div>
                <span id="reg-category-label" className="flex items-center gap-2 text-sm font-bold text-foreground mb-2">
                  카테고리
                  <span className="inline-flex items-center gap-1 text-[11px] bg-accent text-accent-foreground px-2 py-0.5 rounded-chip font-bold">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="w-3 h-3"
                    >
                      <path d="M7.628 1.099a.75.75 0 0 1 .744 0l5.25 3a.75.75 0 0 1 0 1.302l-5.25 3a.75.75 0 0 1-.744 0l-5.25-3a.75.75 0 0 1 0-1.302l5.25-3Z" />
                      <path d="m2.57 7.24-.192.11a.75.75 0 0 0 0 1.302l5.25 3a.75.75 0 0 0 .744 0l5.25 3a.75.75 0 0 0 0-1.303l-.192-.11-4.314 2.465a2.25 2.25 0 0 1-2.232 0L2.57 7.239Z" />
                      <path d="m2.378 10.6-.192.11a.75.75 0 0 0 0 1.302l5.25 3a.75.75 0 0 0 .744 0l5.25-3a.75.75 0 0 0 0-1.303l-.192-.11-4.314 2.465a2.25 2.25 0 0 1-2.232 0L2.378 10.6Z" />
                    </svg>
                    AI
                  </span>
                </span>
                <div role="group" aria-labelledby="reg-category-label" className="flex flex-wrap gap-2">
                  {MATERIAL_CATEGORIES.map((cat) => {
                    const isSelected = form.category === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setForm({ ...form, category: cat })}
                        type="button"
                        aria-pressed={isSelected}
                        className={`inline-flex h-10 items-center gap-1.5 px-4 rounded-chip text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected
                            ? "bg-primary text-primary-foreground font-bold border border-primary"
                            : "border border-line bg-surface text-foreground font-medium hover:bg-field"
                          }`}
                      >
                        <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4">{CategoryIcons[cat]}</span>
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Condition Grade */}
              <div>
                <label htmlFor="reg-condition" className="block text-sm font-bold text-foreground mb-2">상태 등급</label>
                <select
                  id="reg-condition"
                  value={form.conditionGrade}
                  onChange={(e) => setForm({ ...form, conditionGrade: e.target.value })}
                  className="w-full min-h-[52px] px-3.5 py-3 border-[1.5px] border-line rounded-field text-[15.5px] bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">선택 안 함</option>
                  {CONDITION_GRADES.map((grade) => (
                    <option key={grade.value} value={grade.value}>
                      {grade.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="reg-description" className="flex items-center gap-2 text-sm font-bold text-foreground mb-2">
                  상세 설명
                  <span className="inline-flex items-center gap-1 text-[11px] bg-accent text-accent-foreground px-2 py-0.5 rounded-chip font-bold">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="w-3 h-3"
                    >
                      <path d="M7.628 1.099a.75.75 0 0 1 .744 0l5.25 3a.75.75 0 0 1 0 1.302l-5.25 3a.75.75 0 0 1-.744 0l-5.25-3a.75.75 0 0 1 0-1.302l5.25-3Z" />
                      <path d="m2.57 7.24-.192.11a.75.75 0 0 0 0 1.302l5.25 3a.75.75 0 0 0 .744 0l5.25 3a.75.75 0 0 0 0-1.303l-.192-.11-4.314 2.465a2.25 2.25 0 0 1-2.232 0L2.57 7.239Z" />
                      <path d="m2.378 10.6-.192.11a.75.75 0 0 0 0 1.302l5.25 3a.75.75 0 0 0 .744 0l5.25-3a.75.75 0 0 0 0-1.303l-.192-.11-4.314 2.465a2.25 2.25 0 0 1-2.232 0L2.378 10.6Z" />
                    </svg>
                    AI
                  </span>
                </label>
                <textarea
                  id="reg-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full p-3 border border-border rounded-field text-base leading-relaxed h-28 resize-none bg-card focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              {/* Price */}
              <div>
                <label htmlFor="reg-price" className="flex items-center gap-2 text-sm font-bold text-foreground mb-2">
                  가격
                  <span className="inline-flex items-center gap-1 text-[11px] bg-accent text-accent-foreground px-2 py-0.5 rounded-chip font-bold">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="w-3 h-3"
                    >
                      <path d="M7.628 1.099a.75.75 0 0 1 .744 0l5.25 3a.75.75 0 0 1 0 1.302l-5.25 3a.75.75 0 0 1-.744 0l-5.25-3a.75.75 0 0 1 0-1.302l5.25-3Z" />
                      <path d="m2.57 7.24-.192.11a.75.75 0 0 0 0 1.302l5.25 3a.75.75 0 0 0 .744 0l5.25 3a.75.75 0 0 0 0-1.303l-.192-.11-4.314 2.465a2.25 2.25 0 0 1-2.232 0L2.57 7.239Z" />
                      <path d="m2.378 10.6-.192.11a.75.75 0 0 0 0 1.302l5.25 3a.75.75 0 0 0 .744 0l5.25-3a.75.75 0 0 0 0-1.303l-.192-.11-4.314 2.465a2.25 2.25 0 0 1-2.232 0L2.378 10.6Z" />
                    </svg>
                    AI
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="reg-price"
                    type="text"
                    value={form.price}
                    inputMode="numeric"
                    onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, "") })}
                    className="w-full min-h-[52px] px-3.5 py-3 border-[1.5px] border-line rounded-field text-lg font-bold text-foreground num bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                    원
                  </span>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label htmlFor="reg-quantity" className="block text-sm font-bold text-foreground mb-2">수량</label>
                <div className="flex gap-2">
                  <input
                    id="reg-quantity"
                    type="text"
                    inputMode="numeric"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\D/g, "") })}
                    className="flex-1 min-w-0 min-h-[52px] px-3.5 py-3 border-[1.5px] border-line rounded-field text-[15.5px] num bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                  <select
                    aria-label="수량 단위"
                    value={form.quantityUnit}
                    onChange={(e) => setForm({ ...form, quantityUnit: e.target.value })}
                    className="w-28 min-h-[52px] px-3.5 py-3 border-[1.5px] border-line rounded-field text-[15.5px] bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    {QUANTITY_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* AI Market Price Analysis */}
              {marketPrice && marketPrice.max > 0 && (
              <div className="bg-canvas rounded-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                    stroke="currentColor"
                    className="w-5 h-5 text-muted-foreground"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"
                    />
                  </svg>
                  <h4 className="font-bold text-sm text-foreground">AI 시세 분석</h4>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="h-2 bg-line-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.min(100, Math.max(0, ((Number(form.price) - marketPrice.min) / (marketPrice.max - marketPrice.min)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Price points */}
                <div className="flex justify-between text-xs mb-2">
                  <div className="text-center">
                    <div className="text-muted-foreground">최저가</div>
                    <div className="font-bold text-foreground num">
                      {marketPrice.min.toLocaleString()}
                      <span className="text-muted-foreground font-medium">원</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground">적정가</div>
                    <div className="font-bold text-olive-tx tabular">
                      {marketPrice.ideal.toLocaleString()}
                      <span className="text-muted-foreground font-medium">원</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground">최고가</div>
                    <div className="font-bold text-foreground num">
                      {marketPrice.max.toLocaleString()}
                      <span className="text-muted-foreground font-medium">원</span>
                    </div>
                  </div>
                </div>

                {marketPrice.similarCount > 0 && (
                <p className="text-xs text-muted-foreground text-center tabular">
                  유사 매물 {marketPrice.similarCount}건 기준
                </p>
                )}
              </div>
              )}

              {/* Trade Method */}
              <div>
                <span id="reg-trade-label" className="block text-sm font-bold text-foreground mb-2">거래 방식</span>
                <div role="group" aria-labelledby="reg-trade-label" className="flex gap-2">
                  {TRADE_METHOD_OPTIONS.map((method) => {
                    const isSelected = form.tradeMethod === method.value;
                    return (
                      <button
                        key={method.value}
                        onClick={() => setForm({ ...form, tradeMethod: method.value })}
                        type="button"
                        aria-pressed={isSelected}
                        className={`flex-1 min-h-[48px] rounded-field text-sm border-[1.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected
                            ? "border-primary bg-accent text-accent-foreground font-bold"
                            : "border-line bg-surface text-foreground font-medium hover:bg-field"
                          }`}
                      >
                        {method.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Location */}
              <div>
                <label htmlFor="reg-location" className="block text-sm font-bold text-foreground mb-2">위치 (시도)</label>
                <select
                  id="reg-location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full min-h-[52px] px-3.5 py-3 border-[1.5px] border-line rounded-field text-[15.5px] bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">선택 안 함</option>
                  {LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-btn border border-line bg-surface px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <svg {...ICON_PROPS} className="w-4 h-4" aria-hidden="true">
                    <path d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  현재 위치 사용
                </button>
                {geoMessage && <p className="mt-1.5 text-xs text-muted-foreground">{geoMessage}</p>}
              </div>

              {/* Submit Button — 폼 흐름 안에 두어 항상 스크롤로 도달·노출 */}
              <button
                onClick={handleSubmit}
                disabled={isUploading || isSubmitting || !form.title.trim() || !form.price}
                className="w-full min-h-[56px] bg-primary text-primary-foreground rounded-card text-base font-bold transition-colors hover:bg-primary-dark active:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {isUploading || isSubmitting ? "등록 중..." : "등록하기"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const ROUTE_BUTTON_BASE =
  "flex-1 min-h-[48px] rounded-field border-[1.5px] px-2 text-[13px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function EvidenceChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-chip border border-line bg-surface px-2.5 py-1 text-xs font-medium text-foreground tabular">
      {children}
    </span>
  );
}

// 모듈 0 · 처분 경로 판별 게이트: 판정 근거(실제 조회 수치)와 3-Way 경로 재지정
function DisposalGateCard({
  advisory,
  busy,
  showScrapReasons,
  routeError,
  onRouteClick,
  onReason,
}: {
  advisory: AiDisposalEvaluation;
  busy: boolean;
  showScrapReasons: boolean;
  routeError: string | null;
  onRouteClick: (route: DisposalRoute) => void;
  onReason: (reason: string) => void;
}) {
  const ev = advisory.evidence;
  const reuseBlocked = !advisory.canOverrideToReuse;
  return (
    <section aria-labelledby="disposal-gate-title" className="mb-6 rounded-card bg-canvas p-4">
      <span className="inline-flex rounded-chip bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">
        모듈 0 · 처분 경로 판별 게이트
      </span>
      <h2 id="disposal-gate-title" className="mt-2 text-base font-extrabold text-foreground">
        {advisory.headline}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{advisory.reasoning}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ev.conditionGrade && <EvidenceChip>상태 등급 {ev.conditionGrade}</EvidenceChip>}
        {ev.category && <EvidenceChip>공종 {ev.category}</EvidenceChip>}
        <EvidenceChip>유사 매물 {ev.similarActiveCount + ev.similarSoldCount}건</EvidenceChip>
        <EvidenceChip>체결 실적 {ev.completedTradeCount}건</EvidenceChip>
        {ev.recyclableMaterial && <EvidenceChip>소재 가치: {ev.recyclableMaterial}</EvidenceChip>}
      </div>

      <div role="group" aria-label="처분 경로 선택" className="mt-4 flex gap-2">
        {DISPOSAL_ROUTES.map((route) => {
          const isSelected = advisory.selectedRoute === route.value;
          return (
            <button
              key={route.value}
              type="button"
              aria-pressed={isSelected}
              disabled={busy || (route.value === "REUSE" && reuseBlocked)}
              onClick={() => onRouteClick(route.value)}
              className={`${ROUTE_BUTTON_BASE} ${isSelected
                ? "border-primary bg-accent text-accent-foreground font-bold"
                : "border-line bg-surface text-foreground font-medium hover:bg-field active:bg-field"
                }`}
            >
              {route.label}
              {advisory.recommendedRoute === route.value && (
                <span className="mt-0.5 block text-[11px] font-bold text-accent-foreground">AI 판정</span>
              )}
            </button>
          );
        })}
      </div>

      {reuseBlocked && (
        <p className="mt-2 text-xs font-medium text-destructive">
          혼합 건설폐기물은 법적으로 직거래 매물로 등록할 수 없어 직거래 재지정이 불가합니다.
        </p>
      )}

      {showScrapReasons && !reuseBlocked && (
        <div className="mt-3 rounded-field border border-line bg-surface p-3">
          <p id="scrap-reason-label" className="mb-2 text-sm font-bold text-foreground">
            직거래로 바꾸는 사유를 선택해주세요
          </p>
          <div role="group" aria-labelledby="scrap-reason-label" className="flex flex-col gap-2">
            {SCRAP_OVERRIDE_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={busy}
                onClick={() => onReason(reason)}
                className="min-h-[44px] rounded-field border border-line bg-surface px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      )}

      {routeError && (
        <p role="alert" className="mt-2 text-xs font-medium text-destructive">
          {routeError}
        </p>
      )}
    </section>
  );
}

// Recycle/Scrap 경로 안내 — 매물 등록 폼 대신 선별·처리 절차와 공공 채널을 보여준다
function DisposalGuide({ advisory, onReset }: { advisory: AiDisposalEvaluation; onReset: () => void }) {
  const isScrap = advisory.selectedRoute === "SCRAP";
  return (
    <section aria-label={isScrap ? "고철·폐기 처리 안내" : "재활용 연계 안내"} className="mb-6 space-y-4">
      <div
        className={`rounded-card border p-4 text-sm font-medium ${isScrap
          ? "border-destructive/20 bg-destructive/10 text-destructive"
          : "border-olive-bd bg-olive-bg text-olive-tx"
          }`}
      >
        {isScrap
          ? "직거래 매물 등록이 차단되었습니다. 아래 절차로 고철 매각·폐기물 처리를 진행하세요."
          : "직거래 대신 재활용 매각을 권장합니다. 원소재를 분리하면 계근 매입이 쉬워집니다."}
      </div>

      <ol className="space-y-2">
        {advisory.steps.map((text, idx) => (
          <li key={text} className="flex gap-3 rounded-card bg-surface border border-line p-3.5 text-sm leading-relaxed text-foreground">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-field text-xs font-bold num">
              {idx + 1}
            </span>
            {text}
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        {advisory.channels.map((channel) => (
          <div key={channel.name} className="rounded-card bg-canvas p-3.5">
            <p className="text-sm font-bold text-foreground">{channel.name}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{channel.description}</p>
            {channel.url && (
              <a
                href={channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-[44px] items-center text-sm font-bold text-accent-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {channel.url.replace(/^https?:\/\//, "")} 바로가기
              </a>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onReset}
        className="w-full min-h-[52px] rounded-btn bg-field text-sm font-bold text-foreground transition-colors hover:bg-line-2 active:bg-line-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        다른 자재 분석하기
      </button>
    </section>
  );
}

export default function RegisterPage() {
  return (
    <AuthGate title="자재 등록은 로그인 후 이용 가능합니다">
      <RegisterContent />
    </AuthGate>
  );
}
