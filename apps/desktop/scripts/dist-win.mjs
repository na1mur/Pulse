import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { build } from "electron-builder";

process.env.VITE_API_URL ??= "https://pulse-be.duckdns.org";

const releaseDir = "release";
const stagingDir = join(releaseDir, ".staging");

async function stopRunningPulseApp() {
  if (process.platform !== "win32") return;

  const result = spawnSync("taskkill", ["/F", "/IM", "Pulse.exe"], {
    stdio: "ignore",
    shell: true,
  });

  if (result.status === 0) {
    console.log("Stopped running Pulse app before packaging.");
    await sleep(1000);
  }
}

function prepareStagingDir() {
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }

  mkdirSync(stagingDir, { recursive: true });
}

function publishArtifacts() {
  mkdirSync(releaseDir, { recursive: true });

  for (const name of readdirSync(stagingDir)) {
    if (!/\.(exe|blockmap|yml)$/i.test(name)) continue;

    const from = join(stagingDir, name);
    const to = join(releaseDir, name);

    if (existsSync(to)) {
      rmSync(to, { force: true, maxRetries: 5, retryDelay: 200 });
    }

    renameSync(from, to);
    console.log(`Published ${to}`);
  }

  rmSync(stagingDir, { recursive: true, force: true });
}

const buildResult = spawnSync("pnpm", ["build"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

await stopRunningPulseApp();
prepareStagingDir();

await build({
  config: {
    appId: "com.pulse.timetracker",
    productName: "Pulse",
    directories: {
      output: stagingDir,
    },
    files: ["dist/**", "dist-electron/**", "build/icons/**"],
    win: {
      target: "nsis",
      icon: "build/icons/icon.ico",
    },
  },
});

publishArtifacts();
