import { Stack } from "expo-router";

export default function LegalLayout() {
  return (
    <Stack>
      <Stack.Screen name="terms" options={{ title: "이용약관" }} />
      <Stack.Screen name="privacy" options={{ title: "개인정보 처리방침" }} />
    </Stack>
  );
}
