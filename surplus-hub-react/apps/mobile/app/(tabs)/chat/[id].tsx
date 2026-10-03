import { View, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, Text } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useChatMessages, useCurrentUser, useSendMessage, useChatWebSocket } from "@repo/core";
import { ChatBubble, MaterialInput, Button } from "@repo/ui";
import { useState, useEffect, useRef, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useChatMessages(id);
  const { data: currentUser } = useCurrentUser();
  const { mutate: sendMessage } = useSendMessage();
  const [message, setMessage] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 토큰 관리
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const loadToken = async () => {
      const accessToken = await SecureStore.getItemAsync("access_token");
      setToken(accessToken);
    };
    loadToken();
  }, []);

  // WebSocket 연결
  const { isConnected, sendTextMessage, sendReadReceipt, sendTyping, typingUser } = useChatWebSocket({
    roomId: id,
    token,
    enabled: !!token,
  });

  // 읽음 처리: 채팅방 진입 시 + 새 메시지 수신 시
  useEffect(() => {
    if (isConnected) {
      sendReadReceipt();
    }
  }, [isConnected, data]);

  // 타이핑 인디케이터 전송 (debounce)
  const handleTyping = useCallback(() => {
    if (!isConnected) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    sendTyping();

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  }, [isConnected, sendTyping]);

  // cleanup typing timeout
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // 메시지 전송: WS 연결 시 WebSocket, 아니면 REST fallback
  const handleSend = () => {
    if (!message.trim()) return;
    if (isConnected) {
      sendTextMessage(message);
    } else {
      sendMessage({ roomId: id, content: message });
    }
    setMessage("");
  };

  // 입력 변경 핸들러 (타이핑 인디케이터 포함)
  const handleChangeText = (text: string) => {
    setMessage(text);
    handleTyping();
  };

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#ed701d" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View className="flex-row items-center">
              <Text className="text-lg font-bold text-foreground">채팅</Text>
              {isConnected && (
                <View className="ml-2 w-2.5 h-2.5 rounded-full bg-olive" />
              )}
            </View>
          ),
        }}
      />
      <FlatList
        data={data?.data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatBubble
            message={item}
            isMe={currentUser ? item.senderId === currentUser.id : item.senderId === "me"}
          />
        )}
        contentContainerStyle={{ padding: 16 }}
        inverted={false}
      />
      {typingUser && (
        <View className="px-4 py-2">
          <Text className="text-sm text-muted-foreground">{typingUser}님이 입력 중...</Text>
        </View>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        className="p-4 border-t border-border bg-card flex-row items-center"
      >
        <View className="flex-1 mr-2">
            <MaterialInput
                label=""
                value={message}
                onChangeText={handleChangeText}
                placeholder="메시지를 입력하세요..."
            />
        </View>
        <Button title="전송" onPress={handleSend} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
