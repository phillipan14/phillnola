import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { EditorContent } from "@tiptap/react";
import { useEditorInstance } from "../hooks/useEditor";
import type { EditorHandle } from "../hooks/useEditor";
import EditorToolbar from "./EditorToolbar";

/* ── Types ────────────────────────────────────────────────────────────── */

interface EditorProps {
  meetingId: string | null;
}

type SaveStatus = "idle" | "saving" | "saved";

/* ── Component ────────────────────────────────────────────────────────── */

const Editor = forwardRef<EditorHandle, EditorProps>(
  function Editor({ meetingId }, ref) {
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [toolbarVisible, setToolbarVisible] = useState(false);

    const { editor, handle } = useEditorInstance({
      meetingId,
      onSaveStatus: setSaveStatus,
    });

    // Expose handle methods to parent via ref
    useImperativeHandle(ref, () => handle, [handle]);

    // Show toolbar when editor is focused, hide when blurred
    useEffect(() => {
      if (!editor) return;

      const onFocus = () => setToolbarVisible(true);
      const onBlur = () => {
        // Delay to allow toolbar button clicks to register
        setTimeout(() => {
          if (!editor.isFocused) {
            setToolbarVisible(false);
          }
        }, 200);
      };

      editor.on("focus", onFocus);
      editor.on("blur", onBlur);

      return () => {
        editor.off("focus", onFocus);
        editor.off("blur", onBlur);
      };
    }, [editor]);

    return (
      <div className="phillnola-editor-wrapper">
        {/* Subtle floating toolbar */}
        <div
          style={{
            opacity: toolbarVisible ? 1 : 0,
            transform: toolbarVisible ? "translateY(0)" : "translateY(-4px)",
            transition: "opacity 0.15s ease, transform 0.15s ease",
            pointerEvents: toolbarVisible ? "auto" : "none",
            marginBottom: 12,
          }}
        >
          <EditorToolbar editor={editor} />
        </div>

        {/* TipTap Editor Content */}
        <EditorContent
          editor={editor}
          style={{
            minHeight: 200,
            outline: "none",
          }}
        />

        {/* Save status indicator */}
        <div
          style={{
            position: "fixed",
            bottom: 60,
            right: 20,
            fontSize: 11,
            color: "var(--color-text-muted)",
            opacity: saveStatus === "idle" ? 0 : 0.7,
            transition: "opacity 0.3s ease",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {saveStatus === "saving" && (
            <>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "var(--color-accent)",
                  animation: "recording-pulse 1s ease-in-out infinite",
                }}
              />
              Saving...
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved
            </>
          )}
        </div>
      </div>
    );
  },
);

export default Editor;
export type { EditorHandle };
