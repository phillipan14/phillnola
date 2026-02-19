import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "path";
import {
  initDatabase,
  closeDatabase,
  getMeetings,
  getMeeting,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  getNotes,
  saveNotes,
  searchNotes,
  getRecipes,
  getRecipe,
  saveRecipe,
  getAllSettings,
  getSetting,
  setSetting,
} from "./db";

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

// ── IPC Handlers ─────────────────────────────────────────────────────────────

// Settings
ipcMain.handle("get-settings", async () => {
  return getAllSettings();
});

ipcMain.handle("save-setting", async (_event, key: string, value: string) => {
  setSetting(key, value);
  return { success: true };
});

// Meetings
ipcMain.handle("get-meetings", async () => {
  return getMeetings();
});

ipcMain.handle("get-meeting", async (_event, id: string) => {
  return getMeeting(id);
});

ipcMain.handle("create-meeting", async (_event, data) => {
  return createMeeting(data);
});

ipcMain.handle("update-meeting", async (_event, id: string, data) => {
  return updateMeeting(id, data);
});

ipcMain.handle("delete-meeting", async (_event, id: string) => {
  return deleteMeeting(id);
});

// Notes
ipcMain.handle("get-notes", async (_event, meetingId: string) => {
  return getNotes(meetingId);
});

ipcMain.handle("save-notes", async (_event, meetingId: string, content) => {
  return saveNotes(meetingId, content);
});

ipcMain.handle("search-notes", async (_event, query: string) => {
  return searchNotes(query);
});

// Recipes
ipcMain.handle("get-recipes", async () => {
  return getRecipes();
});

ipcMain.handle("get-recipe", async (_event, id: string) => {
  return getRecipe(id);
});

ipcMain.handle("save-recipe", async (_event, data) => {
  return saveRecipe(data);
});

// Recording stubs (Task 6)
ipcMain.handle("start-recording", async () => {
  // TODO: implement audio capture in Task 6
  return { success: true };
});

ipcMain.handle("stop-recording", async () => {
  // TODO: implement audio capture in Task 6
  return { success: true };
});

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Initialize the database before creating the window
  initDatabase();
  createWindow();
});

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

app.on("will-quit", () => {
  closeDatabase();
});
