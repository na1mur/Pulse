#!/usr/bin/env node
/**
 * Install the release APK on a connected device over USB debugging.
 * Usage: pnpm --filter mobile install:android [-- --device <serial>]
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAdbDeviceSerial } from "./adb-device.mjs";

const apk = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);

const serial = resolveAdbDeviceSerial();

const child = spawn("adb", ["-s", serial, "install", "-r", apk], {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
