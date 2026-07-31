import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "node:url";
import {
  applyLoginItemSettings,
  loadDesktopSettings,
  saveDesktopSettings,
  type DesktopSettings,
} from "./desktop-settings";

const isDev = !app.isPackaged;

if (!isDev) {
  app.disableHardwareAcceleration();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let desktopSettings: DesktopSettings = loadDesktopSettings();

function resolveIconPath(fileName: string) {
  const candidates = [
    path.join(__dirname, "icons", fileName),
    path.join(__dirname, "../build/icons", fileName),
    path.join(process.resourcesPath, "build/icons", fileName),
    path.join(app.getAppPath(), "build/icons", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function getTrayIcon() {
  const iconPath = resolveIconPath("icon.ico");
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    return image;
  }
  return image.resize({ width: 16, height: 16 });
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
}

function createTray() {
  if (tray) return;

  const trayIcon = getTrayIcon();
  if (trayIcon.isEmpty()) {
    console.warn("[Pulse] Tray icon not found; tray may appear blank.");
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("Pulse");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Pulse",
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => showMainWindow());
}

function createWindow() {
  if (mainWindow) {
    showMainWindow();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    icon: resolveIconPath("icon.png"),
    show: false,
    backgroundColor: "#0B0B0B",
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, "../dist/index.html");
    void mainWindow.loadURL(pathToFileURL(indexPath).href);
  }

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.invalidate();
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.invalidate();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting && desktopSettings.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  ipcMain.handle("desktop:get-settings", () => desktopSettings);

  ipcMain.handle(
    "desktop:update-settings",
    (_event, partial: Partial<DesktopSettings>) => {
      desktopSettings = saveDesktopSettings(partial);
      return desktopSettings;
    },
  );

  ipcMain.handle("app:quit", () => {
    isQuitting = true;
    app.quit();
  });
}

if (gotTheLock) {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    applyLoginItemSettings(desktopSettings);
    registerIpcHandlers();
    createWindow();
    createTray();

    app.on("activate", () => {
      showMainWindow();
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !desktopSettings.minimizeToTray) {
    app.quit();
  }
});
