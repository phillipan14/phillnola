import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { useSettings } from "./hooks/useSettings";
import { useRecording } from "./hooks/useRecording";
import Editor from "./components/Editor";
import type { EditorHandle } from "./components/Editor";
import RecordingBar from "./components/RecordingBar";
import ProcessingOverlay from "./components/ProcessingOverlay";
import type { ProcessingStage } from "./components/ProcessingOverlay";

const Onboarding = lazy(() => import("./screens/Onboarding"));
const Settings = lazy(() => import("./screens/Settings"));
const RecipeEditor = lazy(() => import("./screens/RecipeEditor"));

/* -- Types ---------------------------------------------------------- */

interface Meeting {
  id: string;
  title: string;
  date: string; // ISO date string for DateBadge
  time: string;
  duration?: string;
  attendees: string[];
  isLive?: boolean;
  isCalendar?: boolean;
  meetLink?: string;
  calendarEventId?: string;
  durationSeconds?: number;
}

interface MeetingGroup {
  label: string;
  meetings: Meeting[];
}

interface Recipe {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  is_default: number;
}

interface SearchResult {
  meeting_id: string;
  meeting_title: string;
}

type ThemeMode = "system" | "light" | "dark";

/* -- Helpers -------------------------------------------------------- */

function formatTimeShort(isoDate: string): string {
  const d = new Date(isoDate);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function groupMeetings(
  dbMeetings: { id: string; title: string; date: string; attendees: string; duration_seconds: number; calendar_event_id: string | null }[],
  calendarEvents: { id: string; title: string; start: string; end: string; attendees: string[]; meetLink?: string }[],
): MeetingGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, Meeting[]> = { Today: [], Yesterday: [], "This Week": [], Upcoming: [], Older: [] };

  // Build meetLink map from calendar events (calendar_event_id → meetLink)
  const meetLinkMap = new Map<string, string>();
  for (const e of calendarEvents) {
    if (e.meetLink) meetLinkMap.set(e.id, e.meetLink);
  }

  // Add database meetings
  for (const m of dbMeetings) {
    const d = new Date(m.date);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let group = "Older";
    if (dayStart.getTime() === today.getTime()) group = "Today";
    else if (dayStart.getTime() === yesterday.getTime()) group = "Yesterday";
    else if (dayStart > yesterday) group = "This Week";

    const durationMin = Math.round(m.duration_seconds / 60);
    const durationStr = durationMin > 0 ? `${durationMin} min` : undefined;
    let attendees: string[] = [];
    try { attendees = JSON.parse(m.attendees); } catch { /* empty */ }

    groups[group].push({
      id: m.id,
      title: m.title,
      date: m.date,
      time: formatTimeShort(m.date),
      duration: durationStr,
      attendees,
      meetLink: m.calendar_event_id ? meetLinkMap.get(m.calendar_event_id) : undefined,
      calendarEventId: m.calendar_event_id || undefined,
    });
  }

  // Add calendar events (upcoming only, not already in DB)
  const dbCalIds = new Set(dbMeetings.map((m) => m.calendar_event_id).filter(Boolean));
  for (const e of calendarEvents) {
    if (dbCalIds.has(e.id)) continue;
    const d = new Date(e.start);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let group = "Upcoming";
    if (dayStart.getTime() === today.getTime()) group = "Today";

    const endMs = new Date(e.end).getTime();
    const startMs = d.getTime();
    const durationMin = Math.round((endMs - startMs) / 60000);
    const durationStr = durationMin > 0 ? `${durationMin} min` : undefined;

    groups[group].push({
      id: `cal-${e.id}`,
      title: e.title,
      date: e.start,
      time: formatTimeShort(e.start),
      duration: durationStr,
      attendees: e.attendees,
      isCalendar: true,
      meetLink: e.meetLink,
      calendarEventId: e.id,
      durationSeconds: durationMin > 0 ? durationMin * 60 : undefined,
    });
  }

  // Build ordered result, excluding empty groups
  const orderedLabels = ["Today", "Yesterday", "This Week", "Upcoming", "Older"];
  return orderedLabels
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, meetings: groups[label] }));
}

/* -- Subcomponents -------------------------------------------------- */

function AvatarStack({ names }: { names: string[] }) {
  const colors = ["#c2742f", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b"];
  return (
    <div className="flex items-center" style={{ gap: 0 }}>
      {names.slice(0, 4).map((name, i) => (
        <div
          key={name}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 24,
            height: 24,
            fontSize: 10,
            fontWeight: 600,
            color: "#fff",
            backgroundColor: colors[i % colors.length],
            border: "2px solid var(--color-bg-primary)",
            marginLeft: i > 0 ? -6 : 0,
          }}
        >
          {name[0]}
        </div>
      ))}
      {names.length > 4 && (
        <div
          className="flex items-center justify-center rounded-full text-[9px] font-medium"
          style={{
            width: 24,
            height: 24,
            backgroundColor: "var(--color-bg-hover)",
            color: "var(--color-text-muted)",
            border: "2px solid var(--color-bg-primary)",
            marginLeft: -6,
          }}
        >
          +{names.length - 4}
        </div>
      )}
    </div>
  );
}

function DancingBars({ playing = true, color = "var(--color-success)" }: { playing?: boolean; color?: string }) {
  return (
    <div className="dancing-bars">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className="bar"
          style={{
            backgroundColor: color,
            animationPlayState: playing ? "running" : "paused",
            height: playing ? undefined : [6, 10, 4, 8, 5][n - 1],
          }}
        />
      ))}
    </div>
  );
}

/* -- DateBadge (calendar / upcoming meetings) ----------------------- */

function DateBadge({ date }: { date: string }) {
  const d = new Date(date);
  const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = d.getDate();
  return (
    <div className="date-badge" style={{
      width: 40,
      height: 44,
      borderRadius: 8,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "var(--color-bg-secondary)",
      border: "1px solid var(--color-border)",
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.05em",
        color: "var(--color-recording)",
        lineHeight: 1,
      }}>{month}</span>
      <span style={{
        fontSize: 18,
        fontWeight: 700,
        color: "var(--color-text-primary)",
        lineHeight: 1.2,
      }}>{day}</span>
    </div>
  );
}

/* -- MeetingAvatar (colored circle with initial) -------------------- */

const AVATAR_COLORS = ["#c2742f", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function MeetingAvatar({ name }: { name: string }) {
  const colorIndex = name.charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <div
      className="meeting-avatar"
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: AVATAR_COLORS[colorIndex],
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {name[0]?.toUpperCase()}
    </div>
  );
}

/* -- DocumentIcon (for personal notes without attendees) ------------ */

function DocumentIcon() {
  return (
    <div
      className="meeting-doc-icon"
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-bg-hover)",
        color: "var(--color-text-muted)",
        flexShrink: 0,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </div>
  );
}

/* -- Markdown to HTML (lightweight) --------------------------------- */

function markdownToHtml(md: string): string {
  return md
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    // Paragraphs: wrap lines that aren't already wrapped in tags
    .replace(/^(?!<[hulo])((?!<).+)$/gm, "<p>$1</p>")
    // Clean up extra newlines
    .replace(/\n{2,}/g, "\n");
}

/* -- HTML to Markdown (lightweight) --------------------------------- */

function htmlToMarkdown(html: string): string {
  return html
    // Headings
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
    // Bold and italic
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    // List items
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    // Remove wrapping ul/ol tags
    .replace(/<\/?[uo]l[^>]*>/gi, "\n")
    // Horizontal rules
    .replace(/<hr[^>]*\/?>/gi, "---\n\n")
    // Paragraphs and line breaks
    .replace(/<br[^>]*\/?>/gi, "\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    // Blockquotes
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, "> $1\n\n")
    // Code blocks
    .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, "```\n$1\n```\n\n")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Clean up excessive newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -- Theme helpers -------------------------------------------------- */

function applyTheme(mode: ThemeMode): void {
  const html = document.documentElement;
  if (mode === "system") {
    html.removeAttribute("data-theme");
  } else {
    html.setAttribute("data-theme", mode);
  }
}

function cycleTheme(current: ThemeMode): ThemeMode {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}

function themeIcon(mode: ThemeMode): string {
  if (mode === "light") return "sun";
  if (mode === "dark") return "moon";
  return "monitor";
}

/* -- Format date for detail view metadata pill ---------------------- */

function formatDatePill(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const meetingDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  let dayLabel: string;
  if (meetingDay.getTime() === today.getTime()) {
    dayLabel = "Today";
  } else {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (meetingDay.getTime() === yesterday.getTime()) {
      dayLabel = "Yesterday";
    } else {
      dayLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
  }
  const timeStr = formatTimeShort(isoDate);
  return `${dayLabel}, ${timeStr}`;
}

/* -- App ------------------------------------------------------------ */

export default function App() {
  const { settings, loading, saveSetting, isOnboarded } = useSettings();
  const { startRecording, stopRecording, isRecording, elapsed, audioLevel, error: recordingError } = useRecording();
  const [selectedMeeting, setSelectedMeeting] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showRecipeEditor, setShowRecipeEditor] = useState(false);
  const editorRef = useRef<EditorHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Data from DB + Calendar
  const [meetingGroups, setMeetingGroups] = useState<MeetingGroup[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");

  // Search results from note content search
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Clipboard feedback
  const [showCopied, setShowCopied] = useState(false);

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);

  // View navigation (home = meeting list, detail = note editor)
  const [view, setView] = useState<"home" | "detail">("home");

  // Google Calendar connection state
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);

  // Theme
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (settings.theme as ThemeMode) || "system";
  });

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>("transcribing");
  const [chunksCompleted, setChunksCompleted] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);
  const processingCancelledRef = useRef(false);

  // Error toast
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load meetings from DB + Google Calendar
  const loadMeetings = useCallback(async () => {
    const dbMeetings = (await window.phillnola.meetings.list()) as {
      id: string; title: string; date: string; attendees: string; duration_seconds: number; calendar_event_id: string | null;
    }[];

    let calendarEvents: { id: string; title: string; start: string; end: string; attendees: string[]; meetLink?: string }[] = [];
    try {
      const connected = await window.phillnola.calendar.isConnected();
      if (connected) {
        calendarEvents = await window.phillnola.calendar.getEvents(7);
      }
    } catch {
      // Calendar not configured -- that's fine
    }

    const groups = groupMeetings(dbMeetings, calendarEvents);
    setMeetingGroups(groups);

    // Select first meeting if none selected
    if (!selectedMeeting && groups.length > 0 && groups[0].meetings.length > 0) {
      setSelectedMeeting(groups[0].meetings[0].id);
    }
  }, [selectedMeeting]);

  // Load recipes from DB
  const loadRecipes = useCallback(async () => {
    const list = (await window.phillnola.recipes.list()) as Recipe[];
    setRecipes(list);
    // Set default recipe
    const def = list.find((r) => r.is_default === 1);
    if (def && !selectedRecipeId) {
      setSelectedRecipeId(def.id);
    }
  }, [selectedRecipeId]);

  // Initial data load + check calendar connection
  useEffect(() => {
    if (isOnboarded) {
      loadMeetings();
      loadRecipes();
      window.phillnola.calendar.isConnected().then(setCalendarConnected).catch(() => setCalendarConnected(false));
    }
  }, [isOnboarded, loadMeetings, loadRecipes]);

  // Refresh meetings every 5 minutes (picks up new calendar events)
  useEffect(() => {
    if (!isOnboarded) return;
    const interval = setInterval(() => {
      loadMeetings();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isOnboarded, loadMeetings]);

  // Listen for transcription progress events from main process
  useEffect(() => {
    const unsubscribe = window.phillnola.ai.onTranscribeProgress((progress) => {
      setChunksCompleted(progress.completed);
      setChunksTotal(progress.total);
    });
    return unsubscribe;
  }, []);

  // Listen for tray navigation events
  useEffect(() => {
    const unsubNavigate = window.phillnola.on("navigate-meeting", (meetingId) => {
      setSelectedMeeting(meetingId as string);
      setView("detail");
      setShowSettings(false);
    });
    const unsubNew = window.phillnola.on("new-meeting", () => {
      handleNewMeeting();
    });
    return () => { unsubNavigate(); unsubNew(); };
  }, []);

  // -- Search notes content when query changes ----------------------
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = (await window.phillnola.notes.search(searchQuery)) as {
          meeting_id: string;
          meeting_title: string;
        }[];
        setSearchResults(
          results.map((r) => ({
            meeting_id: r.meeting_id,
            meeting_title: r.meeting_title,
          })),
        );
      } catch {
        setSearchResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // -- Initialize and sync theme ------------------------------------
  useEffect(() => {
    const saved = settings.theme as ThemeMode | undefined;
    const mode = saved || "system";
    setThemeMode(mode);
    applyTheme(mode);
  }, [settings.theme]);

  // -- Copy to clipboard -------------------------------------------
  const handleCopyToClipboard = useCallback(async () => {
    if (!editorRef.current) return;
    const html = editorRef.current.getHTML();
    const md = htmlToMarkdown(html);
    await navigator.clipboard.writeText(md);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1500);
  }, []);

  // -- Export as markdown file --------------------------------------
  const handleExport = useCallback((title: string) => {
    if (!editorRef.current) return;
    const html = editorRef.current.getHTML();
    const md = htmlToMarkdown(html);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "meeting-notes";
    a.download = `${safeTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // -- Theme toggle -------------------------------------------------
  const handleThemeToggle = useCallback(() => {
    setThemeMode((prev) => {
      const next = cycleTheme(prev);
      applyTheme(next);
      saveSetting("theme", next);
      return next;
    });
  }, [saveSetting]);

  // Create a new meeting
  const handleNewMeeting = useCallback(async () => {
    const now = new Date();
    const meeting = await window.phillnola.meetings.create({
      title: `Meeting — ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
      date: now.toISOString(),
    });
    const created = meeting as { id: string };
    await loadMeetings();
    setSelectedMeeting(created.id);
    setView("detail");
    setShowSettings(false);
  }, [loadMeetings]);

  // Guard against double-click creating duplicate DB meetings from calendar events
  const creatingFromCalRef = useRef<Set<string>>(new Set());

  // Navigate to a meeting (auto-creates DB record for calendar events)
  const handleSelectMeeting = useCallback(async (id: string) => {
    if (id.startsWith("cal-")) {
      // Prevent duplicate creation on double-click
      if (creatingFromCalRef.current.has(id)) return;
      creatingFromCalRef.current.add(id);

      try {
        const calMeeting = meetingGroups.flatMap((g) => g.meetings).find((m) => m.id === id);
        if (calMeeting) {
          const created = (await window.phillnola.meetings.create({
            title: calMeeting.title,
            date: calMeeting.date,
            duration_seconds: calMeeting.durationSeconds || 0,
            calendar_event_id: calMeeting.calendarEventId,
            attendees: calMeeting.attendees,
          })) as { id: string };
          await loadMeetings();
          setSelectedMeeting(created.id);
          setView("detail");
          setShowSettings(false);
          setConfirmDelete(false);
          return;
        }
      } catch (err) {
        console.error("Failed to create meeting from calendar event:", err);
      } finally {
        creatingFromCalRef.current.delete(id);
      }
    }
    setSelectedMeeting(id);
    setView("detail");
    setShowSettings(false);
    setConfirmDelete(false);
  }, [meetingGroups, loadMeetings]);

  // Go back to home
  const handleBackToHome = useCallback(() => {
    setView("home");
    setSearchQuery("");
  }, []);

  // Delete a meeting
  const handleDeleteMeeting = useCallback(async () => {
    if (!selectedMeeting) return;
    await window.phillnola.meetings.delete(selectedMeeting);
    setSelectedMeeting("");
    setConfirmDelete(false);
    setView("home");
    await loadMeetings();
  }, [selectedMeeting, loadMeetings]);

  // Save edited title
  const handleTitleSave = useCallback(async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || !activeMeeting || trimmed === activeMeeting.title) return;
    await window.phillnola.meetings.update(activeMeeting.id, { title: trimmed });
    await loadMeetings();
  }, [editTitle, loadMeetings]);

  /**
   * End-to-end flow: Stop Recording -> Transcribe -> Structure -> Insert
   */
  const handleStopAndProcess = useCallback(async () => {
    if (!selectedMeeting) return;

    processingCancelledRef.current = false;

    // 1. Stop recording and get chunk paths
    const chunkPaths = await stopRecording();
    console.log("Recording stopped. Chunks:", chunkPaths);

    if (chunkPaths.length === 0) {
      console.log("No audio chunks recorded, skipping transcription.");
      return;
    }

    // Start processing overlay
    setIsProcessing(true);
    setProcessingStage("transcribing");
    setChunksCompleted(0);
    setChunksTotal(chunkPaths.length);

    try {
      // 2. Transcribe audio chunks
      const transcript = await window.phillnola.ai.transcribe(chunkPaths);

      if (processingCancelledRef.current) return;
      if (!transcript.trim()) {
        console.log("Transcription returned empty, skipping structuring.");
        setIsProcessing(false);
        return;
      }

      // 3. Structure notes with AI first (appears on top)
      setProcessingStage("structuring");
      const userNotes = editorRef.current?.getPlainText() || "";

      const structured = await window.phillnola.ai.structureNotes({
        meetingId: selectedMeeting,
        transcript,
        userNotes,
        recipeId: selectedRecipeId || undefined,
      });

      if (processingCancelledRef.current) return;

      // 4. Insert AI structured notes on top, then transcript below
      if (editorRef.current) {
        const transcriptParagraphs = transcript
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => `<p>${line}</p>`)
          .join("");

        let outputHtml = "";

        // AI-structured notes first (top)
        if (structured) {
          outputHtml += `
            <hr />
            <h2>AI-Structured Notes</h2>
            ${markdownToHtml(structured)}
          `;
        }

        // Transcript at the bottom
        outputHtml += `
          <hr />
          <h2>Transcript</h2>
          ${transcriptParagraphs}
        `;

        editorRef.current.insertAIOutput(outputHtml);
      }

      // 5. Show done state briefly
      setProcessingStage("done");
      setTimeout(() => {
        setIsProcessing(false);
      }, 1500);
    } catch (err) {
      console.error("Processing failed:", err);
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : "Processing failed";
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 6000);
    }
  }, [selectedMeeting, stopRecording]);

  const handleCancelProcessing = useCallback(() => {
    processingCancelledRef.current = true;
    setIsProcessing(false);
  }, []);

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      await handleStopAndProcess();
    } else if (selectedMeeting) {
      await startRecording(selectedMeeting);
    }
  }, [isRecording, selectedMeeting, startRecording, handleStopAndProcess]);

  const handleStopRecording = useCallback(async () => {
    await handleStopAndProcess();
  }, [handleStopAndProcess]);

  // -- Keyboard shortcuts -------------------------------------------
  // Keep refs to avoid stale closures in the global listener
  const newMeetingRef = useRef(handleNewMeeting);
  newMeetingRef.current = handleNewMeeting;
  const toggleRecRef = useRef(handleToggleRecording);
  toggleRecRef.current = handleToggleRecording;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+K -- focus search
      if (meta && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Cmd+N -- new meeting
      if (meta && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        newMeetingRef.current();
      }

      // Cmd+Shift+R -- toggle recording
      if (meta && e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        toggleRecRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const allMeetings = useMemo(() => meetingGroups.flatMap((g) => g.meetings), [meetingGroups]);
  const activeMeeting = allMeetings.find((m) => m.id === selectedMeeting);
  const hasAnyMeetings = allMeetings.length > 0;

  // -- Sync edit title when meeting selection changes ---------------
  useEffect(() => {
    if (activeMeeting) setEditTitle(activeMeeting.title);
    setConfirmDelete(false);
  }, [selectedMeeting, activeMeeting?.title]);

  // -- Redirect detail view if no active meeting -------------------
  useEffect(() => {
    if (view === "detail" && !activeMeeting && selectedMeeting === "") {
      setView("home");
    }
  }, [view, activeMeeting, selectedMeeting]);

  // Deduplicated search results (exclude meetings already shown via title filter)
  const filteredSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const titleMatchIds = new Set(
      allMeetings
        .filter((m) => m.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .map((m) => m.id),
    );
    return searchResults.filter((r) => !titleMatchIds.has(r.meeting_id));
  }, [searchQuery, searchResults, allMeetings]);

  /* -- Loading State ------------------------------------------------ */

  if (loading) {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        <div className="drag-region fixed top-0 left-0 right-0" style={{ height: 38 }} />
        <div
          className="rounded-full border-2 border-t-transparent"
          style={{
            width: 24,
            height: 24,
            borderColor: "var(--color-accent)",
            borderTopColor: "transparent",
            animation: "spin 0.6s linear infinite",
          }}
        />
      </div>
    );
  }

  /* -- Onboarding --------------------------------------------------- */

  if (!isOnboarded) {
    return (
      <Suspense fallback={<div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-bg-primary)", color: "var(--color-text-primary)" }}>Loading...</div>}>
        <Onboarding
          onComplete={() => {
            // Force a re-render by reloading settings
            window.location.reload();
          }}
          saveSetting={saveSetting}
        />
      </Suspense>
    );
  }

  /* -- Settings Screen (full-page centered) ------------------------- */

  if (showSettings) {
    return (
      <div className="h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--color-bg-primary)", position: "relative" }}>
        <div className="drag-region" style={{ height: 38 }} />
        {/* Top bar with back button */}
        <div
          className="flex items-center"
          style={{
            padding: "0 24px",
            height: 48,
          }}
        >
          <button
            onClick={() => { setShowSettings(false); setView("home"); }}
            className="back-btn no-drag flex items-center"
            style={{
              gap: 6,
              fontSize: 14,
              fontWeight: 500,
              color: "var(--color-text-muted)",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Home
          </button>
        </div>
        <div className="flex-1 overflow-hidden" style={{ height: "calc(100vh - 86px)" }}>
          <Suspense fallback={null}>
            <Settings
              settings={settings}
              saveSetting={saveSetting}
              onClose={() => { setShowSettings(false); setView("home"); }}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  /* -- Recipe Editor Screen ----------------------------------------- */

  if (showRecipeEditor) {
    return (
      <div className="h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--color-bg-primary)", position: "relative" }}>
        <div className="drag-region" style={{ height: 38 }} />
        <div className="flex-1 overflow-hidden" style={{ height: "calc(100vh - 38px)" }}>
          <Suspense fallback={null}>
            <RecipeEditor
              onClose={() => {
                setShowRecipeEditor(false);
                loadRecipes();
              }}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  /* -- Main App (single column centered) ----------------------------- */

  return (
    <div className="h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--color-bg-primary)", position: "relative", display: "flex", flexDirection: "column" }}>
      {/* Error toast */}
      {errorMessage && (
        <div
          style={{
            position: "fixed",
            top: 52,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            backgroundColor: "#dc2626",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            cursor: "pointer",
            maxWidth: 400,
          }}
          onClick={() => setErrorMessage(null)}
        >
          {errorMessage}
        </div>
      )}

      {/* macOS drag region */}
      <div className="drag-region" style={{ height: 38, flexShrink: 0 }} />

      {/* ============================================================ */}
      {/* HOME VIEW                                                     */}
      {/* ============================================================ */}
      {view === "home" && (
        <>
          {/* Top bar: traffic lights area + quick-note + theme + gear */}
          <div
            className="flex items-center justify-between no-drag"
            style={{
              padding: "0 24px 0 80px",
              height: 48,
              flexShrink: 0,
            }}
          >
            {/* Left spacer for traffic lights */}
            <div />

            {/* Right actions */}
            <div className="flex items-center" style={{ gap: 8 }}>
              {/* + Quick note */}
              <button
                onClick={handleNewMeeting}
                className="btn btn-ghost no-drag flex items-center"
                style={{ gap: 6, fontSize: 13, fontWeight: 500, padding: "8px 14px", borderRadius: 8 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Quick note
              </button>

              {/* Theme toggle */}
              <button
                className="btn btn-ghost no-drag"
                style={{ padding: 8 }}
                title={`Theme: ${themeMode}`}
                onClick={handleThemeToggle}
              >
                {themeIcon(themeMode) === "sun" && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                )}
                {themeIcon(themeMode) === "moon" && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
                {themeIcon(themeMode) === "monitor" && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                )}
              </button>

              {/* Settings gear */}
              <button
                className="btn btn-ghost no-drag"
                title="Settings"
                onClick={() => setShowSettings(true)}
                style={{ padding: 8 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable meeting list */}
          <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 80 }}>
            <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>

              {/* Calendar connection prompt */}
              {calendarConnected === false && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="no-drag w-full text-left"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 18px",
                    marginTop: 8,
                    marginBottom: 16,
                    borderRadius: 12,
                    border: "1.5px dashed var(--color-border)",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-bg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: "var(--color-accent-subtle)",
                      color: "var(--color-accent)",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
                      Connect Google Calendar
                    </div>
                    <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
                      See upcoming meetings automatically
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}

              {/* Search Results section */}
              {filteredSearchResults.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "16px 0 8px 0",
                    color: "var(--color-accent)",
                  }}>
                    Search Results
                  </div>
                  {filteredSearchResults.map((result) => (
                    <button
                      key={`search-${result.meeting_id}`}
                      className="no-drag w-full text-left"
                      onClick={() => handleSelectMeeting(result.meeting_id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "12px 12px",
                        borderRadius: 10,
                        border: "none",
                        backgroundColor: "transparent",
                        cursor: "pointer",
                        width: "100%",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-bg-hover)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    >
                      <DocumentIcon />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {result.meeting_title}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
                          Matched in notes
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Meeting groups */}
              {meetingGroups.map((group, groupIdx) => {
                const isComingUp = groupIdx === 0 && (group.label === "Today" || group.label === "Upcoming");
                const filteredMeetings = group.meetings.filter(
                  (m) => !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase()),
                );
                if (filteredMeetings.length === 0) return null;

                return (
                  <div key={group.label} style={{ marginBottom: 24 }}>
                    {/* Section header */}
                    {isComingUp ? (
                      <div className="flex items-center justify-between" style={{ padding: "24px 0 16px 0" }}>
                        <span style={{
                          fontFamily: "Georgia, 'Times New Roman', serif",
                          fontSize: 28,
                          fontWeight: 400,
                          color: "var(--color-text-primary)",
                        }}>
                          Coming up
                        </span>
                      </div>
                    ) : (
                      <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        padding: "24px 0 12px 0",
                        color: "var(--color-text-muted)",
                      }}>
                        {group.label}
                      </div>
                    )}

                    {/* Meeting rows */}
                    {filteredMeetings.map((meeting) => (
                      <button
                        key={meeting.id}
                        className="no-drag w-full text-left"
                        onClick={() => handleSelectMeeting(meeting.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          padding: "12px 12px",
                          borderRadius: 10,
                          border: "none",
                          backgroundColor: "transparent",
                          cursor: "pointer",
                          width: "100%",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-bg-hover)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      >
                        {/* Left: avatar or date badge */}
                        {isComingUp ? (
                          <DateBadge date={meeting.date} />
                        ) : meeting.attendees.length > 0 ? (
                          <MeetingAvatar name={meeting.attendees[0]} />
                        ) : (
                          <DocumentIcon />
                        )}

                        {/* Middle: title + subtitle */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex items-center" style={{ gap: 6 }}>
                            {meeting.isLive && <span className="recording-dot shrink-0" style={{ width: 6, height: 6 }} />}
                            {meeting.isCalendar && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                            )}
                            <span style={{
                              fontSize: 15,
                              fontWeight: 500,
                              color: "var(--color-text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              display: "block",
                            }}>
                              {meeting.title}
                            </span>
                          </div>
                          <div style={{
                            fontSize: 13,
                            color: "var(--color-text-muted)",
                            marginTop: 2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {isComingUp
                              ? `${group.label === "Today" ? "Today" : ""} ${meeting.time}`
                              : (meeting.attendees.length > 0 ? meeting.attendees.join(", ") : "Me")
                            }
                          </div>
                        </div>

                        {/* Right: time */}
                        {!isComingUp && (
                          <span style={{
                            fontSize: 13,
                            color: "var(--color-text-muted)",
                            flexShrink: 0,
                            whiteSpace: "nowrap",
                          }}>
                            {meeting.time}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}

              {/* Empty state */}
              {!hasAnyMeetings && (
                <div style={{ textAlign: "center", paddingTop: 120 }}>
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 72,
                      height: 72,
                      margin: "0 auto 32px auto",
                      borderRadius: 16,
                      backgroundColor: "var(--color-accent-subtle)",
                      color: "var(--color-accent)",
                    }}
                  >
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    No meetings yet
                  </p>
                  <p style={{ fontSize: 15, marginTop: 12, marginBottom: 32, lineHeight: 1.6, color: "var(--color-text-muted)" }}>
                    Create your first meeting to start taking notes
                  </p>
                  <button
                    onClick={handleNewMeeting}
                    className="btn btn-primary no-drag"
                    style={{ fontSize: 14, gap: 10, padding: "12px 24px" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Create your first meeting
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Floating search bar at bottom */}
          <div
            style={{
              position: "fixed",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              width: "100%",
              maxWidth: 520,
              padding: "0 24px",
              zIndex: 30,
            }}
          >
            <div
              className="flex items-center"
              style={{
                gap: 12,
                padding: "12px 18px",
                borderRadius: 16,
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                boxShadow: "0 4px 20px var(--color-shadow), 0 1px 4px var(--color-shadow)",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search meetings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="no-drag bg-transparent border-none outline-none flex-1"
                style={{ color: "var(--color-text-primary)", fontSize: 14 }}
              />
              <kbd
                className="text-[10px] px-1.5 py-0.5 rounded-md"
                style={{ color: "var(--color-text-muted)", backgroundColor: "var(--color-bg-active)" }}
              >&#8984;K</kbd>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* DETAIL VIEW                                                   */}
      {/* ============================================================ */}
      {view === "detail" && activeMeeting && (
        <>
          {/* Top bar: back + right actions */}
          <div
            className="flex items-center justify-between no-drag"
            style={{
              padding: "0 24px",
              height: 48,
              flexShrink: 0,
            }}
          >
            {/* Left: back button */}
            <button
              onClick={handleBackToHome}
              className="back-btn no-drag flex items-center"
              style={{
                gap: 6,
                fontSize: 14,
                fontWeight: 500,
                color: "var(--color-text-muted)",
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "6px 10px",
                borderRadius: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Home
            </button>

            {/* Right actions */}
            <div className="flex items-center" style={{ gap: 8 }}>
              {/* Recipe selector */}
              <select
                value={selectedRecipeId}
                onChange={(e) => {
                  if (e.target.value === "__manage__") {
                    setShowRecipeEditor(true);
                    e.target.value = selectedRecipeId;
                  } else {
                    setSelectedRecipeId(e.target.value);
                  }
                }}
                className="outline-none cursor-pointer appearance-none no-drag"
                style={{
                  fontSize: 13,
                  padding: "8px 30px 8px 14px",
                  borderRadius: 8,
                  backgroundColor: "var(--color-bg-secondary)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
                <option disabled style={{ fontSize: 0, lineHeight: 0 }}>---</option>
                <option value="__manage__">Manage Recipes...</option>
              </select>

              {/* Copy button */}
              <div style={{ position: "relative" }}>
                <button className="btn btn-ghost no-drag" style={{ padding: 8 }} title="Copy to clipboard" onClick={handleCopyToClipboard}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
                {showCopied && (
                  <div
                    className="copied-tooltip"
                    style={{
                      position: "absolute",
                      top: -28,
                      left: "50%",
                      transform: "translateX(-50%)",
                      padding: "3px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      backgroundColor: "var(--color-bg-active)",
                      color: "var(--color-text-primary)",
                      boxShadow: "0 1px 4px var(--color-shadow)",
                    }}
                  >
                    Copied!
                  </div>
                )}
              </div>

              {/* Export button */}
              <button className="btn btn-ghost no-drag" style={{ padding: 8 }} title="Export" onClick={() => handleExport(activeMeeting.title)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>

              {/* Delete button */}
              <button
                className="btn btn-ghost no-drag"
                style={{ padding: 8 }}
                title="Delete meeting"
                onClick={() => setConfirmDelete(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Delete confirmation bar */}
          {confirmDelete && (
            <div
              className="flex items-center justify-center"
              style={{
                padding: "10px 24px",
                backgroundColor: "var(--color-bg-secondary)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div className="flex items-center" style={{ gap: 12, fontSize: 13, color: "var(--color-text-secondary)" }}>
                <span>Delete this meeting?</span>
                <button
                  className="btn no-drag"
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    backgroundColor: "#dc2626",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                  }}
                  onClick={handleDeleteMeeting}
                >
                  Yes, delete
                </button>
                <button
                  className="btn btn-ghost no-drag"
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto" style={{ position: "relative", paddingBottom: 80 }}>
            <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 24px 0 24px" }}>
              {/* Editable title */}
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onFocus={() => setEditingTitle(true)}
                onBlur={async () => {
                  setEditingTitle(false);
                  const trimmed = editTitle.trim();
                  if (trimmed && trimmed !== activeMeeting.title) {
                    await window.phillnola.meetings.update(activeMeeting.id, { title: trimmed });
                    await loadMeetings();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                placeholder="New note"
                className="no-drag w-full"
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 30,
                  fontWeight: 400,
                  lineHeight: 1.2,
                  color: "var(--color-text-primary)",
                  backgroundColor: "transparent",
                  border: "none",
                  outline: "none",
                  padding: 0,
                  margin: 0,
                }}
              />

              {/* Metadata pills */}
              <div className="flex items-center" style={{ gap: 12, marginTop: 16, marginBottom: 28 }}>
                {/* Date pill */}
                <div className="flex items-center" style={{
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 8,
                  backgroundColor: "var(--color-bg-secondary)",
                  fontSize: 13,
                  color: "var(--color-text-muted)",
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {formatDatePill(activeMeeting.date)}
                </div>

                {/* Attendees pill */}
                {activeMeeting.attendees.length > 0 && (
                  <div className="flex items-center" style={{
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 8,
                    backgroundColor: "var(--color-bg-secondary)",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    {activeMeeting.attendees.join(", ")}
                  </div>
                )}

                {/* Duration pill */}
                {activeMeeting.duration && (
                  <div className="flex items-center" style={{
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 8,
                    backgroundColor: "var(--color-bg-secondary)",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                  }}>
                    {activeMeeting.duration}
                  </div>
                )}

                {/* Join meeting button */}
                {activeMeeting.meetLink && (
                  <button
                    onClick={() => activeMeeting.meetLink && window.phillnola.openExternal(activeMeeting.meetLink)}
                    className="flex items-center"
                    style={{
                      gap: 6,
                      padding: "5px 12px",
                      borderRadius: 8,
                      backgroundColor: "#1a73e8",
                      fontSize: 13,
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                    Join
                  </button>
                )}
              </div>

              {/* TipTap Editor */}
              <div style={{ minHeight: 300 }}>
                <Editor
                  ref={editorRef}
                  meetingId={activeMeeting.id}
                />
              </div>

              {/* Spacer for floating bar */}
              <div style={{ height: 80 }} />
            </div>

            {/* Processing Overlay */}
            {isProcessing && (
              <ProcessingOverlay
                stage={processingStage}
                chunksCompleted={chunksCompleted}
                chunksTotal={chunksTotal}
                onCancel={handleCancelProcessing}
              />
            )}
          </div>

          {/* Recording Error */}
          {recordingError && (
            <div
              style={{ padding: "12px 24px", fontSize: 13, color: "var(--color-recording)", backgroundColor: "var(--color-recording-bg)" }}
            >
              {recordingError}
            </div>
          )}

          {/* Floating bottom bar */}
          {isRecording ? (
            /* Recording bar — wider pill */
            <div
              style={{
                position: "fixed",
                bottom: 20,
                left: "50%",
                transform: "translateX(-50%)",
                width: "100%",
                maxWidth: 480,
                padding: "0 24px",
                zIndex: 30,
              }}
            >
              <div
                className="flex items-center"
                style={{
                  padding: "10px 18px",
                  borderRadius: 16,
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "0 4px 20px var(--color-shadow), 0 1px 4px var(--color-shadow)",
                }}
              >
                <RecordingBar
                  elapsed={elapsed}
                  audioLevel={audioLevel}
                  onStop={handleStopRecording}
                />
              </div>
            </div>
          ) : (
            /* Generate notes + Start Recording — side by side in floating pill */
            <div
              style={{
                position: "fixed",
                bottom: 20,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 30,
              }}
            >
              <div
                className="flex items-center"
                style={{
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 16,
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "0 4px 20px var(--color-shadow), 0 1px 4px var(--color-shadow)",
                  whiteSpace: "nowrap",
                }}
              >
                {/* Generate notes button */}
                <button
                  onClick={handleStopAndProcess}
                  className="no-drag flex items-center"
                  style={{
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "10px 20px",
                    borderRadius: 12,
                    backgroundColor: "var(--color-accent)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-accent)"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Generate notes
                </button>

                {/* Start Recording button */}
                <button
                  onClick={handleToggleRecording}
                  className="no-drag flex items-center"
                  style={{
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    padding: "10px 20px",
                    borderRadius: 12,
                    backgroundColor: "transparent",
                    color: "var(--color-recording)",
                    border: "none",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-bg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                  Start Recording
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail view with no active meeting -- redirect handled by effect above */}
      {view === "detail" && !activeMeeting && (
        <div className="flex-1 flex items-center justify-center">
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "var(--color-text-muted)" }}>
              Meeting not found.
            </p>
            <button
              onClick={handleBackToHome}
              className="btn btn-ghost no-drag"
              style={{ marginTop: 16, fontSize: 14 }}
            >
              Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
