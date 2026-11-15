import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  MATERIAL_CATEGORIES,
  TRIAGE_MATERIAL_OPTIONS,
  TRIAGE_VOLUME_OPTIONS,
  uploadImageFromUri,
  useCreateTriage,
  type TriageInput,
} from "@repo/core";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Chip } from "../../components/Chip";

const MAX_PHOTOS = 3;
const GRADES = ["상", "중", "하"] as const;

type PickedLocation = { lat: number; lng: number; address?: string };

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

export default function TriageInputScreen() {
  const router = useRouter();
  const { mutateAsync: createTriage, isPending: isDiagnosing } = useCreateTriage();
  const [images, setImages] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [materialKey, setMaterialKey] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [volume, setVolume] = useState<string | null>(null);
  const [weightText, setWeightText] = useState("");
  const [specText, setSpecText] = useState("");
  const [labelText, setLabelText] = useState("");
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // local uri → 업로드된 URL. 진단을 다시 눌러도 같은 사진을 두 번 올리지 않는다.
  const uploadedUrls = useRef<Record<string, string>>({});

  const isBusy = isUploading || isDiagnosing;
  const canSubmit = images.length > 0 || !!category || !!materialKey || specText.trim().length > 0;

  const uploadOnce = async (uri: string): Promise<string> => {
    if (!uploadedUrls.current[uri]) {
      uploadedUrls.current[uri] = await uploadImageFromUri(uri);
    }
    return uploadedUrls.current[uri];
  };

  const appendImage = (uri: string) => {
    setImages((previous) => [...previous, uri].slice(0, MAX_PHOTOS));
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
    if (!result.canceled) appendImage(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "카메라 접근 권한이 필요합니다.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 1 });
    if (!result.canceled) appendImage(result.assets[0].uri);
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
      const current = await Location.getCurrentPositionAsync({});
      const { latitude: lat, longitude: lng } = current.coords;
      const [first] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const address = first
        ? [first.city || first.region, first.district || first.street || first.name].filter(Boolean).join(" ")
        : "";
      setLocation({ lat, lng, address: address || undefined });
    } catch {
      Alert.alert("오류", "위치 정보를 가져오지 못했습니다.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = async () => {
    if (isBusy || !canSubmit) return;
    try {
      let imageUrls: string[] | undefined;
      if (images.length > 0) {
        setIsUploading(true);
        try {
          imageUrls = await Promise.all(images.map(uploadOnce));
        } finally {
          setIsUploading(false);
        }
      }

      const typedWeight = Number(weightText);
      // 빈 값은 undefined로 둔다 — JSON 직렬화에서 빠져 서버 기본값을 쓴다.
      const input: TriageInput = {
        imageUrls,
        category: category ?? undefined,
        materialKey: materialKey ?? undefined,
        conditionGrade: grade ?? undefined,
        weightKg:
          TRIAGE_VOLUME_OPTIONS.find((option) => option.label === volume)?.weightKg ??
          (typedWeight > 0 ? typedWeight : undefined),
        specText: specText.trim() || undefined,
        labelText: labelText.trim() || undefined,
        lat: location?.lat,
        lng: location?.lng,
        locationAddress: location?.address,
      };

      const diagnosis = await createTriage(input);
      if (diagnosis.id) router.replace(`/triage/${diagnosis.id}`);
    } catch (error) {
      Alert.alert(
        "진단 실패",
        statusOf(error) === 429
          ? "오늘 진단 횟수를 모두 사용했습니다. 내일 다시 시도해주세요."
          : "진단에 실패했습니다. 잠시 후 다시 시도해주세요."
      );
    }
  };

  return (
    <ScrollView className="flex-1 bg-paper" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text className="text-[22px] font-extrabold tracking-[-0.6px] text-ink">3초 가치진단</Text>
      <Text className="mt-1 mb-6 text-[14px] leading-[21px] text-ink-2">
        사진·품목·소재·규격 중 하나만 있어도 폐기·고철·직거래 손익을 비교해 드립니다.
      </Text>

      {/* 1. 사진 */}
      <View className="mb-6">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-base font-semibold text-ink">사진</Text>
          <Text className="text-sm tabular-nums text-ink-2">
            {images.length}/{MAX_PHOTOS}
          </Text>
        </View>
        {images.length > 0 ? (
          <View className="mb-3 flex-row gap-2">
            {images.map((image, index) => (
              <View key={`${image}-${index}`} className="relative">
                <Image source={{ uri: image }} className="h-20 w-20 rounded-thumb bg-field" />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`사진 ${index + 1} 삭제`}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() => removeImage(index)}
                  className="absolute right-1 top-1 rounded-full bg-ink/60 px-1.5 py-0.5"
                >
                  <Text className="text-xs font-bold text-surface">X</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        {images.length < MAX_PHOTOS ? (
          <View className="flex-row gap-2">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="사진첩에서 사진 추가"
              onPress={() => void pickImage()}
              className="min-h-[44px] flex-1 items-center justify-center rounded-btn bg-field"
            >
              <Text className="text-[15px] font-semibold text-ink">사진첩</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="카메라로 촬영"
              onPress={() => void takePhoto()}
              className="min-h-[44px] flex-1 items-center justify-center rounded-btn bg-field"
            >
              <Text className="text-[15px] font-semibold text-ink">카메라</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* 2. 품목 — 재사용 수요 기준 */}
      <Text className="mb-2 text-base font-semibold text-ink">품목</Text>
      <View className="flex-row flex-wrap gap-2">
        {MATERIAL_CATEGORIES.map((name) => (
          <Chip
            key={name}
            label={name}
            selected={category === name}
            onPress={() => setCategory((current) => (current === name ? null : name))}
          />
        ))}
      </View>
      <Text className="mt-1 mb-6 text-xs text-ink-2">고르지 않으면 메모에서 추정합니다.</Text>

      {/* 3. 소재 — 고철 단가에만 쓴다. 모름이 기본값 */}
      <Text className="mb-2 text-base font-semibold text-ink">소재 (선택)</Text>
      <View className="flex-row flex-wrap gap-2">
        <Chip label="모름" selected={!materialKey} onPress={() => setMaterialKey(null)} />
        {TRIAGE_MATERIAL_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            selected={materialKey === option.key}
            onPress={() => setMaterialKey((current) => (current === option.key ? null : option.key))}
          />
        ))}
      </View>
      <Text className="mt-1 mb-6 text-xs text-ink-2">금속이면 골라주세요. 고철 단가 계산에 씁니다.</Text>

      {/* 4. 상태 */}
      <Text className="mb-2 text-base font-semibold text-ink">상태</Text>
      <View className="mb-6 flex-row flex-wrap gap-2">
        {GRADES.map((value) => (
          <Chip
            key={value}
            label={value}
            selected={grade === value}
            onPress={() => setGrade((current) => (current === value ? null : value))}
          />
        ))}
      </View>

      {/* 5. 물량 — 칩과 직접 입력은 둘 중 하나만 */}
      <Text className="mb-2 text-base font-semibold text-ink">물량</Text>
      <View className="mb-2 flex-row flex-wrap gap-2">
        {TRIAGE_VOLUME_OPTIONS.map((option) => (
          <Chip
            key={option.label}
            label={option.label}
            selected={volume === option.label}
            onPress={() => {
              setVolume((current) => (current === option.label ? null : option.label));
              setWeightText("");
            }}
          />
        ))}
      </View>
      <TextInput
        value={weightText}
        onChangeText={(text) => {
          setWeightText(text.replace(/\D/g, ""));
          setVolume(null);
        }}
        placeholder="직접 입력(kg)"
        placeholderTextColor="#8A92A3"
        keyboardType="numeric"
        accessibilityLabel="중량 직접 입력(kg)"
        className="mb-6 h-12 rounded-field border-[1.5px] border-line bg-surface px-4 text-[15px] text-ink"
      />

      {/* 6. 규격·메모 / 라벨 */}
      <Text className="mb-2 text-base font-semibold text-ink">규격·메모</Text>
      <TextInput
        value={specText}
        onChangeText={setSpecText}
        placeholder="예: 304 스텐 파이프 50A 두 본, 미사용"
        placeholderTextColor="#8A92A3"
        multiline
        accessibilityLabel="규격·메모"
        className="min-h-[88px] rounded-field border-[1.5px] border-line bg-surface px-4 py-3 text-[15px] text-ink"
        style={{ textAlignVertical: "top" }}
      />
      <Text className="mt-1 mb-4 text-xs text-ink-2">키보드 마이크로 말해도 됩니다</Text>
      <Text className="mb-2 text-base font-semibold text-ink">라벨 문구 (선택)</Text>
      <TextInput
        value={labelText}
        onChangeText={setLabelText}
        placeholder="예: KS D 3576"
        placeholderTextColor="#8A92A3"
        accessibilityLabel="라벨 문구"
        className="mb-6 h-12 rounded-field border-[1.5px] border-line bg-surface px-4 text-[15px] text-ink"
      />

      {/* 7. 위치 (선택) */}
      <Text className="mb-2 text-base font-semibold text-ink">위치 (선택)</Text>
      {location ? (
        <Text className="mb-2 text-sm text-ink-2">{location.address || "현재 위치 좌표를 사용합니다"}</Text>
      ) : null}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="현재 위치 사용"
        accessibilityState={{ busy: isLocating }}
        disabled={isLocating}
        onPress={() => void getLocation()}
        className="mb-8 min-h-[44px] items-center justify-center rounded-btn border border-line bg-surface"
      >
        {isLocating ? (
          <ActivityIndicator color="#1E3FCC" />
        ) : (
          <Text className="text-[15px] font-semibold text-ink">현재 위치 사용</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="3초 진단 받기"
        accessibilityState={{ disabled: !canSubmit || isBusy, busy: isBusy }}
        disabled={!canSubmit || isBusy}
        onPress={() => void handleSubmit()}
        className={`min-h-[52px] items-center justify-center rounded-btn bg-primary ${
          !canSubmit || isBusy ? "opacity-50" : ""
        }`}
      >
        <Text className="text-base font-bold text-primary-foreground">
          {isUploading ? "사진 업로드 중…" : isDiagnosing ? "진단 중…" : "3초 진단 받기"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="link"
        onPress={() => router.push("/triage/vault")}
        className="mt-4 min-h-[44px] items-center justify-center"
      >
        <Text className="text-sm font-semibold text-ink-2 underline">내 창고 보관함 보기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
