import { useRef, useCallback, useEffect } from "react";
import { useEditor as useTiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

/* ── Types ────────────────────────────────────────────────────────────── */

export interface EditorHandle {
  insertAIOutput: (html: string) => void;
  getPlainText: () => string;
  getJSON: () => unknown;
  getHTML: () => string;
  focus: () => void;
}

interface UseEditorOptions {
  meetingId: string | null;
  onSaveStatus?: (status: "saving" | "saved" | "idle") => void;
}

/* ── Hook ─────────────────────────────────────────────────────────────── */

export function useEditorInstance({ meetingId, onSaveStatus }: UseEditorOptions) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMeetingIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  const editor = useTiptapEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: "Start typing your notes...",
        emptyEditorClass: "is-editor-empty",
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    editorProps: {
      attributes: {
        class: "phillnola-editor",
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Don't save while loading content for a new meeting
      if (isLoadingRef.current) return;
      if (!currentMeetingIdRef.current) return;

      // Debounced save (500ms)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      onSaveStatus?.("saving");

      const mid = currentMeetingIdRef.current;
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const html = ed.getHTML();
          const text = ed.getText();
          await window.phillnola.notes.save(mid, {
            content: html,
            raw_user_notes: text,
          });
          onSaveStatus?.("saved");
          // Reset to idle after a brief moment
          setTimeout(() => onSaveStatus?.("idle"), 1500);
        } catch (err) {
          console.error("Failed to save notes:", err);
          onSaveStatus?.("idle");
        }
      }, 500);
    },
  });

  /* ── Load notes when meeting changes ────────────────────────────────── */

  useEffect(() => {
    if (!editor) return;
    if (!meetingId) {
      currentMeetingIdRef.current = null;
      editor.commands.clearContent();
      return;
    }

    // Cancel any pending save for the old meeting
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    currentMeetingIdRef.current = meetingId;
    isLoadingRef.current = true;

    window.phillnola.notes
      .get(meetingId)
      .then((note: unknown) => {
        // Only apply if still the same meeting
        if (currentMeetingIdRef.current !== meetingId) return;

        const noteData = note as { content?: string } | null;
        if (noteData?.content) {
          editor.commands.setContent(noteData.content);
        } else {
          editor.commands.clearContent();
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load notes:", err);
        editor.commands.clearContent();
      })
      .finally(() => {
        isLoadingRef.current = false;
      });
  }, [meetingId, editor]);

  /* ── Cleanup pending save on unmount ────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  /* ── Public handle methods ──────────────────────────────────────────── */

  const insertAIOutput = useCallback(
    (html: string) => {
      if (!editor) return;
      // Move cursor to end and insert AI output
      editor.commands.focus("end");
      editor.commands.insertContent(html);
    },
    [editor],
  );

  const getPlainText = useCallback((): string => {
    if (!editor) return "";
    return editor.getText();
  }, [editor]);

  const getJSON = useCallback((): unknown => {
    if (!editor) return null;
    return editor.getJSON();
  }, [editor]);

  const getHTML = useCallback((): string => {
    if (!editor) return "";
    return editor.getHTML();
  }, [editor]);

  const focus = useCallback(() => {
    editor?.commands.focus();
  }, [editor]);

  const handle: EditorHandle = {
    insertAIOutput,
    getPlainText,
    getJSON,
    getHTML,
    focus,
  };

  return { editor, handle };
}
