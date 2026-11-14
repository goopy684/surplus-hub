import { useRef, useState } from "react";
import { View, Text, ScrollView, Image, Alert, ActivityIndicator, TouchableOpacity, Linking } from "react-native";
import { Button, MaterialInput } from "@repo/ui";
import {
  CONDITION_GRADES,
  MATERIAL_CATEGORIES,
  QUANTITY_UNITS,
  TRADE_METHOD_OPTIONS,
  analyzeImage,
  evaluateDisposal,
  overrideDisposalRoute,
  generateDescription,
  suggestPrice,
  useCreateMaterial,
  uploadImageFromUri,
  type AiDisposalEvaluation,
  type AiImageAnalysis,
  type DisposalRoute,
  type MaterialCreateInput,
  type MaterialLocation,
} from "@repo/core";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Chip } from "../../components/Chip";

const INITIAL_FORM = {
  title: "",
  description: "",
  price: "",
  quantity: "",
  quantityUnit: "개" as (typeof QUANTITY_UNITS)[number],
  tradeMethod: "DIRECT" as (typeof TRADE_METHOD_OPTIONS)[number]["value"],
  category: "",
  conditionGrade: "",
};

// 모듈 0 처분 경로 — 직거래(REUSE)일 때만 판매글·시세 LLM과 나머지 사진 업로드를 진행한다
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

// 대표 사진 분석 결과 — 직거래로 재지정될 때 판매글·시세를 지연 생성하는 데 다시 쓴다
type AnalyzedPhoto = { result: AiImageAnalysis; imageUrl: string; category: string; conditionGrade: string };

const getErrorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      response?: { data?: { detail?: string } };
      message?: string;
    };

    if (maybeError.response?.data?.detail) {
      return maybeError.response.data.detail;
    }

    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return "등록 요청 중 오류가 발생했습니다.";
};

export default function RegisterScreen() {
  const router = useRouter();
  const { mutateAsync: createMaterial, isPending: isSubmitting } = useCreateMaterial();
  const [form, setForm] = useState(INITIAL_FORM);
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState<MaterialLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [aiStep, setAiStep] = useState<string | null>(null);
  const [priceHint, setPriceHint] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState<AnalyzedPhoto | null>(null);
  const [advisory, setAdvisory] = useState<AiDisposalEvaluation | null>(null);
  // 판매글·시세는 REUSE로 확정될 때 한 번만 생성한다 (Recycle/Scrap 재지정 시 지연 생성)
  const [listingReady, setListingReady] = useState(false);
  const [isChangingRoute, setIsChangingRoute] = useState(false);
  const [isFillingListing, setIsFillingListing] = useState(false);
  const [showScrapReasons, setShowScrapReasons] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  // local uri → 업로드된 원격 URL. AI 분석과 등록이 같은 사진을 두 번 올리지 않게 한다.
  const uploadedUrls = useRef<Record<string, string>>({});
  const isBusy = isUploading || isSubmitting || aiStep !== null || isChangingRoute;
  // Recycle/Scrap이거나 직거래 판매글을 생성 중이면 등록 폼·버튼을 숨긴다 (AI 미사용 수동 등록은 그대로)
  const showForm = !advisory || (advisory.selectedRoute === "REUSE" && !isFillingListing);

  const uploadOnce = async (uri: string): Promise<string> => {
    if (!uploadedUrls.current[uri]) {
      uploadedUrls.current[uri] = await uploadImageFromUri(uri);
    }
    return uploadedUrls.current[uri];
  };

  const appendImage = (uri: string) => {
    setImages((previous) => [...previous, uri].slice(0, 10));
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "사진첩 접근 권한이 필요합니다.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      appendImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "카메라 접근 권한이 필요합니다.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      appendImage(result.assets[0].uri);
    }
  };

  const removeImage = (index: number) => {
    setImages((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  };

  const getLocation = async () => {
    setIsLocating(true);
    try {
      const Location = require("expo-location") as typeof import("expo-location");

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("권한 필요", "위치 접근 권한이 필요합니다.");
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      const { latitude: lat, longitude: lng } = currentLocation.coords;
      const address = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });

      // 좌표도 함께 보내야 "내 주변" 거리 검색에 잡힌다.
      if (address.length > 0) {
        const firstAddress = address[0];
        setLocation({
          address: `${firstAddress.city || firstAddress.region}, ${firstAddress.street || firstAddress.name}`,
          lat,
          lng,
        });
      } else {
        setLocation({ address: `Lat: ${lat}, Lng: ${lng}`, lat, lng });
      }
    } catch {
      Alert.alert("오류", "위치 정보를 가져오지 못했습니다.");
    } finally {
      setIsLocating(false);
    }
  };

  // 규격 판매글 + 유사 매물 시세 (LLM) — 직거래로 확정된 자재에만 호출
  const fillListing = async (
    { result, imageUrl, category, conditionGrade }: AnalyzedPhoto,
    onStep?: (label: string) => void
  ) => {
    onStep?.("규격 판매글 생성 중");
    const { description } = await generateDescription(result.title, category, imageUrl, {
      tags: result.tags,
      condition: conditionGrade || undefined,
      quantity: Number(form.quantity) || undefined,
      quantityUnit: form.quantityUnit,
    });
    const finalDescription = description || result.description;
    setForm((previous) => ({ ...previous, description: finalDescription }));

    onStep?.("유사 매물 시세 산출 중");
    const suggestion = await suggestPrice(result.title, category, finalDescription);
    if (suggestion.price > 0) {
      setForm((previous) => ({ ...previous, price: String(Math.round(suggestion.price)) }));
    }
    const { min, max } = suggestion.marketPrice;
    setPriceHint(max > 0 ? `AI 참고 시세 ${min.toLocaleString()}~${max.toLocaleString()}원` : null);
    setListingReady(true);
  };

  // 대표 사진 1장만 업로드 → 분석 → 처분 경로 판별. 직거래일 때만 설명·가격을 채운다.
  // 단계별로 바로 반영해 중간에 실패해도 받은 결과는 남긴다.
  const handleAutoFill = async () => {
    if (isBusy || images.length === 0) return;

    setAnalyzed(null);
    setAdvisory(null);
    setListingReady(false);
    setPriceHint(null);
    setShowScrapReasons(false);
    setRouteError(null);

    try {
      setAiStep("사진 업로드 중...");
      const imageUrl = await uploadOnce(images[0]);

      setAiStep("이미지 인식 및 상태·공종 분석 중");
      const analysis = await analyzeImage(imageUrl);
      const category = MATERIAL_CATEGORIES.find((name) => name === analysis.category) ?? "기타";
      const conditionGrade = CONDITION_GRADES.find((grade) => grade.value === analysis.condition)?.value ?? "";
      setForm((previous) => ({ ...previous, title: analysis.title, category, conditionGrade }));

      setAiStep("처분 경로 1차 판별 중");
      const evaluation = await evaluateDisposal({
        title: analysis.title,
        category: analysis.category,
        condition: analysis.condition,
        tags: analysis.tags,
        materialType: analysis.materialType,
        damageLevel: analysis.damageLevel,
        isMixedWaste: analysis.isMixedWaste,
        recyclableMaterial: analysis.recyclableMaterial,
      });
      const target: AnalyzedPhoto = { result: analysis, imageUrl, category, conditionGrade };
      setAnalyzed(target);
      setAdvisory(evaluation);

      if (evaluation.selectedRoute === "REUSE") {
        await fillListing(target, setAiStep);
      }
    } catch (error) {
      Alert.alert("AI 자동 채우기 실패", `직접 입력해 주세요.\n${getErrorMessage(error)}`);
    } finally {
      setAiStep(null);
    }
  };

  // 판매자 경로 재지정 — 서버에 기록한 뒤, 직거래로 바뀌면 판매글·시세를 그때 생성한다
  const changeRoute = async (route: DisposalRoute, reason?: string) => {
    if (!advisory || route === advisory.selectedRoute) return;
    setRouteError(null);
    setIsChangingRoute(true);
    try {
      const updated = await overrideDisposalRoute(advisory.advisoryId, route, reason);
      setAdvisory(updated);
      setShowScrapReasons(false);
      if (updated.selectedRoute === "REUSE" && !listingReady && analyzed) {
        setIsFillingListing(true);
        try {
          await fillListing(analyzed);
        } catch (error) {
          Alert.alert("AI 자동 채우기 실패", `직접 입력해 주세요.\n${getErrorMessage(error)}`);
        } finally {
          setIsFillingListing(false);
        }
      }
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setRouteError(typeof detail === "string" ? detail : "경로를 변경하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setIsChangingRoute(false);
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

  const resetAnalysis = () => {
    setImages([]);
    setForm(INITIAL_FORM);
    setAnalyzed(null);
    setAdvisory(null);
    setListingReady(false);
    setPriceHint(null);
    setShowScrapReasons(false);
    setRouteError(null);
  };

  const isPositiveNumber = Number(form.price) > 0;
  const isPositiveInteger = Number.isInteger(Number(form.quantity)) && Number(form.quantity) > 0;
  const isFormValid =
    form.title.trim().length > 0 &&
    form.description.trim().length > 0 &&
    isPositiveNumber &&
    isPositiveInteger;

  const handleSubmit = async () => {
    if (isBusy) return;

    if (!isFormValid) {
      Alert.alert("입력 확인", "제목, 상세 설명, 가격, 수량(정수)을 입력해주세요.");
      return;
    }

    // Local file:// URIs are meaningless on other devices — upload first, send the remote URLs.
    let photoUrls: string[] | undefined;
    if (images.length > 0) {
      setIsUploading(true);
      try {
        photoUrls = await Promise.all(images.map(uploadOnce));
      } catch (error) {
        Alert.alert("사진 업로드 실패", `사진을 업로드하지 못해 등록을 중단했습니다.\n${getErrorMessage(error)}`);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    const payload: MaterialCreateInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      quantity: Number(form.quantity),
      quantityUnit: form.quantityUnit,
      tradeMethod: form.tradeMethod,
      category: form.category || undefined,
      conditionGrade: form.conditionGrade || undefined,
      location: location ?? { address: "위치 미정" },
      photoUrls,
      // 백엔드가 판별 결과를 다시 검증한다 (AI 미사용 시 생략)
      ...(advisory ? { advisoryId: advisory.advisoryId } : {}),
    };

    try {
      await createMaterial(payload);

      Alert.alert("등록 완료", "자재가 성공적으로 등록되었습니다.", [
        { text: "확인", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert("등록 실패", getErrorMessage(error));
    }
  };

  return (
    <ScrollView className="flex-1 bg-paper p-4">
      <Text className="mb-6 text-[22px] font-extrabold tracking-[-0.6px] text-foreground">자재 등록하기</Text>

      <View className="mb-8 rounded-card border border-line-2 bg-surface p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-base font-semibold text-foreground">사진 등록</Text>
          <Text className="text-sm text-muted-foreground">{images.length}/10</Text>
        </View>

        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            <View className="flex-row">
              {images.map((image, index) => (
                <View key={`${image}-${index}`} className="relative mr-2">
                  <Image source={{ uri: image }} className="h-20 w-20 rounded-thumb bg-muted" />
                  <TouchableOpacity
                    onPress={() => removeImage(index)}
                    className="absolute right-1 top-1 rounded-full bg-foreground/60 px-1.5 py-0.5"
                  >
                    <Text className="text-xs font-bold text-primary-foreground">X</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {images.length < 10 ? (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button title="갤러리" onPress={pickImage} />
            </View>
            <View className="flex-1">
              <Button title="카메라" onPress={takePhoto} />
            </View>
          </View>
        ) : null}

        {images.length > 0 ? (
          <TouchableOpacity
            onPress={handleAutoFill}
            disabled={isBusy}
            className="mt-3 h-12 flex-row items-center justify-center rounded-btn border border-primary bg-accent"
          >
            {aiStep ? <ActivityIndicator color="#1E3FCC" className="mr-2" /> : null}
            <Text className="text-base font-bold text-primary">{aiStep ?? "AI 자동 채우기"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {advisory ? (
        <>
          <DisposalGateCard
            advisory={advisory}
            busy={isChangingRoute}
            showScrapReasons={showScrapReasons}
            routeError={routeError}
            onRouteClick={handleRouteClick}
            onReason={(reason) => void changeRoute("REUSE", reason)}
          />
          {advisory.selectedRoute !== "REUSE" ? <DisposalGuide advisory={advisory} onReset={resetAnalysis} /> : null}
          {advisory.selectedRoute === "REUSE" && isFillingListing ? (
            <View
              accessibilityLiveRegion="polite"
              className="mb-8 flex-row items-center gap-3 rounded-card bg-canvas p-4"
            >
              <ActivityIndicator color="#1E3FCC" />
              <Text className="flex-1 text-sm text-foreground">규격 판매글과 유사 매물 시세를 생성하는 중입니다</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {showForm ? (
        <>
          <View className="mb-8 rounded-card border border-line-2 bg-surface p-4">
            <Text className="mb-3 text-base font-semibold text-foreground">상세 정보</Text>

            <MaterialInput
              label="제목 *"
              value={form.title}
              onChangeText={(text: string) => setForm({ ...form, title: text })}
              placeholder="자재명과 간단한 설명을 입력하세요"
            />

            <Text className="mb-2 text-sm font-medium text-muted-foreground">카테고리</Text>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {MATERIAL_CATEGORIES.map((category) => (
                <Chip
                  key={category}
                  label={category}
                  selected={form.category === category}
                  onPress={() => setForm({ ...form, category })}
                />
              ))}
            </View>

            <Text className="mb-2 text-sm font-medium text-muted-foreground">상태 등급</Text>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {CONDITION_GRADES.map((grade) => (
                <Chip
                  key={grade.value}
                  label={grade.label}
                  selected={form.conditionGrade === grade.value}
                  onPress={() => setForm({ ...form, conditionGrade: grade.value })}
                />
              ))}
            </View>

            <MaterialInput
              label="상세 설명 *"
              value={form.description}
              onChangeText={(text: string) => setForm({ ...form, description: text })}
              placeholder="자재 상태, 보관 장소, 거래 조건 등을 자세히 적어주세요"
              multiline
            />

            <MaterialInput
              label="가격 *"
              value={form.price}
              onChangeText={(text: string) => setForm({ ...form, price: text.replace(/\D/g, "") })}
              placeholder="0"
              keyboardType="numeric"
            />
            {priceHint ? <Text className="-mt-2 mb-4 text-[13px] font-medium text-primary">{priceHint}</Text> : null}

            <MaterialInput
              label="수량 *"
              value={form.quantity}
              onChangeText={(text: string) => setForm({ ...form, quantity: text.replace(/\D/g, "") })}
              placeholder="0"
              keyboardType="numeric"
            />

            <Text className="mb-2 text-sm font-medium text-muted-foreground">수량 단위</Text>
            <View className="mb-2 flex-row flex-wrap gap-2">
              {QUANTITY_UNITS.map((unit) => (
                <Chip
                  key={unit}
                  label={unit}
                  selected={form.quantityUnit === unit}
                  onPress={() => setForm({ ...form, quantityUnit: unit })}
                />
              ))}
            </View>
          </View>

          <View className="mb-8 rounded-card border border-line-2 bg-surface p-4">
            <Text className="mb-3 text-base font-semibold text-foreground">거래 정보</Text>

            <Text className="mb-2 text-sm font-medium text-muted-foreground">거래 방식</Text>
            {TRADE_METHOD_OPTIONS.map(({ value, label }) => {
              const selected = form.tradeMethod === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setForm({ ...form, tradeMethod: value })}
                  className="mb-2 flex-row items-center"
                >
                  <View
                    className={`mr-2 h-5 w-5 items-center justify-center rounded-full border-2 ${
                      selected ? "border-primary" : "border-line"
                    }`}
                  >
                    {selected ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                  </View>
                  <Text className="text-base text-foreground">{label}</Text>
                </TouchableOpacity>
              );
            })}

            {location ? (
              <View className="mt-3 rounded-field border-[1.5px] border-line bg-surface p-3">
                <Text className="text-sm text-muted-foreground">{location.address}</Text>
              </View>
            ) : null}

            <TouchableOpacity onPress={getLocation} className="mt-3 flex-row items-center">
              {isLocating ? (
                <ActivityIndicator color="#1E3FCC" />
              ) : (
                <Text className="text-base font-semibold text-primary">현재 위치로 설정</Text>
              )}
            </TouchableOpacity>
          </View>

          <View className="mb-10">
            <Button
              title={isUploading ? "사진 업로드 중..." : isSubmitting ? "등록 중..." : "등록"}
              onPress={handleSubmit}
            />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function EvidenceChip({ label }: { label: string }) {
  return (
    <View className="rounded-chip border border-line bg-surface px-2.5 py-1">
      <Text className="text-xs font-medium text-foreground">{label}</Text>
    </View>
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
    <View className="mb-8 rounded-card bg-canvas p-4">
      <View className="self-start rounded-chip bg-accent px-2.5 py-0.5">
        <Text className="text-[11px] font-bold text-accent-foreground">모듈 0 · 처분 경로 판별 게이트</Text>
      </View>
      <Text accessibilityRole="header" className="mt-2 text-base font-extrabold text-foreground">
        {advisory.headline}
      </Text>
      <Text className="mt-1 text-sm leading-5 text-muted-foreground">{advisory.reasoning}</Text>

      <View className="mt-3 flex-row flex-wrap gap-1.5">
        {ev.conditionGrade ? <EvidenceChip label={`상태 등급 ${ev.conditionGrade}`} /> : null}
        {ev.category ? <EvidenceChip label={`공종 ${ev.category}`} /> : null}
        <EvidenceChip label={`유사 매물 ${ev.similarActiveCount + ev.similarSoldCount}건`} />
        <EvidenceChip label={`체결 실적 ${ev.completedTradeCount}건`} />
        {ev.recyclableMaterial ? <EvidenceChip label={`소재 가치: ${ev.recyclableMaterial}`} /> : null}
      </View>

      <View className="mt-4 flex-row gap-2">
        {DISPOSAL_ROUTES.map((route) => {
          const selected = advisory.selectedRoute === route.value;
          const disabled = busy || (route.value === "REUSE" && reuseBlocked);
          return (
            <TouchableOpacity
              key={route.value}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onRouteClick(route.value)}
              className={`min-h-[48px] flex-1 items-center justify-center rounded-field border-[1.5px] px-2 py-1.5 ${
                selected ? "border-primary bg-accent" : "border-line bg-surface"
              } ${disabled ? "opacity-50" : ""}`}
            >
              <Text
                className={`text-center text-[13px] ${
                  selected ? "font-bold text-accent-foreground" : "font-medium text-foreground"
                }`}
              >
                {route.label}
              </Text>
              {advisory.recommendedRoute === route.value ? (
                <Text className="mt-0.5 text-[11px] font-bold text-accent-foreground">AI 판정</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {reuseBlocked ? (
        <Text className="mt-2 text-xs font-medium text-destructive">
          혼합 건설폐기물은 법적으로 직거래 매물로 등록할 수 없어 직거래 재지정이 불가합니다.
        </Text>
      ) : null}

      {showScrapReasons && !reuseBlocked ? (
        <View className="mt-3 rounded-field border border-line bg-surface p-3">
          <Text className="mb-2 text-sm font-bold text-foreground">직거래로 바꾸는 사유를 선택해주세요</Text>
          <View className="gap-2">
            {SCRAP_OVERRIDE_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => onReason(reason)}
                className={`min-h-[44px] justify-center rounded-field border border-line bg-surface px-3 ${
                  busy ? "opacity-50" : ""
                }`}
              >
                <Text className="text-sm font-medium text-foreground">{reason}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {routeError ? (
        <Text accessibilityRole="alert" className="mt-2 text-xs font-medium text-destructive">
          {routeError}
        </Text>
      ) : null}
    </View>
  );
}

// Recycle/Scrap 경로 안내 — 매물 등록 폼 대신 선별·처리 절차와 공공 채널을 보여준다
function DisposalGuide({ advisory, onReset }: { advisory: AiDisposalEvaluation; onReset: () => void }) {
  const isScrap = advisory.selectedRoute === "SCRAP";
  return (
    <View className="mb-8 gap-4">
      <View
        className={`rounded-card border p-4 ${
          isScrap ? "border-destructive/20 bg-destructive/10" : "border-olive-bd bg-olive-bg"
        }`}
      >
        <Text className={`text-sm font-medium ${isScrap ? "text-destructive" : "text-olive-tx"}`}>
          {isScrap
            ? "직거래 매물 등록이 차단되었습니다. 아래 절차로 고철 매각·폐기물 처리를 진행하세요."
            : "직거래 대신 재활용 매각을 권장합니다. 원소재를 분리하면 계근 매입이 쉬워집니다."}
        </Text>
      </View>

      <View className="gap-2">
        {advisory.steps.map((text, index) => (
          <View key={`${index}-${text}`} className="flex-row gap-3 rounded-card border border-line bg-surface p-3.5">
            <View className="h-6 w-6 items-center justify-center rounded-full bg-field">
              <Text className="text-xs font-bold text-foreground">{index + 1}</Text>
            </View>
            <Text className="flex-1 text-sm leading-5 text-foreground">{text}</Text>
          </View>
        ))}
      </View>

      <View className="gap-2">
        {advisory.channels.map((channel) => {
          const url = channel.url;
          return (
            <View key={channel.name} className="rounded-card bg-canvas p-3.5">
              <Text className="text-sm font-bold text-foreground">{channel.name}</Text>
              <Text className="mt-0.5 text-xs leading-5 text-muted-foreground">{channel.description}</Text>
              {url ? (
                <TouchableOpacity
                  accessibilityRole="link"
                  onPress={() =>
                    Linking.openURL(url).catch(() => Alert.alert("오류", "링크를 열지 못했습니다."))
                  }
                  className="mt-1 min-h-[44px] justify-center"
                >
                  <Text className="text-sm font-bold text-accent-foreground">
                    {url.replace(/^https?:\/\//, "")} 바로가기
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        onPress={onReset}
        className="min-h-[52px] items-center justify-center rounded-btn bg-field"
      >
        <Text className="text-sm font-bold text-foreground">다른 자재 분석하기</Text>
      </TouchableOpacity>
    </View>
  );
}
