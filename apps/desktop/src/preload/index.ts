import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type ApplyOpsRequest,
  type BulkEditRequest,
  type CairnApi,
  type ExportRequest,
  type ImportCommitRequest,
  type ImportPreviewRequest,
  type ImportProgressEvent,
  type LibraryQuery,
  type OpenFileRequest,
  type SaveUrlsRequest,
  type Settings,
  type Unsubscribe,
} from '../shared/protocol';

// One frozen object, no ipcRenderer leak. Event subscriptions return an unsubscribe function
// (the artlux pattern) — the caller owns the listener's lifetime, we never accumulate.
const api: CairnApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.APP_INFO),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.SETTINGS_SET, patch),
  },
  library: {
    query: (query: LibraryQuery) => ipcRenderer.invoke(IPC.LIB_QUERY, query),
    get: (id: string) => ipcRenderer.invoke(IPC.LIB_GET, { id }),
    saveUrls: (request: SaveUrlsRequest) => ipcRenderer.invoke(IPC.LIB_SAVE_URLS, request),
    applyOps: (request: ApplyOpsRequest) => ipcRenderer.invoke(IPC.LIB_APPLY_OPS, request),
    bulkEdit: (request: BulkEditRequest) => ipcRenderer.invoke(IPC.LIB_BULK_EDIT, request),
  },
  import: {
    preview: (request: ImportPreviewRequest) => ipcRenderer.invoke(IPC.IMPORT_PREVIEW, request),
    commit: (request: ImportCommitRequest) => ipcRenderer.invoke(IPC.IMPORT_COMMIT, request),
    onProgress: (cb: (event: ImportProgressEvent) => void): Unsubscribe => {
      const listener = (_e: unknown, event: ImportProgressEvent): void => cb(event);
      ipcRenderer.on(IPC.IMPORT_PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(IPC.IMPORT_PROGRESS, listener);
      };
    },
  },
  export: {
    run: (request: ExportRequest) => ipcRenderer.invoke(IPC.EXPORT_RUN, request),
  },
  dialog: {
    openFile: (request?: OpenFileRequest) => ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE, request ?? {}),
    openDir: () => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR),
  },
  shell: {
    // main is the one that validates http(s); the renderer cannot open anything by itself.
    openExternal: (url: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url),
  },
};

contextBridge.exposeInMainWorld(
  'cairn',
  Object.freeze({
    app: Object.freeze(api.app),
    settings: Object.freeze(api.settings),
    library: Object.freeze(api.library),
    import: Object.freeze(api.import),
    export: Object.freeze(api.export),
    dialog: Object.freeze(api.dialog),
    shell: Object.freeze(api.shell),
  }),
);
