import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { join } from 'node:path';
import { IPC, type AppInfo, type Settings } from '../shared/protocol';

// Cairn main process. Owns the DB (P0 task 5), the job queue (P1), acquisition (P3) and the
// providers (P4). Renderer hardening per plans/TECHNICAL-DESIGN.md §2.1 and docs/SECURITY.md.

const isDev = !app.isPackaged;
// CAIRN_USER_DATA lets the Playwright e2e leg and the rig "cold" case point at a fresh directory.
if (process.env.CAIRN_USER_DATA) app.setPath('userData', process.env.CAIRN_USER_DATA);

app.enableSandbox(); // before app.whenReady()

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  });
}

let settings: Settings = { locale: 'fr', theme: 'dark' }; // persisted in the DB from P0 task 5

function installCsp(): void {
  const csp = [
    "default-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "script-src 'self'" + (isDev ? " 'unsafe-inline'" : ''), // Vite HMR client in dev only
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
  ].join('; ');
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d0d0d',
    title: 'Cairn',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      nodeIntegrationInSubFrames: false,
      spellcheck: false,
    },
  });

  // External links never open inside the app; only http(s) targets reach the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? 'file:')) e.preventDefault();
  });

  win.once('ready-to-show', () => win.show());

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

function registerIpc(): void {
  ipcMain.handle(IPC.APP_INFO, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    dbPath: join(app.getPath('userData'), 'library.db'),
    locale: app.getLocale(),
    dev: isDev,
  }));
  ipcMain.handle(IPC.SETTINGS_GET, (): Settings => settings);
  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch: Partial<Settings>): Settings => {
    settings = { ...settings, ...patch };
    return settings;
  });
}

void app.whenReady().then(() => {
  installCsp();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
