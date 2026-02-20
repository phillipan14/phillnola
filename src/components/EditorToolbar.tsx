import type { Editor } from "@tiptap/react";

/* ── Types ────────────────────────────────────────────────────────────── */

interface EditorToolbarProps {
  editor: Editor | null;
}

/* ── Toolbar Button ───────────────────────────────────────────────────── */

function ToolbarButton({
  onClick,
  isActive,
  title,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="no-drag"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        backgroundColor: isActive ? "var(--color-bg-active)" : "transparent",
        color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
        transition: "all 0.12s ease",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--color-text-muted)";
        }
      }}
    >
      {children}
    </button>
  );
}

/* ── Divider ──────────────────────────────────────────────────────────── */

function ToolbarDivider() {
  return (
    <div
      style={{
        width: 1,
        height: 16,
        backgroundColor: "var(--color-border)",
        margin: "0 2px",
      }}
    />
  );
}

/* ── Main Component ───────────────────────────────────────────────────── */

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  return (
    <div
      className="editor-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "5px 8px",
        borderRadius: 10,
        backgroundColor: "var(--color-bg-secondary)",
        border: "1px solid var(--color-border)",
        boxShadow: "0 1px 3px var(--color-shadow)",
      }}
    >
      {/* Bold */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold (Cmd+B)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
        </svg>
      </ToolbarButton>

      {/* Italic */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic (Cmd+I)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="4" x2="10" y2="4" />
          <line x1="14" y1="20" x2="5" y2="20" />
          <line x1="15" y1="4" x2="9" y2="20" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* H1 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>H1</span>
      </ToolbarButton>

      {/* H2 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>H2</span>
      </ToolbarButton>

      {/* H3 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}>H3</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Bullet List */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet List"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      </ToolbarButton>

      {/* Ordered List */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Numbered List"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6" x2="21" y2="6" />
          <line x1="10" y1="12" x2="21" y2="12" />
          <line x1="10" y1="18" x2="21" y2="18" />
          <text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontWeight="600">1</text>
          <text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontWeight="600">2</text>
          <text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontWeight="600">3</text>
        </svg>
      </ToolbarButton>

      {/* Task List */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive("taskList")}
        title="Task List"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="6" height="6" rx="1" />
          <path d="M5 8l1 1 2-2" />
          <line x1="13" y1="8" x2="21" y2="8" />
          <rect x="3" y="14" width="6" height="6" rx="1" />
          <line x1="13" y1="17" x2="21" y2="17" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Code */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        title="Inline Code"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </ToolbarButton>

      {/* Code Block */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive("codeBlock")}
        title="Code Block"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <polyline points="8 10 5 12 8 14" />
          <polyline points="16 10 19 12 16 14" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
