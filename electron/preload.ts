import { contextBridge, ipcRenderer } from "electron";

const phillnolaApi = {
  settings: {
    get: (): Promise<Record<string, string>> => ipcRenderer.invoke("get-settings"),
    save: (key: string, value: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("save-setting", key, value),
  },
  meetings: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke("get-meetings"),
    get: (id: string): Promise<unknown> => ipcRenderer.invoke("get-meeting", id),
    create: (data: unknown): Promise<unknown> => ipcRenderer.invoke("create-meeting", data),
    update: (id: string, data: unknown): Promise<unknown> =>
      ipcRenderer.invoke("update-meeting", id, data),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke("delete-meeting", id),
  },
  notes: {
    get: (meetingId: string): Promise<unknown> => ipcRenderer.invoke("get-notes", meetingId),
    save: (meetingId: string, content: unknown): Promise<unknown> =>
      ipcRenderer.invoke("save-notes", meetingId, content),
    search: (query: string): Promise<unknown[]> => ipcRenderer.invoke("search-notes", query),
  },
  recipes: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke("get-recipes"),
    get: (id: string): Promise<unknown> => ipcRenderer.invoke("get-recipe", id),
    save: (data: unknown): Promise<unknown> => ipcRenderer.invoke("save-recipe", data),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke("delete-recipe", id),
  },
  recording: {
    getDesktopSources: (): Promise<{ id: string; name: string; thumbnailDataUrl: string }[]> =>
      ipcRenderer.invoke("get-desktop-sources"),
    start: (meetingId: string): Promise<{ success: boolean; recordingsDir: string }> =>
      ipcRenderer.invoke("start-recording", meetingId),
    writeChunk: (data: number[]): Promise<{ path: string; index: number } | null> =>
      ipcRenderer.invoke("write-audio-chunk", data),
    stop: (): Promise<{ chunkPaths: string[] }> => ipcRenderer.invoke("stop-recording"),
    getState: (): Promise<{
      isRecording: boolean;
      meetingId: string | null;
      chunkCount: number;
    }> => ipcRenderer.invoke("get-recording-state"),
  },
  ai: {
    transcribe: (chunkPaths: string[]): Promise<string> =>
      ipcRenderer.invoke("transcribe", chunkPaths),
    structureNotes: (params: {
      meetingId: string;
      transcript: string;
      userNotes: string;
      recipeId?: string;
    }): Promise<string> => ipcRenderer.invoke("structure-notes", params),
    onTranscribeProgress: (
      callback: (progress: { completed: number; total: number; stage: string }) => void,
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: { completed: number; total: number; stage: string },
      ) => callback(progress);
      ipcRenderer.on("transcribe-progress", handler);
      return () => {
        ipcRenderer.removeListener("transcribe-progress", handler);
      };
    },
  },
  calendar: {
    auth: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("google-auth"),
    getEvents: (daysAhead?: number): Promise<{
      id: string;
      title: string;
      start: string;
      end: string;
      attendees: string[];
      meetLink?: string;
    }[]> => ipcRenderer.invoke("google-calendar-events", daysAhead),
    isConnected: (): Promise<boolean> => ipcRenderer.invoke("google-is-connected"),
    disconnect: (): Promise<{ success: boolean }> => ipcRenderer.invoke("google-disconnect"),
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("open-external", url),
  // Events from main process (tray, etc.)
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
};

contextBridge.exposeInMainWorld("phillnola", phillnolaApi);

// Type declaration for the renderer process
export type PhillnolaApi = typeof phillnolaApi;
