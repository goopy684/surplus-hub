import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

const TAB_CONFIG: Record<string, { label: string; icon: string }> = {
  index: { label: "홈", icon: "🏠" },
  community: { label: "커뮤니티", icon: "🧩" },
  "chat/index": { label: "채팅", icon: "💬" },
  profile: { label: "내 정보", icon: "👤" },
};

function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Chat room is treated as full-screen flow, not tab-shell flow.
  if (pathname.startsWith("/chat/") && pathname !== "/chat") {
    return null;
  }

  const tabRoutes = state.routes.filter((route) => TAB_CONFIG[route.name]);
  const leftRoutes = tabRoutes.slice(0, 2);
  const rightRoutes = tabRoutes.slice(2);

  const renderTabButton = (route: (typeof state.routes)[number]) => {
    const routeIndex = state.routes.findIndex((item) => item.key === route.key);
    const isFocused = state.index === routeIndex;
    const config = TAB_CONFIG[route.name];

    const onPress = () => {
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    const onLongPress = () => {
      navigation.emit({
        type: "tabLongPress",
        target: route.key,
      });
    };

    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityLabel={descriptors[route.key]?.options.tabBarAccessibilityLabel}
        accessibilityState={isFocused ? { selected: true } : {}}
        onPress={onPress}
        onLongPress={onLongPress}
        className="flex-1 items-center justify-center"
        style={{ minHeight: 56 }}
      >
        <Text
          className={isFocused ? "text-primary" : "text-muted-foreground"}
          style={{
            fontSize: 22,
            marginBottom: 2,
          }}
        >
          {config.icon}
        </Text>
        <Text
          className={isFocused ? "text-foreground" : "text-muted-foreground"}
          style={{
            fontSize: 12,
            fontWeight: isFocused ? "600" : "500",
          }}
        >
          {config.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      className="border-t border-border bg-card"
      style={{
        paddingHorizontal: 8,
        paddingTop: 4,
        paddingBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", position: "relative" }}>
        {leftRoutes.map(renderTabButton)}
        <View style={{ width: 64 }} />
        {rightRoutes.map(renderTabButton)}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="자재 등록"
          onPress={() => router.push("/material/register")}
          className="bg-primary border-card items-center justify-center"
          style={{
            position: "absolute",
            left: "50%",
            top: -24,
            marginLeft: -28,
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 4,
            shadowColor: "#ed701d",
            shadowOpacity: 0.28,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 16,
            elevation: 8,
          }}
        >
          <Text className="text-primary-foreground" style={{ fontSize: 30, lineHeight: 30, marginTop: -2 }}>
            +
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="community" options={{ title: "커뮤니티" }} />
      <Tabs.Screen name="chat/index" options={{ title: "채팅" }} />
      <Tabs.Screen name="profile" options={{ title: "내 정보" }} />
    </Tabs>
  );
}
