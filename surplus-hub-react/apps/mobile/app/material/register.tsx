import { useState } from "react";
import { View, Text, ScrollView, Image, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { Button, MaterialInput } from "@repo/ui";
import { useCreateMaterial, uploadImageFromUri } from "@repo/core";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";

const QUANTITY_UNITS = ["개", "kg", "m", "m²", "m³", "박스", "세트"] as const;
const TRADE_METHODS = ["직거래", "배송 협의"] as const;

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
    tradeMethod: "직거래" as (typeof TRADE_METHODS)[number],
  });
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const isBusy = isUploading || isSubmitting;

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
      const address = await Location.reverseGeocodeAsync({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });

      if (address.length > 0) {
        const firstAddress = address[0];
        setLocation(`${firstAddress.city || firstAddress.region}, ${firstAddress.street || firstAddress.name}`);
      } else {
        setLocation(`Lat: ${currentLocation.coords.latitude}, Lng: ${currentLocation.coords.longitude}`);
      }
    } catch {
      Alert.alert("오류", "위치 정보를 가져오지 못했습니다.");
    } finally {
      setIsLocating(false);
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
        photoUrls = await Promise.all(images.map((uri) => uploadImageFromUri(uri)));
      } catch (error) {
        Alert.alert("사진 업로드 실패", `사진을 업로드하지 못해 등록을 중단했습니다.\n${getErrorMessage(error)}`);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    try {
      await createMaterial({
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        quantity: Number(form.quantity),
        quantityUnit: form.quantityUnit,
        tradeMethod: form.tradeMethod === "직거래" ? "DIRECT" : "DELIVERY",
        location: {
          address: location || "위치 미정",
        },
        photoUrls,
      });

      Alert.alert("등록 완료", "자재가 성공적으로 등록되었습니다.", [
        { text: "확인", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert("등록 실패", getErrorMessage(error));
    }
  };

  return (
    <ScrollView className="flex-1 bg-background p-4">
      <Text className="mb-6 text-2xl font-bold text-foreground">자재 등록하기</Text>

      <View className="mb-8 rounded-thumb border border-border bg-card p-4">
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
      </View>

      <View className="mb-8 rounded-thumb border border-border bg-card p-4">
        <Text className="mb-3 text-base font-semibold text-foreground">상세 정보</Text>

        <MaterialInput
          label="제목 *"
          value={form.title}
          onChangeText={(text: string) => setForm({ ...form, title: text })}
          placeholder="자재명과 간단한 설명을 입력하세요"
        />

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

        <MaterialInput
          label="수량 *"
          value={form.quantity}
          onChangeText={(text: string) => setForm({ ...form, quantity: text.replace(/\D/g, "") })}
          placeholder="0"
          keyboardType="numeric"
        />

        <Text className="mb-2 text-sm font-medium text-muted-foreground">수량 단위</Text>
        <View className="mb-2 flex-row flex-wrap">
          {QUANTITY_UNITS.map((unit) => {
            const selected = form.quantityUnit === unit;
            return (
              <TouchableOpacity
                key={unit}
                onPress={() => setForm({ ...form, quantityUnit: unit })}
                className={`mb-2 mr-2 rounded-full px-3 py-2 ${
                  selected ? "bg-primary" : "border border-border bg-card"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    selected ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {unit}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View className="mb-8 rounded-thumb border border-border bg-card p-4">
        <Text className="mb-3 text-base font-semibold text-foreground">거래 정보</Text>

        <Text className="mb-2 text-sm font-medium text-muted-foreground">거래 방식</Text>
        {TRADE_METHODS.map((tradeMethod) => {
          const selected = form.tradeMethod === tradeMethod;
          return (
            <TouchableOpacity
              key={tradeMethod}
              onPress={() => setForm({ ...form, tradeMethod })}
              className="mb-2 flex-row items-center"
            >
              <View
                className={`mr-2 h-5 w-5 items-center justify-center rounded-full border-2 ${
                  selected ? "border-primary" : "border-border"
                }`}
              >
                {selected ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
              </View>
              <Text className="text-base text-foreground">{tradeMethod}</Text>
            </TouchableOpacity>
          );
        })}

        {location ? (
          <View className="mt-3 rounded-field border border-border bg-background p-3">
            <Text className="text-sm text-muted-foreground">{location}</Text>
          </View>
        ) : null}

        <TouchableOpacity onPress={getLocation} className="mt-3 flex-row items-center">
          {isLocating ? (
            <ActivityIndicator color="#ed701d" />
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
