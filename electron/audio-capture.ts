/**
 * Audio Capture Module — Electron Main Process
 *
 * Handles writing audio chunk blobs received from the renderer process
 * to disk at ~/.phillnola/recordings/{meetingId}/chunk-{n}.webm.
 *
 * The actual MediaRecorder / AnalyserNode / AudioContext work happens
 * in the renderer (useRecording hook), because those are Web APIs.
 * The main process is responsible for:
 *   1. Providing desktop-capturer source IDs to the renderer
 *   2. Writing audio blob data to the filesystem
 *   3. Cleaning up / returning chunk paths
 */

import { desktopCapturer } from "electron";
import path from "path";
import fs from "fs";
import { app } from "electron";

// ── State ────────────────────────────────────────────────────────────────────

let currentMeetingId: string | null = null;
let chunkIndex = 0;
let chunkPaths: string[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRecordingsDir(meetingId: string): string {
  const dir = path.join(app.getPath("home"), ".phillnola", "recordings", meetingId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ── Public API (called from IPC handlers in main.ts) ─────────────────────────

/**
 * Get available screen sources that can provide system audio.
 * The renderer uses these source IDs to call getUserMedia with
 * chromeMediaSource: 'desktop'.
 */
export async function getDesktopSources(): Promise<
  { id: string; name: string; thumbnailDataUrl: string }[]
> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 150, height: 150 },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnailDataUrl: s.thumbnail.toDataURL(),
  }));
}

/**
 * Prepare the main process for a new recording session.
 * Creates the recordings directory and resets chunk tracking.
 */
export function startCapture(meetingId: string): { success: boolean; recordingsDir: string } {
  currentMeetingId = meetingId;
  chunkIndex = 0;
  chunkPaths = [];
  const dir = getRecordingsDir(meetingId);
  return { success: true, recordingsDir: dir };
}

/**
 * Write an audio chunk (received as a Buffer from the renderer) to disk.
 * Returns the written file path.
 */
export function writeAudioChunk(data: Buffer): { path: string; index: number } | null {
  if (!currentMeetingId) return null;

  const dir = getRecordingsDir(currentMeetingId);
  const filename = `chunk-${chunkIndex}.webm`;
  const filePath = path.join(dir, filename);

  fs.writeFileSync(filePath, data);
  chunkPaths.push(filePath);

  const result = { path: filePath, index: chunkIndex };
  chunkIndex++;
  return result;
}

/**
 * End the recording session. Returns all chunk file paths.
 */
export function stopCapture(): { chunkPaths: string[] } {
  const result = { chunkPaths: [...chunkPaths] };
  currentMeetingId = null;
  chunkIndex = 0;
  chunkPaths = [];
  return result;
}

/**
 * Get current recording state.
 */
export function getRecordingState(): {
  isRecording: boolean;
  meetingId: string | null;
  chunkCount: number;
} {
  return {
    isRecording: currentMeetingId !== null,
    meetingId: currentMeetingId,
    chunkCount: chunkPaths.length,
  };
}
