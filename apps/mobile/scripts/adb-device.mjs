#!/usr/bin/env node
import { execSync } from "node:child_process";

function listConnectedDevices() {
  const output = execSync("adb devices", { encoding: "utf8" });
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => serial);
}

export function resolveAdbDeviceSerial(argv = process.argv.slice(2)) {
  const deviceFlagIndex = argv.findIndex((arg) => arg === "--device");
  if (deviceFlagIndex !== -1) {
    const serial = argv[deviceFlagIndex + 1];
    if (!serial) {
      console.error("Missing value for --device <serial>.");
      process.exit(1);
    }
    return serial;
  }

  if (process.env.ANDROID_SERIAL) {
    return process.env.ANDROID_SERIAL;
  }

  const devices = listConnectedDevices();
  if (devices.length === 0) {
    console.error(
      "No Android device found. Enable USB debugging and connect a device.",
    );
    process.exit(1);
  }

  if (devices.length === 1) {
    return devices[0];
  }

  const physicalDevices = devices.filter(
    (serial) => !serial.startsWith("emulator-"),
  );
  if (physicalDevices.length === 1) {
    console.log(`Using physical device ${physicalDevices[0]}.`);
    return physicalDevices[0];
  }

  console.error("Multiple Android devices connected:");
  for (const serial of devices) {
    console.error(`  - ${serial}`);
  }
  console.error("Set ANDROID_SERIAL or run with --device <serial>.");
  process.exit(1);
}
