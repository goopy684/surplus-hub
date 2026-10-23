import { Text, TouchableOpacity } from "react-native";

// design.md 칩(필터): 높이 38 · rounded-chip · 활성 bg-ink / 비활성 border-line bg-surface
export function Chip({ label, selected = false, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`h-[38px] justify-center rounded-chip border px-4 ${
        selected ? "border-ink bg-ink" : "border-line bg-surface"
      }`}
    >
      <Text className={`text-sm ${selected ? "font-bold text-surface" : "font-medium text-ink"}`}>{label}</Text>
    </TouchableOpacity>
  );
}
