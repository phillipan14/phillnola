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
  },
  recording: {
    start: (): Promise<{ success: boolean }> => ipcRenderer.invoke("start-recording"),
    stop: (): Promise<{ success: boolean }> => ipcRenderer.invoke("stop-recording"),
  },
};

contextBridge.exposeInMainWorld("phillnola", phillnolaApi);

// Type declaration for the renderer process
export type PhillnolaApi = typeof phillnolaApi;
