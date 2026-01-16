const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

// Ensure Electron can write cache/profile data even in restricted folders.
const userDataDir =
  process.env.ELECTRON_USER_DATA_DIR || path.join(app.getPath('temp'), 'ea-app-profile');
app.setPath('userData', userDataDir);

const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;

let mainWindow;

function createWindow() {
  const titleBarOverlay = process.platform === 'win32'
    ? {
        color: '#1b2a55',
        symbolColor: '#f3f6ff',
        height: 34,
      }
    : undefined;

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.removeMenu();
  win.loadURL(startUrl);

  mainWindow = win;

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

ipcMain.handle('ea:saveProject', async (_event, args) => {
  try {
    const payload = args?.payload ?? null;
    if (!payload) return { ok: false, error: 'Missing payload.' };

    const saveAs = Boolean(args?.saveAs);
    let targetPath = typeof args?.filePath === 'string' ? args.filePath : '';

    if (!targetPath || saveAs) {
      const suggestedName = typeof args?.suggestedName === 'string' ? args.suggestedName : 'ea-project.eaproj';
      const res = await dialog.showSaveDialog({
        title: 'Save EA Project',
        defaultPath: suggestedName,
        filters: [
          { name: 'EA Project', extensions: ['eaproj'] },
        ],
      });
      if (res.canceled || !res.filePath) return { ok: true, canceled: true };
      targetPath = res.filePath;
    }

    const json = JSON.stringify(payload, null, 2);
    console.log('[EA] Save Project: writing file to', targetPath);
    try {
      await fs.promises.writeFile(targetPath, json, 'utf8');
      try {
        await fs.promises.access(targetPath, fs.constants.F_OK);
      } catch (verifyErr) {
        console.error('[EA] Save Project: file missing after write', targetPath, verifyErr);
        return { ok: false, error: `Save failed: file not found at ${targetPath}` };
      }
      console.log('[EA] Save Project: write success', targetPath);
    } catch (err) {
      console.error('[EA] Save Project: write failed', targetPath, err);
      throw err;
    }
    return { ok: true, filePath: targetPath };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to save project.' };
  }
});

ipcMain.handle('ea:openProject', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: 'Open EA Project',
      properties: ['openFile'],
      filters: [
        { name: 'EA Project', extensions: ['eaproj'] },
      ],
    });

    if (res.canceled || !res.filePaths?.length) return { ok: true, canceled: true };
    const filePath = res.filePaths[0];
    console.log('[EA] Open Project: opening file', filePath);
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { ok: true, filePath, content };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to open project.' };
  }
});

ipcMain.handle('ea:openProjectAtPath', async (_event, args) => {
  try {
    const filePath = typeof args?.filePath === 'string' ? args.filePath : '';
    if (!filePath) return { ok: false, error: 'Missing project file path.' };
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { ok: true, filePath, content };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to open project.' };
  }
});

ipcMain.handle('ea:pickProjectFolder', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: 'Select Project Folder',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (res.canceled || !res.filePaths?.length) return { ok: true, canceled: true };
    return { ok: true, folderPath: res.filePaths[0] };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to select folder.' };
  }
});

ipcMain.handle('ea:openDevTools', async () => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: 'No active window.' };
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to open dev tools.' };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
