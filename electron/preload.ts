import { contextBridge, ipcRenderer } from "electron";

const phillnolaApi = {
  settings: {
    get: (): Promise<Record<string, unknown>> => ipcRenderer.invoke("get-settings"),
    save: (settings: Record<string, unknown>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("save-settings", settings),
  },
  meetings: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke("get-meetings"),
  },
  recording: {
    start: (): Promise<{ success: boolean }> => ipcRenderer.invoke("start-recording"),
    stop: (): Promise<{ success: boolean }> => ipcRenderer.invoke("stop-recording"),
  },
};

contextBridge.exposeInMainWorld("phillnola", phillnolaApi);

// Type declaration for the renderer process
export type PhillnolaApi = typeof phillnolaApi;
