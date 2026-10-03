import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useChatRooms } from "@repo/core";
import { ChatListItem } from "@repo/ui";
import { useRouter } from "expo-router";

export default function ChatListScreen() {
  const { data, isLoading, error } = useChatRooms();
  const router = useRouter();

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#ed701d" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <Text className="text-muted-foreground">채팅 목록을 불러오지 못했습니다.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Text className="text-2xl font-bold p-4 pb-2 text-foreground">채팅</Text>
      <FlatList
        data={data?.data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatListItem
            room={item}
            onPress={() => router.push(`/chat/${item.id}`)}
          />
        )}
      />
    </View>
  );
}
