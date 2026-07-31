import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
} from "electron";
import * as path from "path";
import {
  applyLoginItemSettings,
  loadDesktopSettings,
  saveDesktopSettings,
  type DesktopSettings,
} from "./desktop-settings";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let desktopSettings: DesktopSettings = loadDesktopSettings();

function getTrayIcon() {
  const iconPath = path.join(__dirname, "../build/icons/icon.ico");
  return nativeImage.createFromPath(iconPath);
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;

  tray = new Tray(getTrayIcon());
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
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    icon: path.join(__dirname, "../build/icons/icon.png"),
    show: true,
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
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("close", (event) => {
    if (!isQuitting && desktopSettings.minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
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

app.whenReady().then(() => {
  applyLoginItemSettings(desktopSettings);
  registerIpcHandlers();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !desktopSettings.minimizeToTray) {
    app.quit();
  }
});
