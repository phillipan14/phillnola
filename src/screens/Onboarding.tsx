import React, { useState, useEffect, useCallback } from "react";
import type { AiProvider } from "../hooks/useSettings";

/* ── Types ────────────────────────────────────────────────────────── */

interface Recipe {
  id: string;
  name: string;
  description: string;
}

interface Props {
  onComplete: () => void;
  saveSetting: (key: string, value: string) => Promise<void>;
}

type KeyStatus = "idle" | "validating" | "valid" | "invalid";

/* ── Helpers ──────────────────────────────────────────────────────── */

async function validateOpenAIKey(key: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function validateAnthropicKey(key: string): Promise<boolean> {
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

/* ── Recipe Icons ─────────────────────────────────────────────────── */

const RECIPE_ICONS: Record<string, string> = {
  "recipe-general-meeting": "clipboard",
  "recipe-one-on-one": "users",
  "recipe-sales-discovery": "target",
  "recipe-interview": "user-check",
  "recipe-standup": "zap",
};

function RecipeIcon({ recipeId }: { recipeId: string }) {
  const icon = RECIPE_ICONS[recipeId] || "clipboard";
  const paths: Record<string, React.ReactNode> = {
    clipboard: (
      <>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      </>
    ),
    users: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    "user-check": (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <polyline points="17 11 19 13 23 9" />
      </>
    ),
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  };

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[icon]}
    </svg>
  );
}

/* ── Status Icon ──────────────────────────────────────────────────── */

function StatusIcon({ status }: { status: KeyStatus }) {
  if (status === "validating") {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: 20, height: 20 }}
      >
        <div
          className="rounded-full border-2 border-t-transparent"
          style={{
            width: 16,
            height: 16,
            borderColor: "var(--color-accent)",
            borderTopColor: "transparent",
            animation: "spin 0.6s linear infinite",
          }}
        />
      </div>
    );
  }
  if (status === "valid") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === "invalid") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-recording)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
  return null;
}

/* ── Step Indicator ───────────────────────────────────────────────── */

function StepIndicator({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            backgroundColor:
              i === current
                ? "var(--color-accent)"
                : i < current
                  ? "var(--color-accent)"
                  : "var(--color-border)",
            opacity: i < current ? 0.5 : 1,
          }}
        />
      ))}
    </div>
  );
}

/* ── Onboarding Component ─────────────────────────────────────────── */

const TOTAL_STEPS = 6;

export default function Onboarding({ onComplete, saveSetting }: Props) {
  const [step, setStep] = useState(0);

  // Step 0: OpenAI key
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiStatus, setOpenaiStatus] = useState<KeyStatus>("idle");

  // Step 1: Anthropic key
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicStatus, setAnthropicStatus] = useState<KeyStatus>("idle");

  // Step 2: AI provider
  const [provider, setProvider] = useState<AiProvider>("openai");

  // Step 3: Google Calendar (placeholder)

  // Step 4: Default recipe
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState("");

  useEffect(() => {
    window.phillnola.recipes.list().then((r) => {
      const list = r as Recipe[];
      setRecipes(list);
      if (list.length > 0) {
        setSelectedRecipe(list[0].id);
      }
    });
  }, []);

  /* ── Key validation ─────────────────────────────────────────────── */

  const handleValidateOpenAI = useCallback(async () => {
    if (!openaiKey.trim()) return;
    setOpenaiStatus("validating");
    const ok = await validateOpenAIKey(openaiKey.trim());
    setOpenaiStatus(ok ? "valid" : "invalid");
    if (ok) {
      await saveSetting("openai_key", openaiKey.trim());
    }
  }, [openaiKey, saveSetting]);

  const handleValidateAnthropic = useCallback(async () => {
    if (!anthropicKey.trim()) return;
    setAnthropicStatus("validating");
    const ok = await validateAnthropicKey(anthropicKey.trim());
    setAnthropicStatus(ok ? "valid" : "invalid");
    if (ok) {
      await saveSetting("anthropic_key", anthropicKey.trim());
    }
  }, [anthropicKey, saveSetting]);

  /* ── Navigation ─────────────────────────────────────────────────── */

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return openaiStatus === "valid";
      case 1:
        return true; // optional
      case 2:
        return true;
      case 3:
        return true;
      case 4:
        return !!selectedRecipe;
      case 5:
        return true;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (step === 2) {
      await saveSetting("ai_provider", provider);
    }
    if (step === 4) {
      await saveSetting("default_recipe_id", selectedRecipe);
    }
    if (step === TOTAL_STEPS - 1) {
      await saveSetting("onboarding_complete", "true");
      onComplete();
      return;
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  /* ── Step Content ───────────────────────────────────────────────── */

  const renderStep = () => {
    switch (step) {
      /* ── Step 0: Welcome + OpenAI Key ─────────────────────────── */
      case 0:
        return (
          <div className="fade-in">
            <div className="mb-2">
              <span
                className="inline-block text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--color-accent-subtle)",
                  color: "var(--color-accent)",
                }}
              >
                Step 1 of {TOTAL_STEPS}
              </span>
            </div>
            <h1
              className="text-[28px] font-semibold leading-tight mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Welcome to Phillnola
            </h1>
            <p
              className="text-[15px] mb-8 leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Your AI meeting notepad. No bots joining your calls, no data
              leaving your machine. Let's get you set up in a few steps.
            </p>

            <label
              className="block text-[13px] font-medium mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              OpenAI API Key
            </label>
            <p
              className="text-[13px] mb-3"
              style={{ color: "var(--color-text-muted)" }}
            >
              Used for transcription and note structuring. Your key stays on
              this device.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => {
                  setOpenaiKey(e.target.value);
                  setOpenaiStatus("idle");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleValidateOpenAI();
                }}
                placeholder="sk-..."
                className="flex-1 px-3 py-2.5 rounded-lg text-[14px] outline-none transition-all"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  border: `1px solid ${
                    openaiStatus === "valid"
                      ? "var(--color-success)"
                      : openaiStatus === "invalid"
                        ? "var(--color-recording)"
                        : "var(--color-border)"
                  }`,
                  color: "var(--color-text-primary)",
                }}
              />
              <StatusIcon status={openaiStatus} />
            </div>
            {openaiKey.trim() && openaiStatus === "idle" && (
              <button
                onClick={handleValidateOpenAI}
                className="mt-3 text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "#fff",
                }}
              >
                Validate Key
              </button>
            )}
            {openaiStatus === "invalid" && (
              <p
                className="mt-2 text-[13px]"
                style={{ color: "var(--color-recording)" }}
              >
                Invalid API key. Please check and try again.
              </p>
            )}
            {openaiStatus === "valid" && (
              <p
                className="mt-2 text-[13px]"
                style={{ color: "var(--color-success)" }}
              >
                Key validated successfully.
              </p>
            )}
          </div>
        );

      /* ── Step 1: Anthropic Key (optional) ─────────────────────── */
      case 1:
        return (
          <div className="fade-in">
            <div className="mb-2">
              <span
                className="inline-block text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--color-accent-subtle)",
                  color: "var(--color-accent)",
                }}
              >
                Step 2 of {TOTAL_STEPS}
              </span>
            </div>
            <h1
              className="text-[28px] font-semibold leading-tight mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Add Claude (Optional)
            </h1>
            <p
              className="text-[15px] mb-8 leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Add an Anthropic API key to use Claude for note structuring.
              You can skip this and add it later in Settings.
            </p>

            <label
              className="block text-[13px] font-medium mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Anthropic API Key
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => {
                  setAnthropicKey(e.target.value);
                  setAnthropicStatus("idle");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleValidateAnthropic();
                }}
                placeholder="sk-ant-..."
                className="flex-1 px-3 py-2.5 rounded-lg text-[14px] outline-none transition-all"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  border: `1px solid ${
                    anthropicStatus === "valid"
                      ? "var(--color-success)"
                      : anthropicStatus === "invalid"
                        ? "var(--color-recording)"
                        : "var(--color-border)"
                  }`,
                  color: "var(--color-text-primary)",
                }}
              />
              <StatusIcon status={anthropicStatus} />
            </div>
            {anthropicKey.trim() && anthropicStatus === "idle" && (
              <button
                onClick={handleValidateAnthropic}
                className="mt-3 text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "#fff",
                }}
              >
                Validate Key
              </button>
            )}
            {anthropicStatus === "invalid" && (
              <p
                className="mt-2 text-[13px]"
                style={{ color: "var(--color-recording)" }}
              >
                Invalid API key. Please check and try again.
              </p>
            )}
            {anthropicStatus === "valid" && (
              <p
                className="mt-2 text-[13px]"
                style={{ color: "var(--color-success)" }}
              >
                Key validated successfully.
              </p>
            )}
          </div>
        );

      /* ── Step 2: Choose AI Provider ───────────────────────────── */
      case 2:
        return (
          <div className="fade-in">
            <div className="mb-2">
              <span
                className="inline-block text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--color-accent-subtle)",
                  color: "var(--color-accent)",
                }}
              >
                Step 3 of {TOTAL_STEPS}
              </span>
            </div>
            <h1
              className="text-[28px] font-semibold leading-tight mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Choose Your AI
            </h1>
            <p
              className="text-[15px] mb-8 leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Select which model to use for structuring your meeting notes.
              You can change this anytime in Settings.
            </p>

            <div className="flex flex-col gap-3">
              {/* GPT-4o */}
              <button
                onClick={() => setProvider("openai")}
                className="flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all"
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
                    width: 40,
                    height: 40,
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
                  <span className="text-[14px] font-bold">G</span>
                </div>
                <div>
                  <div
                    className="text-[14px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    GPT-4o
                  </div>
                  <div
                    className="text-[12px] mt-0.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Fast, reliable, great for most meetings
                  </div>
                </div>
              </button>

              {/* Claude */}
              <button
                onClick={() => {
                  if (anthropicStatus === "valid") setProvider("anthropic");
                }}
                className="flex items-center gap-4 px-4 py-4 rounded-xl text-left transition-all"
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
                  opacity: anthropicStatus === "valid" ? 1 : 0.5,
                  cursor:
                    anthropicStatus === "valid" ? "pointer" : "not-allowed",
                }}
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: 40,
                    height: 40,
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
                  <span className="text-[14px] font-bold">C</span>
                </div>
                <div>
                  <div
                    className="text-[14px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Claude
                  </div>
                  <div
                    className="text-[12px] mt-0.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {anthropicStatus === "valid"
                      ? "Nuanced, great at long-form reasoning"
                      : "Add an Anthropic key in the previous step to enable"}
                  </div>
                </div>
              </button>
            </div>
          </div>
        );

      /* ── Step 3: Google Calendar ──────────────────────────────── */
      case 3:
        return (
          <div className="fade-in">
            <div className="mb-2">
              <span
                className="inline-block text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--color-accent-subtle)",
                  color: "var(--color-accent)",
                }}
              >
                Step 4 of {TOTAL_STEPS}
              </span>
            </div>
            <h1
              className="text-[28px] font-semibold leading-tight mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Connect Your Calendar
            </h1>
            <p
              className="text-[15px] mb-8 leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Phillnola can automatically detect meetings from Google Calendar
              and pre-fill titles and attendees. You can always set this up
              later.
            </p>

            <div
              className="flex flex-col items-center gap-4 py-8 rounded-xl"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                border: "1px dashed var(--color-border)",
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <button
                className="px-5 py-2.5 rounded-lg text-[14px] font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "#fff",
                }}
                onClick={() => {
                  // TODO: implement Google Calendar OAuth in Task 8
                }}
              >
                Connect Google Calendar
              </button>
              <span
                className="text-[12px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Coming soon -- you can skip for now
              </span>
            </div>
          </div>
        );

      /* ── Step 4: Choose Default Recipe ────────────────────────── */
      case 4:
        return (
          <div className="fade-in">
            <div className="mb-2">
              <span
                className="inline-block text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--color-accent-subtle)",
                  color: "var(--color-accent)",
                }}
              >
                Step 5 of {TOTAL_STEPS}
              </span>
            </div>
            <h1
              className="text-[28px] font-semibold leading-tight mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Pick a Default Recipe
            </h1>
            <p
              className="text-[15px] mb-8 leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Recipes tell the AI how to structure your notes. You can change
              the recipe for each meeting, but this will be your default.
            </p>

            <div className="grid grid-cols-1 gap-2.5">
              {recipes.map((recipe) => (
                <button
                  key={recipe.id}
                  onClick={() => setSelectedRecipe(recipe.id)}
                  className="flex items-start gap-3.5 px-4 py-3.5 rounded-xl text-left transition-all"
                  style={{
                    backgroundColor:
                      selectedRecipe === recipe.id
                        ? "var(--color-accent-subtle)"
                        : "var(--color-bg-secondary)",
                    border: `2px solid ${
                      selectedRecipe === recipe.id
                        ? "var(--color-accent)"
                        : "var(--color-border)"
                    }`,
                  }}
                >
                  <div
                    className="flex items-center justify-center rounded-lg shrink-0 mt-0.5"
                    style={{
                      width: 36,
                      height: 36,
                      backgroundColor:
                        selectedRecipe === recipe.id
                          ? "var(--color-accent)"
                          : "var(--color-bg-hover)",
                      color:
                        selectedRecipe === recipe.id
                          ? "#fff"
                          : "var(--color-text-muted)",
                    }}
                  >
                    <RecipeIcon recipeId={recipe.id} />
                  </div>
                  <div className="min-w-0">
                    <div
                      className="text-[14px] font-semibold"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {recipe.name}
                    </div>
                    <div
                      className="text-[12px] mt-0.5 leading-relaxed"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {recipe.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      /* ── Step 5: All Set ──────────────────────────────────────── */
      case 5:
        return (
          <div className="fade-in text-center">
            <div
              className="mx-auto mb-6 flex items-center justify-center rounded-full"
              style={{
                width: 64,
                height: 64,
                backgroundColor: "var(--color-accent-subtle)",
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1
              className="text-[28px] font-semibold leading-tight mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              You're all set
            </h1>
            <p
              className="text-[15px] mb-2 leading-relaxed"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Phillnola is ready to capture and structure your meeting notes.
            </p>
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--color-text-muted)" }}
            >
              Start a new meeting or let it auto-detect from your calendar.
              Your notes, your keys, your machine.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div
      className="flex h-screen w-screen items-center justify-center"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      {/* macOS drag region */}
      <div
        className="drag-region fixed top-0 left-0 right-0"
        style={{ height: 38 }}
      />

      <div className="w-full max-w-[480px] px-6">
        {/* Content */}
        <div className="mb-10">{renderStep()}</div>

        {/* Footer: step indicator + navigation */}
        <div className="flex items-center justify-between">
          <StepIndicator total={TOTAL_STEPS} current={step} />

          <div className="flex items-center gap-2">
            {step > 0 && step < TOTAL_STEPS - 1 && (
              <button
                onClick={handleBack}
                className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-bg-hover)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Back
              </button>
            )}

            {/* Skip button for optional steps */}
            {(step === 1 || step === 3) && (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
                style={{
                  color: "var(--color-text-muted)",
                }}
              >
                Skip
              </button>
            )}

            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="px-5 py-2 rounded-lg text-[13px] font-medium transition-all"
              style={{
                backgroundColor: canProceed()
                  ? "var(--color-accent)"
                  : "var(--color-bg-hover)",
                color: canProceed() ? "#fff" : "var(--color-text-placeholder)",
                cursor: canProceed() ? "pointer" : "not-allowed",
              }}
            >
              {step === TOTAL_STEPS - 1 ? "Get Started" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
