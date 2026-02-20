import { useState, useEffect, useCallback } from "react";
import type { AiProvider, Settings as SettingsType } from "../hooks/useSettings";

/* ── Types ────────────────────────────────────────────────────────── */

interface Props {
  settings: SettingsType;
  saveSetting: (key: string, value: string) => Promise<void>;
  onClose: () => void;
}

type TestStatus = "idle" | "testing" | "ok" | "fail";

interface AudioDevice {
  deviceId: string;
  label: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

async function testOpenAI(key: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function testAnthropic(key: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── Section Component ────────────────────────────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 48 }}>
      <h2
        style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 24, color: "var(--color-text-muted)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

/* ── Settings Component ───────────────────────────────────────────── */

export default function Settings({ settings, saveSetting, onClose }: Props) {
  // API keys
  const [openaiKey, setOpenaiKey] = useState(settings.openai_key || "");
  const [anthropicKey, setAnthropicKey] = useState(
    settings.anthropic_key || "",
  );
  const [showOpenai, setShowOpenai] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [openaiTest, setOpenaiTest] = useState<TestStatus>("idle");
  const [anthropicTest, setAnthropicTest] = useState<TestStatus>("idle");

  // AI provider
  const [provider, setProvider] = useState<AiProvider>(
    (settings.ai_provider as AiProvider) || "openai",
  );

  // Audio devices
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(
    settings.audio_device_id || "",
  );

  // Google Calendar
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(settings.google_client_id || "");
  const [googleClientSecret, setGoogleClientSecret] = useState(settings.google_client_secret || "");
  const [calendarStatus, setCalendarStatus] = useState<"idle" | "connecting" | "ok" | "fail">("idle");

  // Danger zone
  const [confirmReset, setConfirmReset] = useState(false);

  // Sync from props when settings change
  useEffect(() => {
    setOpenaiKey(settings.openai_key || "");
    setAnthropicKey(settings.anthropic_key || "");
    setProvider((settings.ai_provider as AiProvider) || "openai");
    setSelectedDevice(settings.audio_device_id || "");
    setGoogleClientId(settings.google_client_id || "");
    setGoogleClientSecret(settings.google_client_secret || "");
  }, [settings]);

  // Check Google Calendar connection status
  useEffect(() => {
    window.phillnola.calendar.isConnected().then(setGoogleConnected);
  }, []);

  // Load audio devices
  useEffect(() => {
    async function loadDevices() {
      try {
        // Need to request permission first to get labeled devices
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`,
          }));
        setAudioDevices(audioInputs);
      } catch {
        // Permission denied or no devices
        setAudioDevices([]);
      }
    }
    loadDevices();
  }, []);

  /* ── Handlers ───────────────────────────────────────────────────── */

  const handleSaveOpenAI = useCallback(async () => {
    await saveSetting("openai_key", openaiKey);
  }, [openaiKey, saveSetting]);

  const handleSaveAnthropic = useCallback(async () => {
    await saveSetting("anthropic_key", anthropicKey);
  }, [anthropicKey, saveSetting]);

  const handleTestOpenAI = useCallback(async () => {
    if (!openaiKey) return;
    setOpenaiTest("testing");
    const ok = await testOpenAI(openaiKey);
    setOpenaiTest(ok ? "ok" : "fail");
    setTimeout(() => setOpenaiTest("idle"), 3000);
  }, [openaiKey]);

  const handleTestAnthropic = useCallback(async () => {
    if (!anthropicKey) return;
    setAnthropicTest("testing");
    const ok = await testAnthropic(anthropicKey);
    setAnthropicTest(ok ? "ok" : "fail");
    setTimeout(() => setAnthropicTest("idle"), 3000);
  }, [anthropicKey]);

  const handleProviderChange = useCallback(
    async (p: AiProvider) => {
      setProvider(p);
      await saveSetting("ai_provider", p);
    },
    [saveSetting],
  );

  const handleDeviceChange = useCallback(
    async (deviceId: string) => {
      setSelectedDevice(deviceId);
      await saveSetting("audio_device_id", deviceId);
    },
    [saveSetting],
  );

  const handleSaveGoogleCreds = useCallback(async () => {
    await saveSetting("google_client_id", googleClientId);
    await saveSetting("google_client_secret", googleClientSecret);
  }, [googleClientId, googleClientSecret, saveSetting]);

  const handleConnectGoogle = useCallback(async () => {
    setCalendarStatus("connecting");
    // Save credentials first
    await saveSetting("google_client_id", googleClientId);
    await saveSetting("google_client_secret", googleClientSecret);

    const result = await window.phillnola.calendar.auth();
    if (result.success) {
      setCalendarStatus("ok");
      setGoogleConnected(true);
      setTimeout(() => setCalendarStatus("idle"), 3000);
    } else {
      setCalendarStatus("fail");
      setTimeout(() => setCalendarStatus("idle"), 3000);
    }
  }, [googleClientId, googleClientSecret, saveSetting]);

  const handleDisconnectGoogle = useCallback(async () => {
    await window.phillnola.calendar.disconnect();
    setGoogleConnected(false);
  }, []);

  const handleReset = useCallback(async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 5000);
      return;
    }
    // Clear all settings
    const keys = [
      "openai_key",
      "anthropic_key",
      "ai_provider",
      "onboarding_complete",
      "default_recipe_id",
      "audio_device_id",
    ];
    for (const key of keys) {
      await saveSetting(key, "");
    }
    setConfirmReset(false);
    // Reload the app to trigger onboarding
    window.location.reload();
  }, [confirmReset, saveSetting]);

  /* ── Test Status Badge ──────────────────────────────────────────── */

  function TestBadge({ status }: { status: TestStatus }) {
    if (status === "idle") return null;
    if (status === "testing") {
      return (
        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: "var(--color-bg-hover)",
            color: "var(--color-text-muted)",
          }}
        >
          Testing...
        </span>
      );
    }
    if (status === "ok") {
      return (
        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: "rgba(48, 164, 108, 0.1)",
            color: "var(--color-success)",
          }}
        >
          Connected
        </span>
      );
    }
    return (
      <span
        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
        style={{
          backgroundColor: "var(--color-recording-bg)",
          color: "var(--color-recording)",
        }}
      >
        Failed
      </span>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Titlebar drag region */}
      <div className="drag-region" style={{ height: 38 }} />

      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "0 48px 28px 48px", borderBottom: "1px solid var(--color-border-light)" }}
      >
        <h1
          style={{ fontSize: 26, fontWeight: 600, color: "var(--color-text-primary)" }}
        >
          Settings
        </h1>
        <button
          onClick={onClose}
          className="btn btn-ghost no-drag"
          style={{ padding: 10 }}
          title="Close settings"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div style={{ padding: "40px 48px", maxWidth: 580 }}>
          {/* ── API Keys Section ────────────────────────────────── */}
          <Section title="API Keys">
            {/* OpenAI */}
            <div style={{ marginBottom: 32 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <label
                  style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}
                >
                  OpenAI API Key
                </label>
                <TestBadge status={openaiTest} />
              </div>
              <div className="flex items-center" style={{ gap: 10 }}>
                <div
                  className="flex-1 flex items-center"
                  style={{
                    gap: 10,
                    padding: "10px 16px",
                    borderRadius: 12,
                    backgroundColor: "var(--color-bg-secondary)",
                    border: "1.5px solid var(--color-border)",
                  }}
                >
                  <input
                    type={showOpenai ? "text" : "password"}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    onBlur={handleSaveOpenAI}
                    placeholder="sk-..."
                    className="flex-1 bg-transparent border-none outline-none"
                    style={{ fontSize: 14, color: "var(--color-text-primary)" }}
                  />
                  <button
                    onClick={() => setShowOpenai(!showOpenai)}
                    className="shrink-0"
                    style={{ color: "var(--color-text-muted)" }}
                    title={showOpenai ? "Hide key" : "Reveal key"}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {showOpenai ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                <button
                  onClick={handleTestOpenAI}
                  disabled={!openaiKey || openaiTest === "testing"}
                  className="shrink-0 transition-colors"
                  style={{
                    padding: "10px 20px",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 500,
                    border: "none",
                    backgroundColor: "var(--color-bg-hover)",
                    color: openaiKey
                      ? "var(--color-text-secondary)"
                      : "var(--color-text-placeholder)",
                    cursor: openaiKey ? "pointer" : "not-allowed",
                  }}
                >
                  Test
                </button>
              </div>
            </div>

            {/* Anthropic */}
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <label
                  style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}
                >
                  Anthropic API Key
                </label>
                <TestBadge status={anthropicTest} />
              </div>
              <div className="flex items-center" style={{ gap: 10 }}>
                <div
                  className="flex-1 flex items-center"
                  style={{
                    gap: 10,
                    padding: "10px 16px",
                    borderRadius: 12,
                    backgroundColor: "var(--color-bg-secondary)",
                    border: "1.5px solid var(--color-border)",
                  }}
                >
                  <input
                    type={showAnthropic ? "text" : "password"}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    onBlur={handleSaveAnthropic}
                    placeholder="sk-ant-..."
                    className="flex-1 bg-transparent border-none outline-none"
                    style={{ fontSize: 14, color: "var(--color-text-primary)" }}
                  />
                  <button
                    onClick={() => setShowAnthropic(!showAnthropic)}
                    className="shrink-0"
                    style={{ color: "var(--color-text-muted)" }}
                    title={showAnthropic ? "Hide key" : "Reveal key"}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {showAnthropic ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                <button
                  onClick={handleTestAnthropic}
                  disabled={!anthropicKey || anthropicTest === "testing"}
                  className="shrink-0 transition-colors"
                  style={{
                    padding: "10px 20px",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 500,
                    border: "none",
                    backgroundColor: "var(--color-bg-hover)",
                    color: anthropicKey
                      ? "var(--color-text-secondary)"
                      : "var(--color-text-placeholder)",
                    cursor: anthropicKey ? "pointer" : "not-allowed",
                  }}
                >
                  Test
                </button>
              </div>
            </div>
          </Section>

          {/* ── AI Provider Section ─────────────────────────────── */}
          <Section title="AI Provider">
            <div className="flex" style={{ gap: 14 }}>
              <button
                onClick={() => handleProviderChange("openai")}
                className="flex-1 flex items-center transition-all"
                style={{
                  gap: 12, padding: "16px 20px", borderRadius: 16,
                  backgroundColor:
                    provider === "openai"
                      ? "var(--color-accent-subtle)"
                      : "var(--color-bg-secondary)",
                  border: `2px solid ${
                    provider === "openai"
                      ? "var(--color-accent)"
                      : "var(--color-border)"
                  }`,
                }}
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor:
                      provider === "openai"
                        ? "var(--color-accent)"
                        : "var(--color-bg-hover)",
                    color:
                      provider === "openai"
                        ? "#fff"
                        : "var(--color-text-muted)",
                  }}
                >
                  <span className="text-[12px] font-bold">G</span>
                </div>
                <div className="text-left">
                  <div
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    GPT-4o
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  if (anthropicKey) handleProviderChange("anthropic");
                }}
                className="flex-1 flex items-center transition-all"
                style={{
                  gap: 12, padding: "16px 20px", borderRadius: 16,
                  backgroundColor:
                    provider === "anthropic"
                      ? "var(--color-accent-subtle)"
                      : "var(--color-bg-secondary)",
                  border: `2px solid ${
                    provider === "anthropic"
                      ? "var(--color-accent)"
                      : "var(--color-border)"
                  }`,
                  opacity: anthropicKey ? 1 : 0.5,
                  cursor: anthropicKey ? "pointer" : "not-allowed",
                }}
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor:
                      provider === "anthropic"
                        ? "var(--color-accent)"
                        : "var(--color-bg-hover)",
                    color:
                      provider === "anthropic"
                        ? "#fff"
                        : "var(--color-text-muted)",
                  }}
                >
                  <span className="text-[12px] font-bold">C</span>
                </div>
                <div className="text-left">
                  <div
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Claude
                  </div>
                </div>
              </button>
            </div>
            {!anthropicKey && (
              <p
                className="text-[12px] mt-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                Add an Anthropic API key above to enable Claude.
              </p>
            )}
          </Section>

          {/* ── Audio Device Section ────────────────────────────── */}
          <Section title="Audio">
            <label
              style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 10, color: "var(--color-text-primary)" }}
            >
              Input Device
            </label>
            {audioDevices.length > 0 ? (
              <select
                value={selectedDevice}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="outline-none cursor-pointer appearance-none"
                style={{
                  width: "100%", padding: "12px 32px 12px 16px", borderRadius: 12, fontSize: 14,
                  backgroundColor: "var(--color-bg-secondary)",
                  border: "1.5px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              >
                <option value="">System Default</option>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            ) : (
              <p
                className="text-[13px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                No audio devices detected. Grant microphone permission to see
                available devices.
              </p>
            )}
          </Section>

          {/* ── Google Calendar Section ──────────────────────────── */}
          <Section title="Google Calendar">
            {googleConnected ? (
              <div className="flex items-center justify-between" style={{ padding: "16px 20px", borderRadius: 12, backgroundColor: "var(--color-bg-secondary)", border: "1.5px solid var(--color-border)" }}>
                <div className="flex items-center" style={{ gap: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "var(--color-success)" }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
                    Connected to Google Calendar
                  </span>
                </div>
                <button
                  onClick={handleDisconnectGoogle}
                  className="transition-colors"
                  style={{ fontSize: 13, fontWeight: 500, padding: "8px 16px", borderRadius: 12, border: "none", color: "var(--color-recording)", backgroundColor: "var(--color-recording-bg)" }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 10, color: "var(--color-text-primary)" }}>
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    onBlur={handleSaveGoogleCreds}
                    placeholder="your-app.apps.googleusercontent.com"
                    className="outline-none"
                    style={{
                      width: "100%", padding: "12px 16px", borderRadius: 12, fontSize: 14,
                      backgroundColor: "var(--color-bg-secondary)",
                      border: "1.5px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 10, color: "var(--color-text-primary)" }}>
                    Client Secret
                  </label>
                  <input
                    type="password"
                    value={googleClientSecret}
                    onChange={(e) => setGoogleClientSecret(e.target.value)}
                    onBlur={handleSaveGoogleCreds}
                    placeholder="GOCSPX-..."
                    className="outline-none"
                    style={{
                      width: "100%", padding: "12px 16px", borderRadius: 12, fontSize: 14,
                      backgroundColor: "var(--color-bg-secondary)",
                      border: "1.5px solid var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
                <button
                  onClick={handleConnectGoogle}
                  disabled={!googleClientId || !googleClientSecret || calendarStatus === "connecting"}
                  className="flex items-center transition-all"
                  style={{
                    gap: 10, padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "none",
                    backgroundColor: googleClientId && googleClientSecret ? "var(--color-accent)" : "var(--color-bg-hover)",
                    color: googleClientId && googleClientSecret ? "#fff" : "var(--color-text-placeholder)",
                    cursor: googleClientId && googleClientSecret ? "pointer" : "not-allowed",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {calendarStatus === "connecting" ? "Connecting..." : "Connect Google Calendar"}
                </button>
                {calendarStatus === "ok" && (
                  <p className="text-[12px] mt-2" style={{ color: "var(--color-success)" }}>
                    Connected successfully!
                  </p>
                )}
                {calendarStatus === "fail" && (
                  <p className="text-[12px] mt-2" style={{ color: "var(--color-recording)" }}>
                    Connection failed. Check your credentials and try again.
                  </p>
                )}
                <p className="text-[12px] mt-3" style={{ color: "var(--color-text-muted)" }}>
                  Create a Google Cloud project with Calendar API enabled, then add an OAuth 2.0 Client ID (Desktop app type).
                </p>
              </>
            )}
          </Section>

          {/* ── Storage Section ──────────────────────────────────── */}
          <Section title="Storage">
            <div
              className="flex items-center"
              style={{
                gap: 14, padding: "16px 20px", borderRadius: 12,
                backgroundColor: "var(--color-bg-secondary)",
                border: "1.5px solid var(--color-border)",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span
                className="text-[14px] font-mono"
                style={{ color: "var(--color-text-secondary)" }}
              >
                ~/.phillnola/phillnola.db
              </span>
            </div>
          </Section>

          {/* ── Danger Zone ──────────────────────────────────────── */}
          <Section title="Danger Zone">
            <div
              style={{
                padding: 20, borderRadius: 12,
                border: "1.5px solid var(--color-recording)",
                backgroundColor: "var(--color-recording-bg)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div
                    style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}
                  >
                    Reset All Data
                  </div>
                  <p
                    style={{ fontSize: 13, marginTop: 4, color: "var(--color-text-muted)" }}
                  >
                    Clear all settings, API keys, and restart onboarding.
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="shrink-0 transition-colors"
                  style={{
                    padding: "10px 20px", borderRadius: 12, fontSize: 13, fontWeight: 500,
                    backgroundColor: confirmReset
                      ? "var(--color-recording)"
                      : "transparent",
                    color: confirmReset
                      ? "#fff"
                      : "var(--color-recording)",
                    border: confirmReset
                      ? "none"
                      : "1px solid var(--color-recording)",
                  }}
                >
                  {confirmReset ? "Confirm Reset" : "Reset"}
                </button>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
