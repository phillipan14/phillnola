/**
 * RecordingBar — Fixed bar at bottom of editor area
 *
 * Displays:
 *   - Pulsing red recording dot
 *   - Elapsed time (MM:SS format)
 *   - Audio waveform visualizer (real-time bars driven by audioLevel)
 *   - Stop button
 */

import { useRef, useEffect, useCallback } from "react";

interface RecordingBarProps {
  /** Elapsed seconds */
  elapsed: number;
  /** Audio level 0-1 from AnalyserNode */
  audioLevel: number;
  /** Called when user clicks stop */
  onStop: () => void;
}

/** Number of bars in the waveform visualizer */
const BAR_COUNT = 24;

/**
 * Format seconds as MM:SS
 */
function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function RecordingBar({ elapsed, audioLevel, onStop }: RecordingBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const animFrameRef = useRef<number | null>(null);

  // ── Waveform Drawing ──────────────────────────────────────────

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Set canvas size accounting for DPR
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, width, height);

    const bars = barsRef.current;
    const barWidth = 2;
    const gap = 2;
    const totalBarWidth = barWidth + gap;
    const startX = (width - BAR_COUNT * totalBarWidth + gap) / 2;

    // Shift bars left (scrolling effect) and add new level on the right
    for (let i = 0; i < BAR_COUNT - 1; i++) {
      bars[i] = bars[i + 1];
    }
    // Add some natural variation to the audio level
    const variation = 0.15 + Math.random() * 0.2;
    bars[BAR_COUNT - 1] = Math.max(0.08, audioLevel + (Math.random() - 0.5) * variation);

    const maxBarHeight = height - 4;

    // Compute style colors — read CSS variables
    const style = getComputedStyle(canvas);
    const successColor = style.getPropertyValue("--color-success").trim() || "#30a46c";

    for (let i = 0; i < BAR_COUNT; i++) {
      const barHeight = Math.max(2, bars[i] * maxBarHeight);
      const x = startX + i * totalBarWidth;
      const y = (height - barHeight) / 2;

      // Fade bars near the edges
      const edgeFade = Math.min(i / 4, (BAR_COUNT - 1 - i) / 4, 1);
      ctx.globalAlpha = 0.4 + edgeFade * 0.6;

      ctx.fillStyle = successColor;
      ctx.beginPath();
      // Rounded rectangles
      const radius = barWidth / 2;
      ctx.roundRect(x, y, barWidth, barHeight, radius);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, [audioLevel]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(drawWaveform);
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [drawWaveform]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      className="recording-bar flex items-center justify-between"
      style={{
        padding: "14px 24px",
        borderTop: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg-secondary)",
      }}
    >
      {/* Left side: recording indicator + elapsed time */}
      <div className="flex items-center" style={{ gap: 14 }}>
        <span className="recording-dot" />
        <span
          style={{ fontSize: 14, fontWeight: 500, color: "var(--color-recording)" }}
        >
          Recording
        </span>
        <span
          className="font-mono-timestamp"
          style={{ color: "var(--color-text-muted)", fontSize: 13 }}
        >
          {formatTime(elapsed)}
        </span>
      </div>

      {/* Right side: waveform + stop button */}
      <div className="flex items-center" style={{ gap: 20 }}>
        {/* Waveform visualizer canvas */}
        <canvas
          ref={canvasRef}
          style={{
            width: 140,
            height: 28,
            // Inherit CSS variables for the drawing function
            // @ts-expect-error: custom CSS properties
            "--color-success": "var(--color-success)",
          }}
        />

        {/* Stop button */}
        <button
          onClick={onStop}
          className="stop-btn flex items-center no-drag"
          style={{ gap: 8, fontSize: 13, fontWeight: 600, padding: "8px 20px", borderRadius: 999, backgroundColor: "var(--color-recording)", color: "#fff" }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="3" />
          </svg>
          Stop
        </button>
      </div>
    </div>
  );
}
