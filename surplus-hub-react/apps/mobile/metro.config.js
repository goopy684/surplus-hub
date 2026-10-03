const path = require("path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

// getSentryExpoConfig = Expo's getDefaultConfig + Sentry source-map serializer.
const config = getSentryExpoConfig(__dirname);

const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer"),
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== "svg"),
  sourceExts: [...resolver.sourceExts, "svg"],
  // Root pins react@18 for the web app; force this app's own react@19 (Expo)
  // so react-native never resolves the hoisted 18. See root package.json.
  extraNodeModules: {
    ...resolver.extraNodeModules,
    react: path.resolve(__dirname, "node_modules/react"),
    "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
  },
};

module.exports = withNativeWind(config, { input: "./global.css" });
