import { View, Text } from "react-native";
import { ChatMessage } from "@repo/core";

interface ChatBubbleProps {
  message: ChatMessage;
  isMe: boolean;
}

export const ChatBubble = ({ message, isMe }: ChatBubbleProps) => {
  return (
    <View
      className={`max-w-[80%] rounded-thumb px-4 py-3 mb-2 ${
        isMe
          ? "bg-accent self-end rounded-tr-none"
          : "bg-card border border-border self-start rounded-tl-none"
      }`}
    >
      <Text className="text-base leading-6 text-foreground">
        {message.content}
      </Text>
      <View className="flex-row justify-end items-center mt-1">
        {isMe && message.isRead && (
          <Text className="text-xs text-muted-foreground mr-1">
            읽음
          </Text>
        )}
        <Text className="text-xs text-muted-foreground">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
};
