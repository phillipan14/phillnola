/**
 * useRecording Hook
 *
 * Manages audio recording lifecycle in the renderer process:
 *   - Captures system audio via desktopCapturer + getUserMedia
 *   - Captures microphone audio via getUserMedia
 *   - Merges both streams via Web Audio API (AudioContext + MediaStreamDestination)
 *   - Records using MediaRecorder, chunking every 30 seconds
 *   - Sends chunk data to main process via IPC for disk writing
 *   - Provides real-time audio level via AnalyserNode (0-1 float)
 *   - Tracks elapsed time
 */

import { useState, useRef, useCallback, useEffect } from "react";

export interface UseRecordingReturn {
  /** Start recording for a given meeting */
  startRecording: (meetingId: string) => Promise<void>;
  /** Stop recording and return chunk file paths */
  stopRecording: () => Promise<string[]>;
  /** Whether we are currently recording */
  isRecording: boolean;
  /** Elapsed seconds since recording started */
  elapsed: number;
  /** Current audio level 0-1 for waveform visualization */
  audioLevel: number;
  /** Error message if something went wrong */
  error: string | null;
}

/** How often to chunk (ms) */
const CHUNK_INTERVAL_MS = 30_000;

export function useRecording(): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const meetingIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);

  // ── Audio Level Polling (via requestAnimationFrame) ──────────────

  const pollAudioLevel = useCallback(() => {
    if (!analyserRef.current) {
      setAudioLevel(0);
      return;
    }

    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);

    // Compute RMS level
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = (data[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / data.length);
    // Normalize to 0-1 range (rms is typically 0-0.5 for normal audio)
    const normalized = Math.min(1, rms * 3);
    setAudioLevel(normalized);

    animationFrameRef.current = requestAnimationFrame(pollAudioLevel);
  }, []);

  // ── Start Recording ─────────────────────────────────────────────

  const startRecording = useCallback(
    async (meetingId: string) => {
      try {
        setError(null);
        meetingIdRef.current = meetingId;

        // 1. Tell main process to prepare recording directory
        const prepResult = await window.phillnola.recording.start(meetingId);
        if (!prepResult.success) {
          throw new Error("Failed to prepare recording directory");
        }

        // 2. Get desktop sources from main process
        const sources = await window.phillnola.recording.getDesktopSources();
        if (!sources || sources.length === 0) {
          throw new Error("No screen sources available for audio capture");
        }

        // 3. Capture system audio
        // Try getDisplayMedia first (modern Electron 28+), fall back to getUserMedia
        let systemStream: MediaStream | null = null;
        try {
          // Modern approach: getDisplayMedia with audio (Electron handles via setDisplayMediaRequestHandler)
          systemStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true, // Required by spec but we'll discard the video track
          });
          // Remove video tracks — we only want audio
          systemStream.getVideoTracks().forEach((track) => {
            track.stop();
            systemStream!.removeTrack(track);
          });
        } catch {
          // Fallback: try the legacy Electron desktopCapturer approach
          try {
            systemStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: "desktop",
                },
              } as unknown as MediaTrackConstraints,
              video: {
                mandatory: {
                  chromeMediaSource: "desktop",
                },
              } as unknown as MediaTrackConstraints,
            });
            systemStream.getVideoTracks().forEach((track) => {
              track.stop();
              systemStream!.removeTrack(track);
            });
          } catch {
            console.warn("System audio capture not available, using microphone only");
          }
        }

        // 4. Capture microphone
        let micStream: MediaStream | null = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: 48000,
            },
          });
        } catch {
          console.warn("Microphone capture not available");
        }

        if (!systemStream && !micStream) {
          throw new Error(
            "No audio sources available. Please grant microphone and screen recording permissions."
          );
        }

        // Track streams for cleanup
        if (systemStream) streamsRef.current.push(systemStream);
        if (micStream) streamsRef.current.push(micStream);

        // 5. Merge streams via Web Audio API
        const audioContext = new AudioContext({ sampleRate: 48000 });
        audioContextRef.current = audioContext;

        const destination = audioContext.createMediaStreamDestination();

        // Create analyser for audio level monitoring
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        if (systemStream && systemStream.getAudioTracks().length > 0) {
          const systemSource = audioContext.createMediaStreamSource(systemStream);
          systemSource.connect(destination);
          systemSource.connect(analyser);
        }

        if (micStream) {
          const micSource = audioContext.createMediaStreamSource(micStream);
          // Apply a slight gain reduction to mic to balance with system audio
          const micGain = audioContext.createGain();
          micGain.gain.value = 0.8;
          micSource.connect(micGain);
          micGain.connect(destination);
          // Also connect to analyser if no system audio
          if (!systemStream || systemStream.getAudioTracks().length === 0) {
            micGain.connect(analyser);
          }
        }

        const mergedStream = destination.stream;

        // 6. Start MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        const recorder = new MediaRecorder(mergedStream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            // Convert Blob to ArrayBuffer, then send to main process
            const arrayBuffer = await event.data.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            await window.phillnola.recording.writeChunk(Array.from(uint8Array));
          }
        };

        recorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          setError("Recording error occurred");
        };

        // Start recording with 30-second chunks
        recorder.start(CHUNK_INTERVAL_MS);

        // 7. Start elapsed timer
        startTimeRef.current = Date.now();
        setElapsed(0);
        timerRef.current = setInterval(() => {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        // 8. Start audio level polling
        pollAudioLevel();

        setIsRecording(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown recording error";
        setError(message);
        console.error("Failed to start recording:", err);
        // Cleanup any partial state
        cleanup();
      }
    },
    [pollAudioLevel]
  );

  // ── Cleanup Helper ──────────────────────────────────────────────

  const cleanup = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop timer
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop all media tracks
    streamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    streamsRef.current = [];

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    mediaRecorderRef.current = null;
    setAudioLevel(0);
  }, []);

  // ── Stop Recording ──────────────────────────────────────────────

  const stopRecording = useCallback(async (): Promise<string[]> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state === "inactive") {
        cleanup();
        setIsRecording(false);
        // Still call stopCapture to get any existing chunks
        window.phillnola.recording.stop().then((result) => {
          resolve(result.chunkPaths);
        });
        return;
      }

      // When the recorder stops, the final ondataavailable fires,
      // then we can collect chunk paths from main process
      recorder.onstop = async () => {
        // Small delay to ensure the last chunk write completes
        await new Promise((r) => setTimeout(r, 200));
        const result = await window.phillnola.recording.stop();
        cleanup();
        setIsRecording(false);
        setElapsed(0);
        resolve(result.chunkPaths);
      };

      recorder.stop();
    });
  }, [cleanup]);

  // ── Cleanup on Unmount ──────────────────────────────────────────

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    elapsed,
    audioLevel,
    error,
  };
}
