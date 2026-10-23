"use client";

import { TouchableOpacity, Text } from "react-native";

export const Button = ({ onPress, title }: { onPress: () => void; title: string }) => {
  return (
    <TouchableOpacity accessibilityRole="button" className="bg-primary h-[52px] px-5 rounded-btn items-center justify-center active:bg-primary-dark" onPress={onPress}>
      <Text className="text-primary-foreground font-bold text-base">{title}</Text>
    </TouchableOpacity>
  );
};
