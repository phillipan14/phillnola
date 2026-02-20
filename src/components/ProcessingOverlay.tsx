/**
 * ProcessingOverlay — Semi-transparent overlay on the editor
 *
 * Shows animated progress while transcription and AI structuring
 * are in progress. Displays a progress bar, stage label, and
 * a cancel button.
 */

import { useEffect, useState } from "react";

/* ── Types ────────────────────────────────────────────────────────────── */

export type ProcessingStage = "transcribing" | "structuring" | "done";

interface ProcessingOverlayProps {
  /** Current processing stage */
  stage: ProcessingStage;
  /** Number of chunks completed (for transcription progress) */
  chunksCompleted: number;
  /** Total number of chunks */
  chunksTotal: number;
  /** Cancel the current operation */
  onCancel: () => void;
}

/* ── Stage Labels ────────────────────────────────────────────────────── */

const STAGE_LABELS: Record<ProcessingStage, string> = {
  transcribing: "Transcribing audio...",
  structuring: "Structuring notes...",
  done: "Done!",
};

/* ── Component ───────────────────────────────────────────────────────── */

export default function ProcessingOverlay({
  stage,
  chunksCompleted,
  chunksTotal,
  onCancel,
}: ProcessingOverlayProps) {
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Calculate progress percentage
  const progress =
    stage === "done"
      ? 100
      : stage === "structuring"
        ? 80 + Math.random() * 15 // Show ~80-95% during structuring
        : chunksTotal > 0
          ? Math.round((chunksCompleted / chunksTotal) * 75) // Transcription is 0-75%
          : 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "var(--color-bg-primary)",
        opacity: visible ? 0.95 : 0,
        transition: "opacity 0.3s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        gap: 24,
      }}
    >
      {/* Animated icon */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "3px solid var(--color-border)",
          borderTopColor: stage === "done" ? "var(--color-success)" : "var(--color-accent)",
          animation: stage === "done" ? "none" : "spin 0.8s linear infinite",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {stage === "done" && (
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-success)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>

      {/* Stage label */}
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          textAlign: "center",
        }}
      >
        {STAGE_LABELS[stage]}
      </div>

      {/* Progress details */}
      {stage === "transcribing" && chunksTotal > 0 && (
        <div
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
          }}
        >
          {chunksCompleted} / {chunksTotal} chunks
        </div>
      )}

      {/* Progress bar */}
      <div
        style={{
          width: 280,
          height: 5,
          borderRadius: 3,
          backgroundColor: "var(--color-bg-hover)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            borderRadius: 3,
            backgroundColor:
              stage === "done" ? "var(--color-success)" : "var(--color-accent)",
            transition: "width 0.4s ease, background-color 0.3s ease",
          }}
        />
      </div>

      {/* Cancel button (hidden when done) */}
      {stage !== "done" && (
        <button
          onClick={onCancel}
          className="btn btn-ghost no-drag"
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            marginTop: 12,
          }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
