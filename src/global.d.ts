export {};

declare global {
  interface Window {
    phillnola: {
      settings: {
        get: () => Promise<Record<string, string>>;
        save: (key: string, value: string) => Promise<{ success: boolean }>;
      };
      meetings: {
        list: () => Promise<unknown[]>;
        get: (id: string) => Promise<unknown>;
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
      };
      notes: {
        get: (meetingId: string) => Promise<unknown>;
        save: (meetingId: string, content: unknown) => Promise<unknown>;
        search: (query: string) => Promise<unknown[]>;
      };
      recipes: {
        list: () => Promise<unknown[]>;
        get: (id: string) => Promise<unknown>;
        save: (data: unknown) => Promise<unknown>;
      };
      recording: {
        start: () => Promise<{ success: boolean }>;
        stop: () => Promise<{ success: boolean }>;
      };
    };
  }
}
