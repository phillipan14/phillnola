import React, { useState, useEffect, useCallback } from "react";
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
    <div className="mb-8">
      <h2
        className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-4"
        style={{ color: "var(--color-text-muted)" }}
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

  // Danger zone
  const [confirmReset, setConfirmReset] = useState(false);

  // Sync from props when settings change
  useEffect(() => {
    setOpenaiKey(settings.openai_key || "");
    setAnthropicKey(settings.anthropic_key || "");
    setProvider((settings.ai_provider as AiProvider) || "openai");
    setSelectedDevice(settings.audio_device_id || "");
  }, [settings]);

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
        className="flex items-center justify-between px-10 pb-5"
        style={{ borderBottom: "1px solid var(--color-border-light)" }}
      >
        <h1
          className="text-[22px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Settings
        </h1>
        <button
          onClick={onClose}
          className="btn btn-ghost p-1.5 no-drag"
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
        <div className="px-10 py-8 max-w-[560px]">
          {/* ── API Keys Section ────────────────────────────────── */}
          <Section title="API Keys">
            {/* OpenAI */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-[13px] font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  OpenAI API Key
                </label>
                <TestBadge status={openaiTest} />
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{
                    backgroundColor: "var(--color-bg-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <input
                    type={showOpenai ? "text" : "password"}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    onBlur={handleSaveOpenAI}
                    placeholder="sk-..."
                    className="flex-1 bg-transparent border-none outline-none text-[13px]"
                    style={{ color: "var(--color-text-primary)" }}
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
                  className="shrink-0 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors"
                  style={{
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
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-[13px] font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Anthropic API Key
                </label>
                <TestBadge status={anthropicTest} />
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{
                    backgroundColor: "var(--color-bg-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <input
                    type={showAnthropic ? "text" : "password"}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    onBlur={handleSaveAnthropic}
                    placeholder="sk-ant-..."
                    className="flex-1 bg-transparent border-none outline-none text-[13px]"
                    style={{ color: "var(--color-text-primary)" }}
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
                  className="shrink-0 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors"
                  style={{
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
            <div className="flex gap-3">
              <button
                onClick={() => handleProviderChange("openai")}
                className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                style={{
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
                className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                style={{
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
              className="block text-[13px] font-medium mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Input Device
            </label>
            {audioDevices.length > 0 ? (
              <select
                value={selectedDevice}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none cursor-pointer appearance-none pr-8"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  border: "1px solid var(--color-border)",
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

          {/* ── Storage Section ──────────────────────────────────── */}
          <Section title="Storage">
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                border: "1px solid var(--color-border)",
              }}
            >
              <svg
                width="16"
                height="16"
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
                className="text-[13px] font-mono"
                style={{ color: "var(--color-text-secondary)" }}
              >
                ~/.phillnola/phillnola.db
              </span>
            </div>
          </Section>

          {/* ── Danger Zone ──────────────────────────────────────── */}
          <Section title="Danger Zone">
            <div
              className="px-4 py-4 rounded-lg"
              style={{
                border: "1px solid var(--color-recording)",
                backgroundColor: "var(--color-recording-bg)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className="text-[13px] font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Reset All Data
                  </div>
                  <p
                    className="text-[12px] mt-0.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Clear all settings, API keys, and restart onboarding.
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="shrink-0 px-4 py-2 rounded-lg text-[12px] font-medium transition-colors"
                  style={{
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
