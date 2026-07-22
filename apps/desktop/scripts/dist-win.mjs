import { build } from "electron-builder";

await build({
  config: {
    appId: "com.pulse.timetracker",
    productName: "Pulse",
    directories: {
      output: "release",
    },
    files: ["dist/**", "dist-electron/**"],
    win: {
      target: "nsis",
      icon: "build/icons/icon.ico",
    },
  },
});
