module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Worklets plugin is added automatically by babel-preset-expo when
    // react-native-worklets is installed — do not add it here (duplicate breaks bundling).
  };
};
