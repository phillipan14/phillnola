import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#1a1a1a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Set Content Security Policy for production
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
          ],
        },
      });
    });
  }

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── IPC Handler Stubs ──────────────────────────────────────────────────────

ipcMain.handle("get-settings", async () => {
  // TODO: implement with SQLite in Task 2
  return {};
});

ipcMain.handle("save-settings", async (_event, settings: Record<string, unknown>) => {
  // TODO: implement with SQLite in Task 2
  return { success: true };
});

ipcMain.handle("get-meetings", async () => {
  // TODO: implement with SQLite in Task 2
  return [];
});

ipcMain.handle("start-recording", async () => {
  // TODO: implement audio capture in Task 6
  return { success: true };
});

ipcMain.handle("stop-recording", async () => {
  // TODO: implement audio capture in Task 6
  return { success: true };
});

// ── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
