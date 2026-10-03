import { View, Text, TouchableOpacity, Image } from "react-native";
import { ChatRoom } from "@repo/core";

interface ChatListItemProps {
  room: ChatRoom;
  onPress: () => void;
}

export const ChatListItem = ({ room, onPress }: ChatListItemProps) => {
  return (
    <TouchableOpacity
      className="flex-row items-center p-4 bg-card border-b border-border-secondary active:bg-background"
      onPress={onPress}
    >
      <Image
        source={{ uri: room.otherUser.avatarUrl }}
        className="w-12 h-12 rounded-full bg-muted mr-3"
      />
      <View className="flex-1">
        <View className="flex-row justify-between mb-1">
          <Text className="font-bold text-base text-foreground">{room.otherUser.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {new Date(room.updatedAt).toLocaleDateString()}
          </Text>
        </View>
        <View className="flex-row justify-between items-center">
          <Text className="text-muted-foreground text-sm" numberOfLines={1}>
            {room.lastMessage?.content || "No messages yet"}
          </Text>
          {room.unreadCount > 0 && (
            <View className="bg-primary rounded-full min-w-5 h-5 px-1.5 items-center justify-center ml-2">
              <Text className="text-primary-foreground text-xs font-bold">{room.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
