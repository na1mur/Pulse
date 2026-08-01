#!/usr/bin/env node
/**
 * Install the release APK on a connected device over USB debugging.
 * Usage: pnpm --filter mobile install:android
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const child = spawn("adb", ["install", "-r", apk], {
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
