#!/usr/bin/env node
/**
 * Stream Android logs for the Pulse app over USB debugging.
 * Usage: pnpm --filter mobile log:android [-- --device <serial>]
 */
import { spawn } from "node:child_process";
import { resolveAdbDeviceSerial } from "./adb-device.mjs";

const serial = resolveAdbDeviceSerial();
const command = `adb -s ${serial} logcat -c && adb -s ${serial} logcat ReactNativeJS:V ReactNative:V AndroidRuntime:E *:S`;

const child = spawn(
  process.platform === "win32" ? "cmd.exe" : "sh",
  process.platform === "win32" ? ["/c", command] : ["-c", command],
  { stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 0));
