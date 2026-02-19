export {};

declare global {
  interface Window {
    phillnola: {
      settings: {
        get: () => Promise<Record<string, unknown>>;
        save: (settings: Record<string, unknown>) => Promise<{ success: boolean }>;
      };
      meetings: {
        list: () => Promise<unknown[]>;
      };
      recording: {
        start: () => Promise<{ success: boolean }>;
        stop: () => Promise<{ success: boolean }>;
      };
    };
  }
}
