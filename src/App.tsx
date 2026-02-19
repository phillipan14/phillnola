import { useState, useRef } from "react";
import { useSettings } from "./hooks/useSettings";
import Onboarding from "./screens/Onboarding";
import Settings from "./screens/Settings";
import Editor from "./components/Editor";
import type { EditorHandle } from "./components/Editor";

/* ── Mock Data ─────────────────────────────────────────────────────── */

interface Meeting {
  id: string;
  title: string;
  time: string;
  duration?: string;
  attendees: string[];
  isLive?: boolean;
}

const MOCK_MEETINGS: { label: string; meetings: Meeting[] }[] = [
  {
    label: "Today",
    meetings: [
      {
        id: "1",
        title: "Weekly Product Sync",
        time: "2:00 PM",
        duration: "30 min",
        attendees: ["Jack", "Mudit", "Roshan"],
        isLive: true,
      },
      {
        id: "2",
        title: "Design Review — Onboarding",
        time: "4:00 PM",
        duration: "45 min",
        attendees: ["Jack", "Mudit"],
      },
    ],
  },
  {
    label: "Yesterday",
    meetings: [
      {
        id: "3",
        title: "Investor Update Prep",
        time: "10:00 AM",
        duration: "25 min",
        attendees: ["Jack"],
      },
      {
        id: "4",
        title: "1:1 with Mudit",
        time: "3:00 PM",
        duration: "18 min",
        attendees: ["Mudit"],
      },
    ],
  },
  {
    label: "This Week",
    meetings: [
      {
        id: "5",
        title: "Sales Pipeline Review",
        time: "Mon 11 AM",
        duration: "40 min",
        attendees: ["Jack", "Roshan"],
      },
    ],
  },
];

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

/* ── App ───────────────────────────────────────────────────────────── */

export default function App() {
  const { settings, loading, saveSetting, isOnboarded } = useSettings();
  const [selectedMeeting, setSelectedMeeting] = useState<string>("1");
  const [isRecording, setIsRecording] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const editorRef = useRef<EditorHandle>(null);

  const activeMeeting = MOCK_MEETINGS.flatMap((g) => g.meetings).find(
    (m) => m.id === selectedMeeting
  );

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
          width: 264,
          minWidth: 264,
          backgroundColor: "var(--color-bg-sidebar)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        {/* macOS traffic light area + branding */}
        <div className="drag-region flex items-end px-5 pb-3" style={{ paddingTop: 14, paddingLeft: 78 }}>
          <span className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            Phillnola
          </span>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <div
            className="search-box flex items-center gap-2 px-3 py-[7px] rounded-lg"
            style={{ backgroundColor: "var(--color-bg-hover)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="var(--color-text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="no-drag bg-transparent border-none outline-none text-[12px] flex-1"
              style={{ color: "var(--color-text-primary)" }}
            />
            <kbd className="text-[10px] px-1 py-0.5 rounded"
              style={{ color: "var(--color-text-muted)", backgroundColor: "var(--color-bg-active)" }}
            >&#8984;K</kbd>
          </div>
        </div>

        {/* Meeting list */}
        <div className="flex-1 overflow-y-auto px-2">
          {MOCK_MEETINGS.map((group) => (
            <div key={group.label} className="mb-1">
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.08em] px-3 pt-3 pb-1.5"
                style={{ color: "var(--color-text-muted)" }}
              >
                {group.label}
              </div>
              {group.meetings.map((meeting) => (
                <button
                  key={meeting.id}
                  className={`meeting-item no-drag w-full text-left ${selectedMeeting === meeting.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedMeeting(meeting.id);
                    setShowSettings(false);
                  }}
                >
                  <div className="font-mono-timestamp shrink-0" style={{ color: "var(--color-text-muted)", width: 52 }}>
                    {meeting.time.replace(" AM", "a").replace(" PM", "p")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {meeting.isLive && <span className="recording-dot shrink-0" style={{ width: 6, height: 6 }} />}
                      <span className="text-[13px] font-medium truncate block" style={{ color: "var(--color-text-primary)" }}>
                        {meeting.title}
                      </span>
                    </div>
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>
                      {meeting.attendees.join(", ")}{meeting.duration ? ` \u00b7 ${meeting.duration}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button className="btn btn-ghost no-drag text-[12px] gap-1.5 px-2 py-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New
          </button>
          <button
            className="btn btn-ghost no-drag p-1.5"
            title="Settings"
            onClick={() => setShowSettings(!showSettings)}
            style={{
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
              <div className="px-10 lg:px-16 pb-5" style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--color-text-primary)" }}>
                      {activeMeeting.title}
                    </h1>
                    <div className="flex items-center gap-4 mt-2.5">
                      <span className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                        {activeMeeting.time}{activeMeeting.duration ? ` \u00b7 ${activeMeeting.duration}` : ""}
                      </span>
                      <div className="flex items-center gap-2.5">
                        <AvatarStack names={activeMeeting.attendees} />
                        <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                          {activeMeeting.attendees.join(", ")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 no-drag shrink-0 pt-1">
                    <select
                      className="text-[12px] rounded-lg px-2.5 py-1.5 outline-none cursor-pointer appearance-none pr-7"
                      style={{
                        backgroundColor: "var(--color-bg-secondary)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <option>General Meeting</option>
                      <option>1:1</option>
                      <option>Sales Call</option>
                      <option>Interview</option>
                      <option>Standup</option>
                    </select>
                    <button className="btn btn-ghost p-1.5" title="Copy to clipboard">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button className="btn btn-ghost p-1.5" title="Export">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
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
              <div className="flex-1 overflow-y-auto">
                <div className="px-10 lg:px-16 py-6 max-w-[720px]">
                  <Editor
                    ref={editorRef}
                    meetingId={activeMeeting.id}
                  />
                </div>
              </div>

              {/* Recording Bar */}
              {isRecording && (
                <div
                  className="recording-bar flex items-center justify-between px-5 py-2.5"
                  style={{
                    borderTop: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-bg-secondary)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="recording-dot" />
                    <span className="text-[13px] font-medium" style={{ color: "var(--color-recording)" }}>
                      Recording
                    </span>
                    <span className="font-mono-timestamp" style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                      12:34
                    </span>
                  </div>

                  <div className="flex items-center gap-5">
                    <DancingBars />
                    <button
                      onClick={() => setIsRecording(false)}
                      className="stop-btn flex items-center gap-1.5 text-[12px] font-medium px-3.5 py-1.5 rounded-full"
                      style={{ backgroundColor: "var(--color-recording)", color: "#fff" }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="4" y="4" width="16" height="16" rx="3" />
                      </svg>
                      Stop
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="mb-4 mx-auto" style={{ color: "var(--color-text-placeholder)", width: 44, height: 44 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <p className="text-[15px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  Select or start a meeting
                </p>
                <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Choose from the sidebar or begin a new recording
                </p>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
