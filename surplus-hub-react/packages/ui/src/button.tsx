"use client";

import { TouchableOpacity, Text } from "react-native";

export const Button = ({ onPress, title }: { onPress: () => void; title: string }) => {
  return (
    <TouchableOpacity className="bg-primary p-4 rounded-btn items-center" onPress={onPress}>
      <Text className="text-primary-foreground font-bold text-lg">{title}</Text>
    </TouchableOpacity>
  );
};
