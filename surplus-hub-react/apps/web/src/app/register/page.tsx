"use client";

import {
  useCreateMaterial,
  analyzeImage,
  generateDescription,
  suggestPrice,
  uploadImage,
  AiPriceSuggestion,
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
  "이미지 인식 중",
  "카테고리 분류 중",
  "설명 생성 중",
  "시세 분석 중",
] as const;

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
        if (!UPLOAD_IMAGE_TYPES.includes(file.type) || file.size > MAX_UPLOAD_MB * 1024 * 1024) {
          rejected.push(file.name);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
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

  const handleAIAnalysis = async () => {
    setStep("ai-analyzing");
    setAnalysisStep(0);
    setAiError(null);

    try {
      // Step 1: 이미지 인식
      setAnalysisStep(0);
      const firstImage = images[0]?.url ?? "";
      const imageAnalysis = await analyzeImage(firstImage, keyword || undefined);

      // Step 2: 카테고리 분류 완료
      setAnalysisStep(1);

      // Step 3: 설명 생성
      setAnalysisStep(2);
      const descResult = await generateDescription(
        imageAnalysis.title,
        imageAnalysis.category,
        firstImage,
        { tags: imageAnalysis.tags, condition: imageAnalysis.condition }
      );

      // Step 4: 시세 분석
      setAnalysisStep(3);
      const priceResult = await suggestPrice(
        imageAnalysis.title,
        imageAnalysis.category,
        descResult.description
      );

      // 카테고리를 업종 카테고리와 매칭 (백엔드는 이름 일치로 필터하므로 못 찾으면 기타)
      const matchedCategory =
        MATERIAL_CATEGORIES.find(
          (cat) => imageAnalysis.category.includes(cat) || cat.includes(imageAnalysis.category)
        ) ?? "기타";
      const matchedGrade = CONDITION_GRADES.some((g) => g.value === imageAnalysis.condition)
        ? imageAnalysis.condition ?? ""
        : "";

      setMarketPrice(priceResult.marketPrice);
      setForm({
        title: imageAnalysis.title,
        category: matchedCategory,
        description: descResult.description,
        price: priceResult.price.toString(),
        quantity: "1",
        quantityUnit: "개",
        tradeMethod: "DIRECT",
        conditionGrade: matchedGrade,
        location: "",
      });
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
      photoUrls = await Promise.all(images.map((img) => uploadImage(img.file)));
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
        {step === "ai-result" && (
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

                {marketPrice.recentTrades > 0 && (
                <p className="text-xs text-muted-foreground text-center tabular">
                  최근 30일 유사 거래 {marketPrice.recentTrades}건 기준
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

export default function RegisterPage() {
  return (
    <AuthGate title="자재 등록은 로그인 후 이용 가능합니다">
      <RegisterContent />
    </AuthGate>
  );
}
