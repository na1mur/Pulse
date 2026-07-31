import { spawnSync } from "node:child_process";
import { build } from "electron-builder";

process.env.VITE_API_URL ??= "https://pulse-be.duckdns.org";

const buildResult = spawnSync("pnpm", ["build"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

await build({
  config: {
    appId: "com.pulse.timetracker",
    productName: "Pulse",
    directories: {
      output: "release",
    },
    files: ["dist/**", "dist-electron/**", "build/icons/**"],
    win: {
      target: "nsis",
      icon: "build/icons/icon.ico",
    },
  },
});
