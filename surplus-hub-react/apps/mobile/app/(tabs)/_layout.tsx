import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

type TabIconName = "home" | "community" | "chat" | "profile";

const TAB_CONFIG: Record<string, { label: string; icon: TabIconName }> = {
  index: { label: "홈", icon: "home" },
  community: { label: "커뮤니티", icon: "community" },
  "chat/index": { label: "채팅", icon: "chat" },
  profile: { label: "내 정보", icon: "profile" },
};

// design.md B — 모노라인 아이콘 (이모지 금지). 활성 = ink, 비활성 = ink-2.
const INK = "#121620";
const INK_2 = "#5A6273";

function TabIcon({ name, focused }: { name: TabIconName; focused: boolean }) {
  const color = focused ? INK : INK_2;
  const common = {
    stroke: color,
    strokeWidth: focused ? 2.2 : 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {name === "home" ? <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" {...common} /> : null}
      {name === "chat" ? <Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" {...common} /> : null}
      {name === "community" ? (
        <>
          <Circle cx={9} cy={8} r={3.5} {...common} />
          <Path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2a6.5 6.5 0 0 1 3.5 5.8" {...common} />
        </>
      ) : null}
      {name === "profile" ? (
        <>
          <Circle cx={12} cy={8} r={4} {...common} />
          <Path d="M4 21a8 8 0 0 1 16 0" {...common} />
        </>
      ) : null}
    </Svg>
  );
}

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
        <View style={{ marginBottom: 3 }}>
          <TabIcon name={config.icon} focused={isFocused} />
        </View>
        <Text
          className={isFocused ? "text-foreground" : "text-muted-foreground"}
          style={{
            fontSize: 11,
            fontWeight: isFocused ? "700" : "500",
          }}
        >
          {config.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      className="border-t border-line-2 bg-surface"
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
          className="bg-primary border-surface items-center justify-center"
          style={{
            position: "absolute",
            left: "50%",
            top: -24,
            marginLeft: -28,
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 4,
            shadowColor: "#1E3FCC",
            shadowOpacity: 0.28,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 16,
            elevation: 8,
          }}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path d="M12 5v14M5 12h14" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" fill="none" />
          </Svg>
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
