import { Platform } from "react-native";
import * as Application from "expo-application";
import * as IntentLauncher from "expo-intent-launcher";

export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== "android") return;

  const packageName = Application.applicationId;
  if (!packageName) return;

  try {
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      {
        data: `package:${packageName}`,
      },
    );
    return;
  } catch {
    // Fall back to the app details screen if direct exemption is unavailable.
  }

  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
    {
      data: `package:${packageName}`,
    },
  );
}
