import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useSettings } from "./hooks/useSettings";
import { useRecording } from "./hooks/useRecording";
import Onboarding from "./screens/Onboarding";
import Settings from "./screens/Settings";
import Editor from "./components/Editor";
import type { EditorHandle } from "./components/Editor";
import RecordingBar from "./components/RecordingBar";
import ProcessingOverlay from "./components/ProcessingOverlay";
import type { ProcessingStage } from "./components/ProcessingOverlay";

/* ── Types ─────────────────────────────────────────────────────────── */

interface Meeting {
  id: string;
  title: string;
  time: string;
  duration?: string;
  attendees: string[];
  isLive?: boolean;
  isCalendar?: boolean;
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

/* ── Helpers ───────────────────────────────────────────────────────── */

function formatTimeShort(isoDate: string): string {
  const d = new Date(isoDate);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function groupMeetings(
  dbMeetings: { id: string; title: string; date: string; attendees: string; duration_seconds: number }[],
  calendarEvents: { id: string; title: string; start: string; end: string; attendees: string[] }[],
): MeetingGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, Meeting[]> = { Today: [], Yesterday: [], "This Week": [], Upcoming: [], Older: [] };

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
      time: formatTimeShort(m.date),
      duration: durationStr,
      attendees,
    });
  }

  // Add calendar events (upcoming only, not already in DB)
  const dbCalIds = new Set(dbMeetings.map((m) => m.id));
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
      time: formatTimeShort(e.start),
      duration: durationStr,
      attendees: e.attendees,
      isCalendar: true,
    });
  }

  // Build ordered result, excluding empty groups
  const orderedLabels = ["Today", "Yesterday", "This Week", "Upcoming", "Older"];
  return orderedLabels
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, meetings: groups[label] }));
}

/* ── Subcomponents ─────────────────────────────────────────────────── */

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

/* ── Markdown to HTML (lightweight) ────────────────────────────────── */

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

/* ── HTML to Markdown (lightweight) ─────────────────────────────────── */

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

/* ── Theme helpers ─────────────────────────────────────────────────── */

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

/* ── App ───────────────────────────────────────────────────────────── */

export default function App() {
  const { settings, loading, saveSetting, isOnboarded } = useSettings();
  const { startRecording, stopRecording, isRecording, elapsed, audioLevel, error: recordingError } = useRecording();
  const [selectedMeeting, setSelectedMeeting] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
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

  // Load meetings from DB + Google Calendar
  const loadMeetings = useCallback(async () => {
    const dbMeetings = (await window.phillnola.meetings.list()) as {
      id: string; title: string; date: string; attendees: string; duration_seconds: number;
    }[];

    let calendarEvents: { id: string; title: string; start: string; end: string; attendees: string[] }[] = [];
    try {
      const connected = await window.phillnola.calendar.isConnected();
      if (connected) {
        calendarEvents = await window.phillnola.calendar.getEvents(7);
      }
    } catch {
      // Calendar not configured — that's fine
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

  // Initial data load
  useEffect(() => {
    if (isOnboarded) {
      loadMeetings();
      loadRecipes();
    }
  }, [isOnboarded, loadMeetings, loadRecipes]);

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
      setShowSettings(false);
    });
    const unsubNew = window.phillnola.on("new-meeting", () => {
      handleNewMeeting();
    });
    return () => { unsubNavigate(); unsubNew(); };
  }, []);

  // ── Search notes content when query changes ───────────────────
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

  // ── Initialize and sync theme ─────────────────────────────────
  useEffect(() => {
    const saved = settings.theme as ThemeMode | undefined;
    const mode = saved || "system";
    setThemeMode(mode);
    applyTheme(mode);
  }, [settings.theme]);

  // ── Sync edit title when meeting selection changes ───────────
  useEffect(() => {
    if (activeMeeting) setEditTitle(activeMeeting.title);
    setConfirmDelete(false);
  }, [selectedMeeting, activeMeeting?.title]);

  // ── Copy to clipboard ─────────────────────────────────────────
  const handleCopyToClipboard = useCallback(async () => {
    if (!editorRef.current) return;
    const html = editorRef.current.getHTML();
    const md = htmlToMarkdown(html);
    await navigator.clipboard.writeText(md);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1500);
  }, []);

  // ── Export as markdown file ───────────────────────────────────
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

  // ── Theme toggle ──────────────────────────────────────────────
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
    setShowSettings(false);
  }, [loadMeetings]);

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

      // 3. Insert transcript into editor so user can see it immediately
      if (editorRef.current) {
        const transcriptParagraphs = transcript
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => `<p>${line}</p>`)
          .join("");
        const transcriptHtml = `
          <hr />
          <h2>Transcript</h2>
          ${transcriptParagraphs}
        `;
        editorRef.current.insertAIOutput(transcriptHtml);
      }

      // 4. Structure notes with AI
      setProcessingStage("structuring");
      const userNotes = editorRef.current?.getPlainText() || "";

      const structured = await window.phillnola.ai.structureNotes({
        meetingId: selectedMeeting,
        transcript,
        userNotes,
        recipeId: selectedRecipeId || undefined,
      });

      if (processingCancelledRef.current) return;

      // 5. Insert structured output into editor below the transcript
      if (structured && editorRef.current) {
        const aiHtml = `
          <hr />
          <h2>AI-Structured Notes</h2>
          ${markdownToHtml(structured)}
        `;
        editorRef.current.insertAIOutput(aiHtml);
      }

      // 5. Show done state briefly
      setProcessingStage("done");
      setTimeout(() => {
        setIsProcessing(false);
      }, 1500);
    } catch (err) {
      console.error("Processing failed:", err);
      setIsProcessing(false);
      // Could add error toast here
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

  // ── Keyboard shortcuts ────────────────────────────────────────
  // Keep refs to avoid stale closures in the global listener
  const newMeetingRef = useRef(handleNewMeeting);
  newMeetingRef.current = handleNewMeeting;
  const toggleRecRef = useRef(handleToggleRecording);
  toggleRecRef.current = handleToggleRecording;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+K — focus search
      if (meta && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Cmd+N — new meeting
      if (meta && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        newMeetingRef.current();
      }

      // Cmd+Shift+R — toggle recording
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

  /* ── Loading State ──────────────────────────────────────────────── */

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

  /* ── Onboarding ─────────────────────────────────────────────────── */

  if (!isOnboarded) {
    return (
      <Onboarding
        onComplete={() => {
          // Force a re-render by reloading settings
          window.location.reload();
        }}
        saveSetting={saveSetting}
      />
    );
  }

  /* ── Main App ───────────────────────────────────────────────────── */

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--color-bg-primary)" }}>
      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside
        className="sidebar flex flex-col select-none"
        style={{
          width: 272,
          minWidth: 272,
          backgroundColor: "var(--color-bg-sidebar)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        {/* macOS traffic light area + branding */}
        <div className="drag-region flex items-end" style={{ paddingTop: 18, paddingLeft: 78, paddingRight: 20, paddingBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--color-text-primary)" }}>
            Phillnola
          </span>
        </div>

        {/* Search */}
        <div style={{ padding: "0 14px 16px 14px" }}>
          <div
            className="search-box flex items-center"
            style={{ gap: 12, padding: "10px 16px", borderRadius: 12, backgroundColor: "var(--color-bg-hover)" }}
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
            <kbd className="text-[10px] px-1.5 py-0.5 rounded-md"
              style={{ color: "var(--color-text-muted)", backgroundColor: "var(--color-bg-active)" }}
            >&#8984;K</kbd>
          </div>
        </div>

        {/* Meeting list */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "0 12px" }}>
          {/* Search Results from note content */}
          {filteredSearchResults.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", padding: "16px 12px 8px 12px", color: "var(--color-accent)" }}
              >
                Search Results
              </div>
              {filteredSearchResults.map((result) => (
                <button
                  key={`search-${result.meeting_id}`}
                  className={`meeting-item meeting-slide-in no-drag w-full text-left ${selectedMeeting === result.meeting_id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedMeeting(result.meeting_id);
                    setShowSettings(false);
                  }}
                >
                  <div className="font-mono-timestamp shrink-0" style={{ color: "var(--color-text-muted)", width: 52 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium truncate block" style={{ color: "var(--color-text-primary)" }}>
                      {result.meeting_title}
                    </span>
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>
                      Matched in notes
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {meetingGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: 8 }}>
              <div
                style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", padding: "16px 12px 8px 12px", color: "var(--color-text-muted)" }}
              >
                {group.label}
              </div>
              {group.meetings
                .filter((m) => !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((meeting) => (
                <button
                  key={meeting.id}
                  className={`meeting-item meeting-slide-in no-drag w-full text-left ${selectedMeeting === meeting.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedMeeting(meeting.id);
                    setShowSettings(false);
                  }}
                >
                  <div className="font-mono-timestamp shrink-0" style={{ color: "var(--color-text-muted)", width: 54 }}>
                    {meeting.time.replace(" AM", "a").replace(" PM", "p")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
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
                      <span className="text-[13.5px] font-medium truncate block leading-snug" style={{ color: "var(--color-text-primary)" }}>
                        {meeting.title}
                      </span>
                    </div>
                    <div className="text-[12px] mt-1 truncate" style={{ color: "var(--color-text-muted)" }}>
                      {meeting.attendees.join(", ")}{meeting.duration ? ` \u00b7 ${meeting.duration}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between" style={{ padding: "14px 14px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={handleNewMeeting} className="btn btn-ghost no-drag" style={{ fontSize: 14, gap: 8, padding: "10px 14px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New
          </button>
          <div className="flex items-center" style={{ gap: 8 }}>
            {/* Theme toggle */}
            <button
              className="btn btn-ghost no-drag"
              style={{ padding: 10 }}
              title={`Theme: ${themeMode}`}
              onClick={handleThemeToggle}
            >
              {themeIcon(themeMode) === "sun" && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
              {themeIcon(themeMode) === "moon" && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              {themeIcon(themeMode) === "monitor" && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              )}
            </button>
            {/* Settings */}
            <button
              className="btn btn-ghost no-drag"
              title="Settings"
              onClick={() => setShowSettings(!showSettings)}
              style={{
                padding: 10,
                backgroundColor: showSettings ? "var(--color-bg-active)" : undefined,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────── */}
      {showSettings ? (
        <Settings
          settings={settings}
          saveSetting={saveSetting}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Titlebar drag */}
          <div className="drag-region" style={{ height: 38 }} />

          {activeMeeting ? (
            <>
              {/* Meeting Header */}
              <div style={{ padding: "0 48px 28px 48px", borderBottom: "1px solid var(--color-border-light)" }}>
                <div className="flex items-start justify-between" style={{ gap: 24 }}>
                  <div className="min-w-0">
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
                      className="no-drag w-full"
                      style={{
                        fontSize: 26,
                        fontWeight: 600,
                        lineHeight: 1.2,
                        color: "var(--color-text-primary)",
                        backgroundColor: "transparent",
                        border: "none",
                        outline: "none",
                        padding: 0,
                        margin: 0,
                        fontFamily: "inherit",
                      }}
                    />
                    <div className="flex items-center" style={{ gap: 16, marginTop: 14 }}>
                      <span style={{ fontSize: 13.5, color: "var(--color-text-muted)" }}>
                        {activeMeeting.time}{activeMeeting.duration ? ` \u00b7 ${activeMeeting.duration}` : ""}
                      </span>
                      <div className="flex items-center" style={{ gap: 12 }}>
                        <AvatarStack names={activeMeeting.attendees} />
                        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                          {activeMeeting.attendees.join(", ")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center no-drag shrink-0" style={{ gap: 12 }}>
                    <select
                      value={selectedRecipeId}
                      onChange={(e) => setSelectedRecipeId(e.target.value)}
                      className="outline-none cursor-pointer appearance-none"
                      style={{
                        fontSize: 13,
                        padding: "10px 36px 10px 16px",
                        borderRadius: 12,
                        backgroundColor: "var(--color-bg-secondary)",
                        border: "1.5px solid var(--color-border)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <div style={{ position: "relative" }}>
                      <button className="btn btn-ghost" style={{ padding: 10 }} title="Copy to clipboard" onClick={handleCopyToClipboard}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                    <button className="btn btn-ghost" style={{ padding: 10 }} title="Export" onClick={() => handleExport(activeMeeting.title)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Notes Area — TipTap Editor */}
              <div className="flex-1 overflow-y-auto" style={{ position: "relative" }}>
                <div style={{ padding: "32px 48px", maxWidth: 720 }}>
                  <Editor
                    ref={editorRef}
                    meetingId={activeMeeting.id}
                  />
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

              {/* Recording Bar */}
              {isRecording && (
                <RecordingBar
                  elapsed={elapsed}
                  audioLevel={audioLevel}
                  onStop={handleStopRecording}
                />
              )}

              {/* Recording Error */}
              {recordingError && (
                <div
                  style={{ padding: "12px 24px", fontSize: 13, color: "var(--color-recording)", backgroundColor: "var(--color-recording-bg)" }}
                >
                  {recordingError}
                </div>
              )}

              {/* Start Recording button when not recording */}
              {!isRecording && activeMeeting && (
                <div
                  className="flex items-center justify-center"
                  style={{
                    padding: "16px 24px",
                    borderTop: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-bg-secondary)",
                  }}
                >
                  <button
                    onClick={handleToggleRecording}
                    className="no-drag flex items-center transition-all"
                    style={{
                      gap: 12,
                      fontSize: 14,
                      fontWeight: 600,
                      padding: "14px 28px",
                      borderRadius: 12,
                      backgroundColor: "var(--color-recording-bg)",
                      color: "var(--color-recording)",
                      border: "1.5px solid transparent",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = "var(--color-recording)"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = "transparent"; }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    </svg>
                    Start Recording
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex items-center justify-center">
              <div style={{ textAlign: "center", maxWidth: 340 }}>
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
                {hasAnyMeetings ? (
                  <>
                    <p style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      Select a meeting
                    </p>
                    <p style={{ fontSize: 15, marginTop: 12, lineHeight: 1.6, color: "var(--color-text-muted)" }}>
                      Choose from the sidebar or create a new one to start taking notes
                    </p>
                  </>
                ) : (
                  <>
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
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Create your first meeting
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
