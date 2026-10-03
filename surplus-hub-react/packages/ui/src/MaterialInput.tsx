import { TextInput, View, Text } from "react-native";

export interface MaterialInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address";
  multiline?: boolean;
}

export const MaterialInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
}: MaterialInputProps) => {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-muted-foreground mb-1">
        {label}
      </Text>
      <TextInput
        className={`bg-field border border-border rounded-field p-3 text-base text-foreground ${
          multiline ? "h-32" : "h-12"
        }`}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
};
