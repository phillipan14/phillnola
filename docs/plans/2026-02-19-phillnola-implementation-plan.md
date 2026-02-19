# Phillnola — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an open-source Electron desktop app that captures meeting audio, transcribes via Whisper, and uses AI to generate structured meeting notes from your rough typed notes.

**Architecture:** Electron main process handles system tray, audio capture, and SQLite. React renderer provides the TipTap editor, sidebar, and settings. OpenAI Whisper handles transcription; GPT-4o or Claude handles note structuring. All data local, BYOK for API keys.

**Tech Stack:** Electron 33, React 19, TypeScript, Tailwind CSS 4, TipTap editor, better-sqlite3, OpenAI SDK, Anthropic SDK

---

### Task 1: Scaffold — Electron + React + TypeScript + Tailwind

**Files:**
- Create: `package.json`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/App.tsx`
- Create: `src/index.tsx`
- Create: `src/index.html`
- Create: `src/styles/globals.css`
- Create: `tsconfig.json`
- Create: `electron-builder.json`
- Create: `vite.config.ts`
- Create: `.gitignore`

**Step 1: Initialize project and install dependencies**

```bash
cd ~/phillnola
npm init -y
npm install electron electron-builder vite @vitejs/plugin-react react react-dom tailwindcss @tailwindcss/vite
npm install -D typescript @types/react @types/react-dom @types/node concurrently wait-on
```

**Step 2: Create Electron main process**

Create `electron/main.ts`:
- BrowserWindow creation (1200x800, frameless or with custom titlebar)
- Load vite dev server in dev, built files in production
- IPC handler stubs for: `get-settings`, `save-settings`, `get-meetings`, `start-recording`, `stop-recording`

Create `electron/preload.ts`:
- Expose safe IPC bridge via `contextBridge.exposeInMainWorld`
- Typed API: `window.phillnola.settings.get()`, `window.phillnola.recording.start()`, etc.

**Step 3: Create React app shell**

Create `src/App.tsx`:
- Basic layout: sidebar (240px) + main content area
- Sidebar: "Phillnola" logo, upcoming meetings list (empty), past notes list (empty)
- Main: placeholder "Select or start a meeting"
- Dark/light theme using system preference via `prefers-color-scheme`

Create `src/styles/globals.css`:
- Tailwind imports
- CSS variables for theme colors (amber/gold accent)
- Custom scrollbar styling

**Step 4: Configure Vite for Electron**

Create `vite.config.ts`:
- React plugin + Tailwind plugin
- Base path configured for Electron file:// protocol in production
- Dev server on port 5173

**Step 5: Add npm scripts and verify**

Update `package.json` scripts:
```json
{
  "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
  "build": "vite build && electron-builder",
  "start": "electron ."
}
```

Run: `npm run dev`
Expected: Electron window opens showing the React app with sidebar + main area.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Electron + React + TypeScript + Tailwind app"
```

---

### Task 2: SQLite Database Layer

**Files:**
- Create: `electron/db.ts`
- Create: `electron/migrations.ts`

**Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3 electron-rebuild
npx electron-rebuild
```

**Step 2: Create database module**

Create `electron/db.ts`:
- `initDatabase()` — creates/opens `~/.phillnola/phillnola.db`
- Runs migrations on startup
- Exports typed query helpers: `getMeetings()`, `getMeeting(id)`, `createMeeting(data)`, `updateMeeting(id, data)`, `deleteMeeting(id)`
- `getNotes(meetingId)`, `saveNotes(meetingId, content)`, `searchNotes(query)`
- `getRecipes()`, `getRecipe(id)`, `saveRecipe(data)`
- `getSetting(key)`, `setSetting(key, value)`

Create `electron/migrations.ts`:
```sql
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  calendar_event_id TEXT,
  attendees TEXT DEFAULT '[]',
  recipe_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  content TEXT DEFAULT '{}',
  raw_user_notes TEXT DEFAULT '',
  transcript_text TEXT DEFAULT '',
  ai_output TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  system_prompt TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

**Step 3: Seed default recipes**

Insert 5 built-in recipes in migrations:
- General Meeting, 1:1, Sales/Discovery Call, Interview, Standup
- Each with a well-crafted system prompt

**Step 4: Wire IPC handlers in main.ts**

Register IPC handlers that call db functions:
- `handle('get-meetings')` → `getMeetings()`
- `handle('get-meeting', id)` → `getMeeting(id)`
- `handle('save-notes', meetingId, content)` → `saveNotes(meetingId, content)`
- `handle('get-settings')` → all settings as object
- `handle('save-setting', key, value)` → `setSetting(key, value)`
- `handle('get-recipes')` → `getRecipes()`

**Step 5: Verify**

Run: `npm run dev`
Open DevTools console, call `window.phillnola.settings.get()` — should return empty object.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add SQLite database layer with migrations and IPC handlers"
```

---

### Task 3: Settings & Onboarding Screen

**Files:**
- Create: `src/screens/Onboarding.tsx`
- Create: `src/screens/Settings.tsx`
- Create: `src/hooks/useSettings.ts`

**Step 1: Create useSettings hook**

`src/hooks/useSettings.ts`:
- Calls `window.phillnola.settings.get()` on mount
- `saveSetting(key, value)` calls IPC
- Tracks: `openai_key`, `anthropic_key`, `ai_provider` ('openai' | 'anthropic'), `onboarding_complete`

**Step 2: Create Onboarding screen**

`src/screens/Onboarding.tsx`:
- Step 1: Welcome message + "Paste your OpenAI API key" input
  - Validates key by calling `https://api.openai.com/v1/models` with it
  - Green checkmark on success, red error on failure
- Step 2: Optional Anthropic key for Claude
- Step 3: "Choose your AI provider for note structuring" — radio buttons: GPT-4o / Claude (disabled if no Anthropic key)
- Step 4: "Connect Google Calendar" button (or "Skip for now")
- Step 5: "Choose default recipe" — cards for each of the 5 recipes
- Final: "You're all set" → saves `onboarding_complete: true`

**Step 3: Create Settings screen**

`src/screens/Settings.tsx`:
- Same fields as onboarding but in a form layout
- API keys shown as masked (••••••) with reveal toggle
- "Test Connection" button for each key
- Audio device selector (populated from `navigator.mediaDevices.enumerateDevices()`)
- Storage path display
- "Reset all data" danger button

**Step 4: Wire into App.tsx**

- If `onboarding_complete` is not `true`, show Onboarding
- Otherwise show main app
- Settings accessible from sidebar gear icon

**Step 5: Verify**

Run: `npm run dev`
Expected: Onboarding screen appears on first launch. Paste a key → validates → proceeds through steps.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add onboarding flow and settings screen with API key management"
```

---

### Task 4: TipTap Editor — Meeting Notepad

**Files:**
- Create: `src/components/Editor.tsx`
- Create: `src/components/EditorToolbar.tsx`
- Create: `src/hooks/useEditor.ts`

**Step 1: Install TipTap**

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-heading
```

**Step 2: Create Editor component**

`src/components/Editor.tsx`:
- TipTap editor with StarterKit (bold, italic, lists, headings, code blocks)
- TaskList + TaskItem extensions (for action items with checkboxes)
- Placeholder: "Start typing your notes..."
- Minimal toolbar: Bold, Italic, H1/H2/H3, Bullet list, Task list, Code
- Auto-saves content to SQLite via IPC on debounced change (500ms)
- `editorRef` exposed for programmatic content insertion (AI output)

**Step 3: Create useEditor hook**

`src/hooks/useEditor.ts`:
- Manages current meeting ID
- Loads existing notes on meeting select
- Saves notes on change (debounced)
- `insertAIOutput(content)` — appends structured AI output below user's notes
- `getPlainText()` — extracts user's raw typed text for sending to AI

**Step 4: Integrate into main layout**

Editor fills the main content area. Top bar shows:
- Meeting title (editable)
- Attendees (pills)
- Recipe selector dropdown
- Recording status indicator

**Step 5: Verify**

Run: `npm run dev`
Type in the editor → close and reopen → notes persist from SQLite.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add TipTap rich text editor with auto-save"
```

---

### Task 5: System Audio Capture

**Files:**
- Create: `electron/audio-capture.ts`
- Create: `src/components/RecordingBar.tsx`
- Create: `src/hooks/useRecording.ts`

**Step 1: Create audio capture module**

`electron/audio-capture.ts`:
- `startCapture()`:
  - Uses `desktopCapturer.getSources({ types: ['screen'] })` to get system audio
  - Creates MediaStream from system audio source
  - Also captures microphone via `getUserMedia({ audio: true })`
  - Merges both streams using Web Audio API (AudioContext, MediaStreamDestination)
  - Starts MediaRecorder with `mimeType: 'audio/webm;codecs=opus'`
  - Chunks data every 30 seconds into `~/.phillnola/recordings/{meetingId}/chunk-{n}.webm`
- `stopCapture()`:
  - Stops MediaRecorder
  - Returns array of chunk file paths
- `getAudioLevel()`:
  - Returns current audio level (0-1) for waveform visualizer via AnalyserNode

**Step 2: Create RecordingBar component**

`src/components/RecordingBar.tsx`:
- Fixed bar at bottom of editor
- Shows: red recording dot (pulsing), elapsed time, audio waveform visualizer
- Stop button
- Audio level meter (from `getAudioLevel()` polled at 60fps via requestAnimationFrame)

**Step 3: Create useRecording hook**

`src/hooks/useRecording.ts`:
- `startRecording(meetingId)` — calls IPC to start capture
- `stopRecording()` — calls IPC to stop, returns chunk paths
- `isRecording` state
- `elapsed` timer (updates every second)
- `audioLevel` state (for waveform)

**Step 4: Wire IPC handlers**

In `electron/main.ts`:
- `handle('start-recording', meetingId)` → calls `startCapture(meetingId)`
- `handle('stop-recording')` → calls `stopCapture()`, returns chunk paths
- `handle('get-audio-level')` → returns current level

**Step 5: Verify**

Run: `npm run dev`
Click record → speak → see waveform moving → click stop → check `~/.phillnola/recordings/` for WebM chunks.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add system audio + mic capture with waveform visualizer"
```

---

### Task 6: Whisper Transcription

**Files:**
- Create: `electron/transcribe.ts`
- Create: `src/components/ProcessingOverlay.tsx`

**Step 1: Install OpenAI SDK**

```bash
npm install openai
```

**Step 2: Create transcription module**

`electron/transcribe.ts`:
- `transcribeChunks(chunkPaths: string[], apiKey: string): Promise<string>`
  - Reads each WebM chunk file
  - Calls `openai.audio.transcriptions.create({ model: 'whisper-1', file, response_format: 'verbose_json' })`
  - Processes chunks in parallel (max 5 concurrent via Promise pool)
  - Concatenates transcript segments in order with timestamps
  - Returns full transcript text
  - Cleans up chunk files after successful transcription

**Step 3: Create ProcessingOverlay component**

`src/components/ProcessingOverlay.tsx`:
- Full-screen semi-transparent overlay on the editor
- Animated progress: "Transcribing audio..." → "Structuring notes..." → "Done!"
- Progress bar based on chunks completed / total chunks
- Cancel button

**Step 4: Wire IPC handler**

In `electron/main.ts`:
- `handle('transcribe', chunkPaths)`:
  - Gets OpenAI key from settings
  - Calls `transcribeChunks(chunkPaths, key)`
  - Sends progress events to renderer via `webContents.send('transcribe-progress', { completed, total })`
  - Returns transcript text

**Step 5: Verify**

Record a short meeting → stop → transcription runs → check that transcript text is returned and stored in notes table.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Whisper transcription with parallel chunk processing"
```

---

### Task 7: AI Note Structuring (GPT-4o + Claude)

**Files:**
- Create: `electron/ai-structure.ts`

**Step 1: Install Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

**Step 2: Create AI structuring module**

`electron/ai-structure.ts`:
- `structureNotes(params): Promise<string>`:
  - Params: `{ transcript, userNotes, recipe, provider, openaiKey?, anthropicKey? }`
  - Builds prompt: recipe system prompt + transcript + user's raw notes
  - If provider is 'openai': calls GPT-4o via OpenAI SDK
  - If provider is 'anthropic': calls Claude via Anthropic SDK
  - Returns structured Markdown output

- System prompt template:
```
You are a meeting note assistant. Given a transcript and the user's rough notes,
produce structured meeting notes in the following format:

{recipe.system_prompt}

TRANSCRIPT:
{transcript}

USER'S NOTES:
{userNotes}

Produce the structured notes now. Use Markdown formatting.
Preserve any specific details, names, numbers, and quotes from the transcript.
Incorporate the user's notes — they highlight what the user found important.
```

**Step 3: Wire IPC handler**

In `electron/main.ts`:
- `handle('structure-notes', { meetingId, transcript, userNotes, recipeId })`:
  - Gets API keys and provider from settings
  - Gets recipe system prompt from db
  - Calls `structureNotes()`
  - Saves AI output to notes table
  - Returns structured Markdown

**Step 4: Create end-to-end meeting flow**

When user clicks "Stop Recording":
1. `stopRecording()` → chunk paths
2. `transcribe(chunkPaths)` → transcript text
3. `structureNotes({ transcript, userNotes, recipeId })` → structured output
4. Insert structured output into TipTap editor below user's notes
5. Save everything to SQLite

**Step 5: Verify**

Record a meeting → stop → watch transcription + structuring → structured notes appear in editor with Summary, Action Items, etc.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add AI note structuring with GPT-4o and Claude support"
```

---

### Task 8: Google Calendar Integration

**Files:**
- Create: `electron/calendar.ts`
- Create: `src/components/MeetingList.tsx`

**Step 1: Install Google APIs**

```bash
npm install googleapis
```

**Step 2: Create calendar module**

`electron/calendar.ts`:
- OAuth 2.0 flow using Electron's `BrowserWindow` for consent screen
- Client ID embedded (create Google Cloud project, OAuth consent screen)
- `getUpcomingMeetings()` — fetches today's events from primary calendar
- `watchForMeetingStart()` — polls every 60s, detects when a meeting with a video link starts
- Emits `meeting-starting` event with event details (title, attendees, link)
- Stores refresh token in settings

**Step 3: Create MeetingList component**

`src/components/MeetingList.tsx`:
- Renders in sidebar
- Shows today's upcoming meetings with time, title, attendees count
- Currently active meeting highlighted with green dot
- Click to open/create notes for that meeting
- "Join Meeting" button opens the video link in browser
- Past meetings shown below with search

**Step 4: Auto-start recording**

When `meeting-starting` event fires:
- Create meeting record in SQLite
- Open notepad for that meeting
- Show "Start Recording?" prompt (or auto-start if user has enabled it in settings)

**Step 5: Verify**

Connect Google Calendar → see today's meetings in sidebar → click one → notepad opens → recording prompt appears.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Google Calendar integration with meeting detection"
```

---

### Task 9: Recipes System

**Files:**
- Create: `src/components/RecipeSelector.tsx`
- Create: `src/screens/RecipeEditor.tsx`

**Step 1: Create RecipeSelector component**

`src/components/RecipeSelector.tsx`:
- Dropdown in the editor top bar
- Shows all recipes with name + brief description
- Star icon for default recipe
- "Create Custom Recipe" option at bottom

**Step 2: Create RecipeEditor screen**

`src/screens/RecipeEditor.tsx`:
- Name input
- Description input
- System prompt textarea (large, with syntax highlighting for placeholders)
- Preview: shows sample output from a test transcript
- "Test this recipe" button — runs structuring on a sample meeting
- Save / Delete buttons
- Built-in recipes are read-only but can be duplicated

**Step 3: Wire to meeting flow**

- When creating a meeting, assign the default recipe
- User can change recipe before or after structuring
- "Regenerate" button re-runs AI with selected recipe

**Step 4: Verify**

Create a custom recipe → use it on a meeting → verify output matches the recipe format.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recipe system with custom prompt editor"
```

---

### Task 10: System Tray

**Files:**
- Create: `electron/tray.ts`
- Create: `assets/tray-icon.png` (16x16 and 32x32)
- Create: `assets/tray-icon-recording.png`

**Step 1: Create tray module**

`electron/tray.ts`:
- Creates Tray with Phillnola icon
- Context menu:
  - Next meeting: "{title} in {minutes}m" (or "No upcoming meetings")
  - Separator
  - Start Recording (if not recording)
  - Stop Recording (if recording)
  - Separator
  - Open Phillnola
  - Settings
  - Separator
  - Quit
- Click tray icon → toggle main window visibility
- Icon changes to red dot when recording
- Tooltip shows next meeting info

**Step 2: Keep app running when window closed**

- Override window close to hide instead of quit
- Quit only from tray menu or Cmd+Q
- App starts minimized to tray option in settings

**Step 3: Verify**

Close window → tray icon persists → click to reopen → right-click shows menu → "Start Recording" works from tray.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add system tray with recording controls and meeting info"
```

---

### Task 11: Search & Meeting History

**Files:**
- Create: `src/components/SearchBar.tsx`
- Create: `src/components/MeetingHistory.tsx`

**Step 1: Add FTS to SQLite**

In `electron/db.ts`:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  meeting_id, raw_user_notes, transcript_text, ai_output
);
```
- Trigger to keep FTS in sync with notes table
- `searchNotes(query)` → returns matching meetings with highlighted snippets

**Step 2: Create SearchBar component**

`src/components/SearchBar.tsx`:
- Search input at top of sidebar (Cmd+K shortcut)
- Debounced search (300ms)
- Results show meeting title, date, and matching snippet with highlighted terms
- Click result → opens that meeting's notes

**Step 3: Create MeetingHistory component**

`src/components/MeetingHistory.tsx`:
- Grouped by date (Today, Yesterday, This Week, Older)
- Each item: title, date, duration, attendee count, recipe badge
- Right-click: Delete meeting, Export as Markdown
- Infinite scroll / virtual list for performance

**Step 4: Verify**

Create several meetings → search for a keyword → results appear → click to navigate.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add full-text search and meeting history"
```

---

### Task 12: Export & Clipboard

**Files:**
- Create: `electron/export.ts`
- Create: `src/components/ExportMenu.tsx`

**Step 1: Create export module**

`electron/export.ts`:
- `exportMarkdown(meetingId)` — converts TipTap JSON to Markdown, saves to file dialog
- `exportJSON(meetingId)` — exports full meeting data as JSON
- `copyToClipboard(meetingId)` — copies Markdown to system clipboard

**Step 2: Create ExportMenu component**

`src/components/ExportMenu.tsx`:
- Dropdown button in editor top bar
- Options: Copy as Markdown, Export .md file, Export .json
- Keyboard shortcut: Cmd+Shift+C for copy

**Step 3: Verify**

Open meeting notes → Copy as Markdown → paste in a text editor → verify formatting.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Markdown and JSON export with clipboard support"
```

---

### Task 13: Polish — UI, Themes, Animations

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/App.tsx`
- Create: `src/components/ThemeProvider.tsx`
- Create: `assets/icon.png` (app icon, 512x512)

**Step 1: Theme system**

- Light and dark themes following system preference
- CSS variables: `--bg-primary`, `--bg-secondary`, `--accent` (amber/gold), `--text-primary`, etc.
- Smooth transitions between themes

**Step 2: Animations**

- Recording pulse animation (red dot)
- Waveform visualizer smoothing
- Processing overlay with animated progress
- Sidebar slide transitions
- Editor content fade-in after AI structuring

**Step 3: App icon and branding**

- Create Phillnola icon (bowl of granola with a play button or audio wave)
- Set as Electron app icon and tray icon
- Window title: "Phillnola"

**Step 4: Responsive layout**

- Collapsible sidebar (Cmd+\)
- Min window size: 800x600
- Draggable custom titlebar (macOS traffic lights)

**Step 5: Verify visually**

Toggle dark/light mode → all elements themed properly. Resize window → layout adapts.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add light/dark themes, animations, and branding"
```

---

### Task 14: README + GitHub Setup

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Modify: `.gitignore`

**Step 1: Write README**

- Hero: screenshot of the app in dark mode with structured notes visible
- Badges: Open Source, BYOK, No Bot, macOS
- One-liner: "The open-source AI meeting notepad. No bot. No server. Your keys. Your data."
- Features list
- Quick start (clone → npm install → npm run dev)
- How it works (with diagram)
- Recipes section
- Screenshots (onboarding, recording, structured notes, search)
- Tech stack
- Contributing guide
- "Why Phillnola?" section (Granola costs $14/mo, this is free with your own keys)
- License: MIT

**Step 2: Create GitHub repo and push**

```bash
gh repo create phillnola --public --description "Open-source AI meeting notepad. Captures audio, transcribes via Whisper, structures notes with GPT-4o or Claude. No bot. BYOK." --source . --push
```

**Step 3: Commit**

```bash
git add -A
git commit -m "docs: add README, LICENSE, and polish for public release"
```

---

### Task 15: Build & Release

**Step 1: Configure electron-builder**

`electron-builder.json`:
```json
{
  "appId": "com.phillnola.app",
  "productName": "Phillnola",
  "mac": {
    "target": ["dmg", "zip"],
    "category": "public.app-category.productivity",
    "icon": "assets/icon.png"
  },
  "dmg": {
    "title": "Phillnola"
  }
}
```

**Step 2: Build and test DMG**

```bash
npm run build
```

Open the DMG → install → launch → verify full flow works outside dev mode.

**Step 3: Create GitHub release**

```bash
gh release create v1.0.0 dist/Phillnola-*.dmg --title "v1.0.0 — Phillnola" --notes "Initial release. macOS only."
```

**Step 4: Run release-project skill**

Security scan, .gitignore hardening, update GitHub profile README.
