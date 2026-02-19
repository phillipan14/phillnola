/**
 * Whisper Transcription Module — Electron Main Process
 *
 * Reads WebM audio chunks from disk and sends them to OpenAI's
 * Whisper API for transcription. Processes chunks in parallel
 * (max 5 concurrent) and concatenates results in order.
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import type { BrowserWindow } from "electron";

/* ── Types ────────────────────────────────────────────────────────────── */

interface TranscriptSegment {
  index: number;
  text: string;
  start?: number;
  end?: number;
}

interface TranscribeProgress {
  completed: number;
  total: number;
  stage: "transcribing" | "done";
}

/* ── Promise Pool ────────────────────────────────────────────────────── */

/**
 * Process items with a concurrency limit.
 * Returns results in the same order as the input array.
 */
async function promisePool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/* ── Transcribe a single chunk ───────────────────────────────────────── */

async function transcribeChunk(
  client: OpenAI,
  chunkPath: string,
  index: number,
): Promise<TranscriptSegment> {
  const fileBuffer = fs.readFileSync(chunkPath);
  const filename = path.basename(chunkPath);

  // Create a File object from the buffer for the SDK
  const file = new File([fileBuffer], filename, { type: "audio/webm" });

  const response = await client.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "verbose_json",
  });

  // verbose_json returns segments with timestamps
  const text = response.text || "";
  const segments = (response as unknown as { segments?: { start: number; end: number }[] }).segments;
  const start = segments?.[0]?.start;
  const end = segments?.[segments.length - 1]?.end;

  return { index, text, start, end };
}

/* ── Main Export ──────────────────────────────────────────────────────── */

/**
 * Transcribe an array of audio chunk files using OpenAI Whisper.
 *
 * @param chunkPaths - Absolute paths to WebM chunk files
 * @param apiKey - OpenAI API key
 * @param mainWindow - Optional BrowserWindow for sending progress events
 * @returns Full transcript text with all chunks concatenated in order
 */
export async function transcribeChunks(
  chunkPaths: string[],
  apiKey: string,
  mainWindow?: BrowserWindow | null,
): Promise<string> {
  if (chunkPaths.length === 0) {
    return "";
  }

  const client = new OpenAI({ apiKey });
  let completed = 0;
  const total = chunkPaths.length;

  // Send initial progress
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("transcribe-progress", {
      completed: 0,
      total,
      stage: "transcribing",
    } satisfies TranscribeProgress);
  }

  // Process chunks in parallel with max 5 concurrent
  const segments = await promisePool(
    chunkPaths,
    5,
    async (chunkPath, index) => {
      const segment = await transcribeChunk(client, chunkPath, index);

      completed++;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("transcribe-progress", {
          completed,
          total,
          stage: completed === total ? "done" : "transcribing",
        } satisfies TranscribeProgress);
      }

      return segment;
    },
  );

  // Sort by index (should already be in order, but just in case)
  segments.sort((a, b) => a.index - b.index);

  // Concatenate transcript text
  const fullTranscript = segments
    .map((seg) => seg.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");

  // Clean up chunk files after successful transcription
  for (const chunkPath of chunkPaths) {
    try {
      if (fs.existsSync(chunkPath)) {
        fs.unlinkSync(chunkPath);
      }
    } catch (err) {
      console.warn(`Failed to clean up chunk file ${chunkPath}:`, err);
    }
  }

  return fullTranscript;
}
