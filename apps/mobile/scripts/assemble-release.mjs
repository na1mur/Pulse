#!/usr/bin/env node
/**
 * Build a release APK with Gradle.
 * Usage: pnpm --filter mobile assemble:release
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const androidDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "android",
);
const gradlew = process.platform === "win32" ? "gradlew.bat" : "gradlew";

const child = spawn(gradlew, ["assembleRelease"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
