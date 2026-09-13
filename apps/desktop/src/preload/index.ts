import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type CairnApi, type Settings } from '../shared/protocol';

// One frozen object, no ipcRenderer leak. Event subscriptions (from P1 on) return an
// unsubscribe function, the artlux pattern.
const api: CairnApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.APP_INFO),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.SETTINGS_SET, patch),
  },
};

contextBridge.exposeInMainWorld('cairn', Object.freeze(api));
