#!/usr/bin/env node
/**
 * Stream Android logs for the Pulse app over USB debugging.
 * Usage: pnpm --filter mobile log:android
 */
const { spawn } = require("node:child_process");

const command =
  "adb logcat -c && adb logcat ReactNativeJS:V ReactNative:V AndroidRuntime:E *:S";

const child = spawn(
  process.platform === "win32" ? "cmd.exe" : "sh",
  process.platform === "win32" ? ["/c", command] : ["-c", command],
  { stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 0));
