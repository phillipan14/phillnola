import { useState, useEffect, useCallback } from "react";

export type AiProvider = "openai" | "anthropic";

export interface Settings {
  openai_key: string;
  anthropic_key: string;
  ai_provider: AiProvider;
  onboarding_complete: string;
  default_recipe_id: string;
  audio_device_id: string;
  [key: string]: string;
}

const DEFAULTS: Settings = {
  openai_key: "",
  anthropic_key: "",
  ai_provider: "openai",
  onboarding_complete: "",
  default_recipe_id: "",
  audio_device_id: "",
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    window.phillnola.settings.get().then((raw) => {
      if (cancelled) return;
      setSettings({ ...DEFAULTS, ...raw } as Settings);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSetting = useCallback(
    async (key: string, value: string) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      await window.phillnola.settings.save(key, value);
    },
    [],
  );

  const isOnboarded = settings.onboarding_complete === "true";

  return { settings, loading, saveSetting, isOnboarded };
}
