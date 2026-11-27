import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  MATERIAL_CATEGORIES,
  QUANTITY_UNITS,
  WANTED_EXPIRY_OPTIONS_DAYS,
  WANTED_RADIUS_OPTIONS_KM,
  useCreateWanted,
  validateWantedInput,
  type WantedCreateInput,
} from "@repo/core";
import { useRouter } from "expo-router";
import { Chip } from "../../components/Chip";

const INPUT_CLASS = "h-12 rounded-field border-[1.5px] border-line bg-surface px-4 text-[15px] text-ink";

const toOptionalNumber = (value: string): number | undefined => (value.trim() ? Number(value) : undefined);

export default function WantedNewScreen() {
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
  const [isLocating, setIsLocating] = useState(false);
  const [radiusKm, setRadiusKm] = useState(30);
  const [expiresInDays, setExpiresInDays] = useState(30);

  // 3초 진단과 같은 방식 — 좌표를 받고 역지오코딩한 주소로 지역 칸을 채운다(수정 가능)
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
      setCoords({ lat, lng });
      const [first] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const resolved = first
        ? [first.city || first.region, first.district || first.street || first.name].filter(Boolean).join(" ")
        : "";
      if (resolved) setAddress((previous) => previous || resolved);
    } catch {
      Alert.alert("오류", "위치 정보를 가져오지 못했습니다.");
    } finally {
      setIsLocating(false);
    }
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
      Alert.alert("입력 확인", invalid);
      return;
    }

    try {
      const wanted = await createWanted(input as WantedCreateInput);
      router.replace(`/wanted/${wanted.id}`);
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
      const detail = response?.data?.detail;
      Alert.alert(
        "등록 실패",
        response?.status === 429
          ? "구매 요청은 하루 10건, 진행 중 20건까지 올릴 수 있습니다."
          : response?.status === 400 && typeof detail === "string"
            ? detail
            : "등록에 실패했습니다. 잠시 후 다시 시도해주세요."
      );
    }
  };

  return (
    <ScrollView className="flex-1 bg-paper" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text className="mb-6 text-[14px] leading-[21px] text-ink-2">
        찾는 자재를 올려두면 근처에 맞는 매물이 등록될 때 알려드립니다.
      </Text>

      <Text className="mb-2 text-base font-semibold text-ink">제목</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        maxLength={100}
        placeholder="예: SUS304 파이프 50A"
        placeholderTextColor="#8A92A3"
        accessibilityLabel="제목"
        className={`mb-6 ${INPUT_CLASS}`}
      />

      <Text className="mb-2 text-base font-semibold text-ink">품목</Text>
      <View className="mb-6 flex-row flex-wrap gap-2">
        {MATERIAL_CATEGORIES.map((name) => (
          <Chip key={name} label={name} selected={category === name} onPress={() => setCategory(name)} />
        ))}
      </View>

      <Text className="mb-2 text-base font-semibold text-ink">수량 (선택)</Text>
      <TextInput
        value={quantity}
        onChangeText={(text) => setQuantity(text.replace(/\D/g, ""))}
        placeholder="예: 20"
        placeholderTextColor="#8A92A3"
        keyboardType="numeric"
        accessibilityLabel="수량"
        className={`mb-2 ${INPUT_CLASS}`}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6" contentContainerStyle={{ gap: 8 }}>
        {QUANTITY_UNITS.map((unit) => (
          <Chip key={unit} label={unit} selected={quantityUnit === unit} onPress={() => setQuantityUnit(unit)} />
        ))}
      </ScrollView>

      <Text className="mb-2 text-base font-semibold text-ink">최대 예산 (선택, 원)</Text>
      <TextInput
        value={budget}
        onChangeText={(text) => setBudget(text.replace(/\D/g, ""))}
        placeholder="예: 300000"
        placeholderTextColor="#8A92A3"
        keyboardType="numeric"
        accessibilityLabel="최대 예산"
        className={`mb-6 ${INPUT_CLASS}`}
      />

      <Text className="mb-2 text-base font-semibold text-ink">설명 (선택)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        maxLength={2000}
        multiline
        placeholder="규격·상태·납기 등 판매자가 알아야 할 내용을 적어주세요"
        placeholderTextColor="#8A92A3"
        accessibilityLabel="설명"
        className="mb-6 min-h-[88px] rounded-field border-[1.5px] border-line bg-surface px-4 py-3 text-[15px] text-ink"
        style={{ textAlignVertical: "top" }}
      />

      <Text className="mb-2 text-base font-semibold text-ink">지역</Text>
      <TextInput
        value={address}
        onChangeText={setAddress}
        maxLength={200}
        placeholder="예: 경기 안산시 단원구"
        placeholderTextColor="#8A92A3"
        accessibilityLabel="지역"
        className={`mb-2 ${INPUT_CLASS}`}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="현재 위치 사용"
        accessibilityState={{ busy: isLocating }}
        disabled={isLocating}
        onPress={() => void getLocation()}
        className="min-h-[44px] items-center justify-center rounded-btn border border-line bg-surface"
      >
        {isLocating ? (
          <ActivityIndicator color="#1E3FCC" />
        ) : (
          <Text className="text-[15px] font-semibold text-ink">{coords ? "현재 위치 추가됨" : "현재 위치 사용"}</Text>
        )}
      </TouchableOpacity>
      <Text className="mt-1 mb-6 text-xs text-ink-2">현재 위치를 기준으로 반경 안의 매물을 찾습니다.</Text>

      <Text className="mb-2 text-base font-semibold text-ink">찾는 반경</Text>
      <View className="mb-6 flex-row flex-wrap gap-2">
        {WANTED_RADIUS_OPTIONS_KM.map((km) => (
          <Chip key={km} label={`${km}km`} selected={radiusKm === km} onPress={() => setRadiusKm(km)} />
        ))}
      </View>

      <Text className="mb-2 text-base font-semibold text-ink">마감 기간</Text>
      <View className="mb-8 flex-row flex-wrap gap-2">
        {WANTED_EXPIRY_OPTIONS_DAYS.map((days) => (
          <Chip key={days} label={`${days}일`} selected={expiresInDays === days} onPress={() => setExpiresInDays(days)} />
        ))}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="구해요 등록하기"
        accessibilityState={{ disabled: isPending, busy: isPending }}
        disabled={isPending}
        onPress={() => void handleSubmit()}
        className={`min-h-[52px] items-center justify-center rounded-btn bg-primary ${isPending ? "opacity-50" : ""}`}
      >
        <Text className="text-base font-bold text-primary-foreground">{isPending ? "등록 중…" : "구해요 등록하기"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
