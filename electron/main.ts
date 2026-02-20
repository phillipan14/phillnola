import { app, BrowserWindow, desktopCapturer, ipcMain, session, Tray, Menu, nativeImage } from "electron";
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
import {
  getDesktopSources,
  startCapture,
  writeAudioChunk,
  stopCapture,
  getRecordingState,
} from "./audio-capture";
import { transcribeChunks } from "./transcribe";
import { structureNotes } from "./ai-structure";
import {
  startGoogleAuth,
  fetchCalendarEvents,
  isGoogleConnected,
  disconnectGoogle,
} from "./google-calendar";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

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

  // Grant media permissions (microphone, screen capture) automatically
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ["media", "mediaKeySystem", "display-capture", "audioCapture"];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ["media", "mediaKeySystem", "display-capture", "audioCapture"];
    return allowed.includes(permission);
  });

  // Handle display media requests (system audio capture) for Electron 28+
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    if (mainWindow) {
      // Grant access to the entire screen for audio capture
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources: Electron.DesktopCapturerSource[]) => {
          if (sources.length > 0) {
            callback({ video: sources[0], audio: "loopback" });
          } else {
            callback({});
          }
        });
    } else {
      callback({});
    }
  });

  // Set Content Security Policy for production
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.openai.com https://api.anthropic.com",
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

// Recording — Audio Capture
ipcMain.handle("get-desktop-sources", async () => {
  return getDesktopSources();
});

ipcMain.handle("start-recording", async (_event, meetingId: string) => {
  return startCapture(meetingId);
});

ipcMain.handle("write-audio-chunk", async (_event, data: number[]) => {
  const buffer = Buffer.from(data);
  return writeAudioChunk(buffer);
});

ipcMain.handle("stop-recording", async () => {
  return stopCapture();
});

ipcMain.handle("get-recording-state", async () => {
  return getRecordingState();
});

// Transcription — Whisper
ipcMain.handle("transcribe", async (_event, chunkPaths: string[]) => {
  const apiKey = getSetting("openai_key");
  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Please add it in Settings.");
  }
  return transcribeChunks(chunkPaths, apiKey, mainWindow);
});

// AI Note Structuring
ipcMain.handle(
  "structure-notes",
  async (
    _event,
    params: {
      meetingId: string;
      transcript: string;
      userNotes: string;
      recipeId?: string;
    },
  ) => {
    const { meetingId, transcript, userNotes, recipeId } = params;

    // Get API keys and provider preference from settings
    const openaiKey = getSetting("openai_key");
    const anthropicKey = getSetting("anthropic_key");
    const provider = (getSetting("ai_provider") || "openai") as "openai" | "anthropic";

    // Get recipe system prompt
    let systemPrompt =
      "Produce structured meeting notes with: Summary, Key Decisions, Action Items, and Discussion Points.";

    if (recipeId) {
      const recipe = getRecipe(recipeId);
      if (recipe) {
        systemPrompt = recipe.system_prompt;
      }
    } else {
      // Try to find default recipe
      const recipes = getRecipes();
      const defaultRecipe = recipes.find((r) => r.is_default === 1);
      if (defaultRecipe) {
        systemPrompt = defaultRecipe.system_prompt;
      }
    }

    const structured = await structureNotes({
      transcript,
      userNotes,
      recipe: { system_prompt: systemPrompt },
      provider,
      openaiKey,
      anthropicKey,
    });

    // Save AI output and transcript to the notes table
    saveNotes(meetingId, {
      transcript_text: transcript,
      ai_output: structured,
    });

    return structured;
  },
);

// Google Calendar
ipcMain.handle("google-auth", async () => {
  return startGoogleAuth();
});

ipcMain.handle("google-calendar-events", async (_event, daysAhead?: number) => {
  return fetchCalendarEvents(daysAhead);
});

ipcMain.handle("google-is-connected", async () => {
  return isGoogleConnected();
});

ipcMain.handle("google-disconnect", async () => {
  disconnectGoogle();
  return { success: true };
});

// ── System Tray ──────────────────────────────────────────────────────────────

function createTray(): void {
  // Create a 16x16 template image for macOS menu bar
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA" +
    "gklEQVQ4T2NkoBAwUqifYdAb8P/ff4b/DP8ZGBgYGBiZ/jMwMjIyMDL+Z2BkYmRgZPrP" +
    "wMTCxMDEzMzAzMLMwMzKwsDCxsrAys7GwMbBzsDOyc7AycXJwMXNxcDNw83Aw8fDwMvP" +
    "y8Anwi/AJyQkKCAsIiIoIi4mJiohKSElLSMjK6+goAAAHhkjES3EQPAAAAAASUVORK5CYII="
  );
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Phillnola");

  updateTrayMenu();

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

function updateTrayMenu(): void {
  if (!tray) return;

  const recentMeetings = getMeetings().slice(0, 5);

  const recentItems: Electron.MenuItemConstructorOptions[] = recentMeetings.map((m) => ({
    label: m.title,
    click: () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("navigate-meeting", m.id);
      }
    },
  }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Phillnola",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    ...(recentItems.length > 0
      ? [
          { label: "Recent Meetings", enabled: false } as Electron.MenuItemConstructorOptions,
          ...recentItems,
          { type: "separator" as const },
        ]
      : []),
    {
      label: "New Meeting",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send("new-meeting");
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit Phillnola",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Initialize the database before creating the window
  initDatabase();
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  // On macOS, keep app alive in tray
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
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
