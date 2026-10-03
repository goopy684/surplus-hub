// app.json은 그대로 정본이고, 여기서는 빌드 프로파일마다 달라져야 하는 값 하나만 덮는다.
//
// expo-notifications 플러그인은 iOS 엔타이틀먼트 `aps-environment`를 쓰는데
// (node_modules/expo-notifications/plugin/build/withNotificationsIOS.js)
//   const withNotificationsIOS = (config, { mode = 'development', ... })
//   if (!config.modResults['aps-environment']) config.modResults['aps-environment'] = mode;
// 기본값이 'development'다. 릴리스 빌드가 이 값으로 나가면 기기가 APNs 샌드박스 토큰을 등록하고
// Expo는 DeviceNotRegistered/BadDeviceToken을 돌려주며 서버가 토큰을 비활성화한다 — 프로덕션 푸시가 전부 조용히 죽는다.
//
// per-profile 설정 수단은 eas.json의 env뿐이라 그걸 그대로 쓴다 (preview·production만 production).
// development 프로파일과 로컬 expo run:ios는 값을 주지 않아 기본 'development'로 남는다 —
// 개발용 프로비저닝 프로파일은 aps-environment가 development라 여기서 production을 박으면 서명이 깨진다.
module.exports = ({ config }) => ({
  ...config,
  plugins: config.plugins.map((plugin) =>
    Array.isArray(plugin) && plugin[0] === "expo-notifications"
      ? [
          "expo-notifications",
          {
            ...plugin[1],
            mode: process.env.APS_ENVIRONMENT === "production" ? "production" : "development",
          },
        ]
      : plugin
  ),
});
