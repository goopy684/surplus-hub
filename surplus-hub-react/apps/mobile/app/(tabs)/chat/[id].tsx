import { View, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import {
  QUICK_REPLIES,
  TRANSLATION_LANGUAGES,
  getChatSuggestions,
  translateText,
  useChatMessages,
  useChatRoomDetail,
  useCurrentUser,
  useSendMessage,
  useChatWebSocket,
} from "@repo/core";
import { ChatBubble, MaterialInput, Button } from "@repo/ui";
import { useState, useEffect, useRef, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { Chip } from "../../../components/Chip";

// 번역은 분당 20회 제한 — 최근 메시지만 번역한다.
const TRANSLATE_RECENT_COUNT = 20;

const MATERIAL_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "판매중",
  RESERVED: "예약중",
  SOLD: "판매완료",
};

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useChatMessages(id);
  const { data: room } = useChatRoomDetail(id);
  const { data: currentUser } = useCurrentUser();
  const { mutate: sendMessage } = useSendMessage();
  const [message, setMessage] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messages = data?.data;
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [translateLang, setTranslateLang] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const requestedTranslations = useRef(new Set<string>());

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

  // AI 답장 추천: 메시지 수가 바뀔 때마다 갱신, 실패하면 기본 빠른 답장만 노출
  useEffect(() => {
    if (!id || !messages?.length) return;
    let cancelled = false;
    getChatSuggestions(id, messages.map(({ content, senderId }) => ({ content, senderId })))
      .then(({ suggestions }) => !cancelled && setAiSuggestions(suggestions))
      .catch(() => !cancelled && setAiSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [id, messages?.length]);

  const quickReplies = [...new Set([...aiSuggestions, ...QUICK_REPLIES])];

  // 번역: 최근 메시지만, `${lang}:${content}` 단위로 한 번씩 요청
  useEffect(() => {
    if (!translateLang || !messages) return;
    messages.slice(-TRANSLATE_RECENT_COUNT).forEach(({ content }) => {
      const key = `${translateLang}:${content}`;
      if (requestedTranslations.current.has(key)) return;
      requestedTranslations.current.add(key);
      translateText(content, translateLang)
        .then((translated) => setTranslations((previous) => ({ ...previous, [key]: translated })))
        .catch(() => requestedTranslations.current.delete(key));
    });
  }, [translateLang, messages]);

  // 메시지 전송: WS 연결 시 WebSocket, 아니면 REST fallback
  const sendText = (text: string) => {
    if (!text.trim()) return;
    if (isConnected) {
      sendTextMessage(text);
    } else {
      sendMessage({ roomId: id, content: text });
    }
  };

  const handleSend = () => {
    sendText(message);
    setMessage("");
  };

  // 입력 변경 핸들러 (타이핑 인디케이터 포함)
  const handleChangeText = (text: string) => {
    setMessage(text);
    handleTyping();
  };

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-paper">
        <ActivityIndicator size="large" color="#1E3FCC" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View className="flex-row items-center">
              <Text className="text-[17px] font-extrabold tracking-[-0.4px] text-foreground">채팅</Text>
              {isConnected && (
                <View className="ml-2 w-2.5 h-2.5 rounded-full bg-olive" />
              )}
            </View>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setTranslateLang((current) => (current ? null : TRANSLATION_LANGUAGES[0].code))}
              className="px-2 py-1"
            >
              <Text className={`text-sm font-bold ${translateLang ? "text-primary" : "text-ink-2"}`}>
                {translateLang ? "번역 끄기" : "번역"}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />
      {room?.materialId ? (
        room.materialTitle ? (
          <TouchableOpacity
            onPress={() => router.push(`/material/${room.materialId}`)}
            className="flex-row items-center border-b border-line-2 bg-surface px-4 py-2.5"
          >
            {room.materialImageUrl ? (
              <Image
                source={{ uri: room.materialImageUrl }}
                className="mr-3 h-11 w-11 rounded-thumb bg-field"
              />
            ) : (
              <View className="mr-3 h-11 w-11 items-center justify-center rounded-thumb border border-line bg-field">
                <Text className="text-xs font-bold text-muted-foreground">자재</Text>
              </View>
            )}
            <View className="flex-1">
              <View className="flex-row items-center">
                {room.materialStatus ? (
                  <View className="mr-1.5 rounded-full border border-line bg-card px-2 py-0.5">
                    <Text className="text-[11px] font-bold text-foreground">
                      {MATERIAL_STATUS_LABELS[room.materialStatus] ?? room.materialStatus}
                    </Text>
                  </View>
                ) : null}
                <Text className="flex-1 text-sm font-bold text-foreground" numberOfLines={1}>
                  {room.materialTitle}
                </Text>
              </View>
              <Text className="mt-0.5 text-xs font-bold text-primary">
                {room.materialPrice !== undefined
                  ? room.materialPrice > 0
                    ? `${room.materialPrice.toLocaleString()}원`
                    : "무료나눔"
                  : "자재 상세 보기"}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View className="border-b border-line-2 bg-field px-4 py-2.5">
            <Text className="text-xs font-medium text-muted-foreground">삭제된 자재입니다</Text>
          </View>
        )
      ) : null}
      {translateLang ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="max-h-[54px] grow-0 border-b border-line-2 bg-surface"
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
        >
          {TRANSLATION_LANGUAGES.map(({ code, label }) => (
            <Chip key={code} label={label} selected={translateLang === code} onPress={() => setTranslateLang(code)} />
          ))}
        </ScrollView>
      ) : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMe = currentUser ? item.senderId === currentUser.id : item.senderId === "me";
          const translated = translateLang ? translations[`${translateLang}:${item.content}`] : undefined;
          return (
            <View>
              <ChatBubble message={item} isMe={isMe} />
              {translated && translated !== item.content ? (
                <Text className={`-mt-1 mb-2 max-w-[80%] text-[13px] text-ink-2 ${isMe ? "self-end" : "self-start"}`}>
                  {translated}
                </Text>
              ) : null}
            </View>
          );
        }}
        contentContainerStyle={{ padding: 16 }}
        inverted={false}
      />
      {typingUser && (
        <View className="px-4 py-2">
          <Text className="text-sm text-muted-foreground">{typingUser}님이 입력 중...</Text>
        </View>
      )}
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        className="max-h-[54px] grow-0 border-t border-line-2 bg-surface"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
      >
        {quickReplies.map((reply) => (
          <Chip key={reply} label={reply} onPress={() => sendText(reply)} />
        ))}
      </ScrollView>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        className="p-4 border-t border-line bg-surface flex-row items-center"
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
