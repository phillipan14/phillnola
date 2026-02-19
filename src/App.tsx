export default function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col border-r"
        style={{
          width: 240,
          minWidth: 240,
          backgroundColor: "var(--color-bg-sidebar)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Drag region for macOS traffic lights */}
        <div className="drag-region h-12 flex items-center px-4 pt-1">
          <span
            className="text-sm font-semibold tracking-tight pl-16"
            style={{ color: "var(--color-text-primary)" }}
          >
            Phillnola
          </span>
        </div>

        {/* Upcoming Meetings */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="mb-4">
            <h2
              className="text-xs font-medium uppercase tracking-wider px-1 mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Upcoming
            </h2>
            <div
              className="text-sm px-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              No upcoming meetings
            </div>
          </div>

          {/* Past Notes */}
          <div>
            <h2
              className="text-xs font-medium uppercase tracking-wider px-1 mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Past Notes
            </h2>
            <div
              className="text-sm px-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              No past notes
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        {/* Drag region for macOS titlebar */}
        <div className="drag-region h-12" />

        {/* Content area */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div
              className="text-4xl mb-3"
              style={{ color: "var(--color-accent)" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="mx-auto"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <h1
              className="text-lg font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Select or start a meeting
            </h1>
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Choose from the sidebar or begin a new recording
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
