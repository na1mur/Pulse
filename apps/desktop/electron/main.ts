import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} from "electron";
import * as path from "path";
import {
  applyAutoStart,
  readDesktopPrefs,
  writeDesktopPrefs,
} from "./desktop-prefs";
import {
  DEFAULT_DESKTOP_PREFS,
  IPC,
  type DesktopPreferences,
  type TimerStatePayload,
  type TodayReportPayload,
} from "./ipc-channels";

const isDev = !app.isPackaged;
const startMinimized =
  process.argv.includes("--minimized") || process.argv.includes("--hidden");

let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

let desktopPrefs: DesktopPreferences = { ...DEFAULT_DESKTOP_PREFS };
let timerState: TimerStatePayload = {
  isRunning: false,
  displayTime: "00:00:00",
};
let todayReport: TodayReportPayload | null = null;

function iconPath(name: string): string {
  return path.join(__dirname, "../build/icons", name);
}

function widgetUrl(): string {
  if (isDev) {
    return "http://localhost:5173/taskbar-widget.html";
  }
  return path.join(__dirname, "../dist/taskbar-widget.html");
}

function mainUrl(): string {
  if (isDev) {
    return "http://localhost:5173";
  }
  return path.join(__dirname, "../dist/index.html");
}

function positionTaskbarWidget(win: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();
  const { workArea, bounds } = display;
  const taskbarHeight = bounds.height - workArea.height;
  const height = Math.max(taskbarHeight, 36);
  const width = 96;

  win.setBounds({
    x: workArea.x + workArea.width - width - 4,
    y: workArea.y + workArea.height,
    width,
    height,
  });
}

function sendToWidget(channel: string, payload: unknown): void {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send(channel, payload);
  }
}

function sendToMain(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function pushTimerToWidget(): void {
  sendToWidget(IPC.TIMER_STATE, {
    ...timerState,
    runningColor: desktopPrefs.runningColor,
    pausedColor: desktopPrefs.pausedColor,
  });
}

function pushPrefsToWidget(): void {
  sendToWidget("desktop-prefs:updated", desktopPrefs);
}

function updateTrayTooltip(): void {
  if (!tray) return;
  const status = timerState.isRunning ? "Running" : "Paused";
  const title = timerState.sessionTitle ? `\n${timerState.sessionTitle}` : "";
  tray.setToolTip(`Pulse — ${timerState.displayTime} (${status})${title}`);
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.setTitle(`Pulse — ${timerState.displayTime}`);
  }
}

function formatWorkedMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function buildContextMenu(): Menu {
  const isRunning = timerState.isRunning;
  const report = todayReport;

  const reportItems: Electron.MenuItemConstructorOptions[] = report
    ? [
        {
          label: `Worked Today: ${formatWorkedMinutes(report.workedMinutes)}`,
          enabled: false,
        },
        {
          label: `Sessions: ${report.sessionCount}`,
          enabled: false,
        },
        ...(report.goalEnabled && report.progressPercent !== null
          ? [
              {
                label: `Progress: ${report.progressPercent}%`,
                enabled: false,
              },
            ]
          : []),
        { type: "separator" as const },
      ]
    : [
        {
          label: "Today's report loading…",
          enabled: false,
        },
        { type: "separator" as const },
      ];

  return Menu.buildFromTemplate([
    {
      label: isRunning
        ? `⏸ Pause (${timerState.displayTime})`
        : `▶ Play (${timerState.displayTime})`,
      click: () => sendToMain(IPC.TRAY_TOGGLE),
    },
    {
      label: isRunning ? "Pause with Summary…" : "Play with Title…",
      click: () => {
        showMainWindow();
        sendToMain(
          isRunning ? IPC.TRAY_PAUSE_WITH_SUMMARY : IPC.TRAY_PLAY_WITH_TITLE,
        );
      },
    },
    { type: "separator" },
    {
      label: "Today's Report",
      submenu: [
        ...reportItems,
        {
          label: "Open Full Report",
          click: () => {
            showMainWindow();
            sendToMain(IPC.TRAY_SHOW_TODAY_REPORT);
          },
        },
      ],
    },
    { type: "separator" },
    {
      label: "Show Pulse",
      click: () => showMainWindow(),
    },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function showContextMenu(): void {
  const menu = buildContextMenu();
  menu.popup();
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  if (!mainWindow) return;

  mainWindow.show();
  mainWindow.focus();
}

function createWidgetWindow(): void {
  if (widgetWindow && !widgetWindow.isDestroyed()) return;

  widgetWindow = new BrowserWindow({
    width: 96,
    height: 40,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    focusable: true,
    icon: iconPath("icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload-widget.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWindow.setAlwaysOnTop(true, "screen-saver");

  if (isDev) {
    void widgetWindow.loadURL(widgetUrl());
  } else {
    void widgetWindow.loadFile(widgetUrl());
  }

  widgetWindow.once("ready-to-show", () => {
    positionTaskbarWidget(widgetWindow!);
    widgetWindow?.show();
    pushTimerToWidget();
    pushPrefsToWidget();
  });

  widgetWindow.on("closed", () => {
    widgetWindow = null;
  });

  screen.on("display-metrics-changed", () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      positionTaskbarWidget(widgetWindow);
    }
  });
}

function createMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) return;

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    show: false,
    icon: iconPath("icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(mainUrl());
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(mainUrl());
  }

  mainWindow.once("ready-to-show", () => {
    if (!startMinimized && !desktopPrefs.startMinimized) {
      mainWindow?.show();
    }
  });

  mainWindow.on("close", (event) => {
    if (app.isQuitting || !desktopPrefs.closeToTray) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(iconPath("icon.png"));
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Pulse");
  tray.on("double-click", () => showMainWindow());
  tray.on("right-click", () => showContextMenu());
  updateTrayTooltip();
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.DESKTOP_PREFS_GET, () => readDesktopPrefs());

  ipcMain.handle(IPC.DESKTOP_PREFS_SET, (_event, prefs: DesktopPreferences) => {
    desktopPrefs = { ...DEFAULT_DESKTOP_PREFS, ...prefs };
    writeDesktopPrefs(desktopPrefs);
    applyAutoStart(desktopPrefs.autoStartOnBoot);
    pushTimerToWidget();
    pushPrefsToWidget();
    return desktopPrefs;
  });

  ipcMain.on(IPC.TIMER_STATE, (_event, state: TimerStatePayload) => {
    timerState = state;
    pushTimerToWidget();
    updateTrayTooltip();
  });

  ipcMain.on(IPC.TODAY_REPORT, (_event, report: TodayReportPayload) => {
    todayReport = report;
  });

  ipcMain.on(IPC.WIDGET_CONTEXT_MENU, () => {
    showContextMenu();
  });
}

// Extend app type for quit flag
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }
}

app.whenReady().then(() => {
  desktopPrefs = readDesktopPrefs();
  applyAutoStart(desktopPrefs.autoStartOnBoot);

  registerIpcHandlers();
  createMainWindow();
  createWidgetWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createWidgetWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", () => {
  // Keep running in tray with the taskbar widget
});
