import { google } from "googleapis";
import { BrowserWindow } from "electron";
import { getSetting, setSetting } from "./db";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO 8601
  end: string;
  attendees: string[];
  meetLink?: string;
  description?: string;
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

// ── OAuth2 Client ────────────────────────────────────────────────────────────

function getOAuth2Client() {
  const clientId = getSetting("google_client_id");
  const clientSecret = getSetting("google_client_secret");

  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar credentials not configured. Add them in Settings.");
  }

  return new google.auth.OAuth2(clientId, clientSecret, "http://localhost");
}

function loadStoredTokens(): StoredTokens | null {
  const raw = getSetting("google_tokens");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function storeTokens(tokens: StoredTokens): void {
  setSetting("google_tokens", JSON.stringify(tokens));
}

// ── Auth Flow (BrowserWindow popup) ──────────────────────────────────────────

export async function startGoogleAuth(): Promise<{ success: boolean; error?: string }> {
  try {
    const oauth2Client = getOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar.readonly"],
      prompt: "consent",
    });

    // Open a BrowserWindow for the OAuth consent screen
    const authWindow = new BrowserWindow({
      width: 520,
      height: 680,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    authWindow.loadURL(authUrl);

    return new Promise((resolve) => {
      // Listen for the redirect with the auth code
      authWindow.webContents.on("will-redirect", async (_event, url) => {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get("code");
        const error = urlObj.searchParams.get("error");

        if (error) {
          authWindow.close();
          resolve({ success: false, error: `Google auth denied: ${error}` });
          return;
        }

        if (code) {
          try {
            const { tokens } = await oauth2Client.getToken(code);
            storeTokens({
              access_token: tokens.access_token || "",
              refresh_token: tokens.refresh_token || "",
              expiry_date: tokens.expiry_date || 0,
            });
            authWindow.close();
            resolve({ success: true });
          } catch (err) {
            authWindow.close();
            resolve({ success: false, error: `Token exchange failed: ${err}` });
          }
        }
      });

      // Also listen for navigation changes (some flows don't use will-redirect)
      authWindow.webContents.on("will-navigate", async (_event, url) => {
        if (!url.startsWith("http://localhost")) return;

        const urlObj = new URL(url);
        const code = urlObj.searchParams.get("code");

        if (code) {
          try {
            const { tokens } = await oauth2Client.getToken(code);
            storeTokens({
              access_token: tokens.access_token || "",
              refresh_token: tokens.refresh_token || "",
              expiry_date: tokens.expiry_date || 0,
            });
            authWindow.close();
            resolve({ success: true });
          } catch (err) {
            authWindow.close();
            resolve({ success: false, error: `Token exchange failed: ${err}` });
          }
        }
      });

      authWindow.on("closed", () => {
        resolve({ success: false, error: "Auth window was closed" });
      });
    });
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Fetch Calendar Events ────────────────────────────────────────────────────

export async function fetchCalendarEvents(
  daysAhead: number = 7,
): Promise<CalendarEvent[]> {
  const tokens = loadStoredTokens();
  if (!tokens) {
    throw new Error("Not authenticated with Google. Connect your calendar in Settings.");
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  // Auto-refresh tokens if expired
  oauth2Client.on("tokens", (newTokens) => {
    storeTokens({
      access_token: newTokens.access_token || tokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      expiry_date: newTokens.expiry_date || tokens.expiry_date,
    });
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  const events = response.data.items || [];

  return events.map((event) => ({
    id: event.id || "",
    title: event.summary || "Untitled Event",
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    attendees: (event.attendees || [])
      .filter((a) => !a.self)
      .map((a) => a.displayName || a.email || ""),
    meetLink: event.hangoutLink || undefined,
    description: event.description || undefined,
  }));
}

// ── Check Auth Status ────────────────────────────────────────────────────────

export function isGoogleConnected(): boolean {
  const tokens = loadStoredTokens();
  return tokens !== null && !!tokens.refresh_token;
}

export function disconnectGoogle(): void {
  setSetting("google_tokens", "");
}
