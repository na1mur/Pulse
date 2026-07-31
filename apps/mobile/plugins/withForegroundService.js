const { withAndroidManifest } = require("@expo/config-plugins");

const FOREGROUND_PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  "android.permission.WAKE_LOCK",
];

function ensurePermission(manifest, permission) {
  if (!manifest["uses-permission"]) {
    manifest["uses-permission"] = [];
  }

  const exists = manifest["uses-permission"].some(
    (entry) => entry.$["android:name"] === permission,
  );

  if (!exists) {
    manifest["uses-permission"].push({
      $: { "android:name": permission },
    });
  }
}

function withForegroundService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    for (const permission of FOREGROUND_PERMISSIONS) {
      ensurePermission(manifest, permission);
    }
    return config;
  });
}

module.exports = withForegroundService;
