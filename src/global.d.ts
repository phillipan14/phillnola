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
        delete: (id: string) => Promise<boolean>;
      };
      recording: {
        getDesktopSources: () => Promise<
          { id: string; name: string; thumbnailDataUrl: string }[]
        >;
        start: (meetingId: string) => Promise<{ success: boolean; recordingsDir: string }>;
        writeChunk: (data: number[]) => Promise<{ path: string; index: number } | null>;
        stop: () => Promise<{ chunkPaths: string[] }>;
        getState: () => Promise<{
          isRecording: boolean;
          meetingId: string | null;
          chunkCount: number;
        }>;
      };
      ai: {
        transcribe: (chunkPaths: string[]) => Promise<string>;
        structureNotes: (params: {
          meetingId: string;
          transcript: string;
          userNotes: string;
          recipeId?: string;
        }) => Promise<string>;
        onTranscribeProgress: (
          callback: (progress: { completed: number; total: number; stage: string }) => void,
        ) => () => void;
      };
      calendar: {
        auth: () => Promise<{ success: boolean; error?: string }>;
        getEvents: (daysAhead?: number) => Promise<{
          id: string;
          title: string;
          start: string;
          end: string;
          attendees: string[];
          meetLink?: string;
        }[]>;
        isConnected: () => Promise<boolean>;
        disconnect: () => Promise<{ success: boolean }>;
      };
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
  }
}
