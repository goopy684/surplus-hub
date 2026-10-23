import { useRef, useState } from "react";
import { View, Text, ScrollView, Image, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { Button, MaterialInput } from "@repo/ui";
import {
  CONDITION_GRADES,
  MATERIAL_CATEGORIES,
  QUANTITY_UNITS,
  TRADE_METHOD_OPTIONS,
  analyzeImage,
  generateDescription,
  suggestPrice,
  useCreateMaterial,
  uploadImageFromUri,
  type MaterialCreateInput,
  type MaterialLocation,
} from "@repo/core";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Chip } from "../../components/Chip";

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
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    quantity: "",
    quantityUnit: "개" as (typeof QUANTITY_UNITS)[number],
    tradeMethod: "DIRECT" as (typeof TRADE_METHOD_OPTIONS)[number]["value"],
    category: "",
    conditionGrade: "",
  });
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState<MaterialLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [aiStep, setAiStep] = useState<string | null>(null);
  const [priceHint, setPriceHint] = useState<string | null>(null);
  // local uri → 업로드된 원격 URL. AI 분석과 등록이 같은 사진을 두 번 올리지 않게 한다.
  const uploadedUrls = useRef<Record<string, string>>({});
  const isBusy = isUploading || isSubmitting || aiStep !== null;

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

  // 사진 1장 → 카테고리·등급·설명·가격 자동 채우기. 단계별로 바로 반영해 중간에 실패해도 받은 결과는 남긴다.
  const handleAutoFill = async () => {
    if (isBusy || images.length === 0) return;

    try {
      setAiStep("사진 업로드 중...");
      const imageUrl = await uploadOnce(images[0]);

      setAiStep("사진 분석 중...");
      const analysis = await analyzeImage(imageUrl);
      const category = MATERIAL_CATEGORIES.find((name) => name === analysis.category) ?? "기타";
      const conditionGrade = CONDITION_GRADES.find((grade) => grade.value === analysis.condition)?.value ?? "";
      setForm((previous) => ({ ...previous, title: analysis.title, category, conditionGrade }));

      setAiStep("설명 작성 중...");
      const { description } = await generateDescription(analysis.title, category, imageUrl, {
        tags: analysis.tags,
        condition: conditionGrade || undefined,
        quantity: Number(form.quantity) || undefined,
        quantityUnit: form.quantityUnit,
      });
      const finalDescription = description || analysis.description;
      setForm((previous) => ({ ...previous, description: finalDescription }));

      setAiStep("시세 확인 중...");
      const suggestion = await suggestPrice(analysis.title, category, finalDescription);
      if (suggestion.price > 0) {
        setForm((previous) => ({ ...previous, price: String(Math.round(suggestion.price)) }));
      }
      const { min, max } = suggestion.marketPrice;
      setPriceHint(max > 0 ? `AI 참고 시세 ${min.toLocaleString()}~${max.toLocaleString()}원` : null);
    } catch (error) {
      Alert.alert("AI 자동 채우기 실패", `직접 입력해 주세요.\n${getErrorMessage(error)}`);
    } finally {
      setAiStep(null);
    }
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
    </ScrollView>
  );
}
