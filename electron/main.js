const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

// Ensure Electron can write cache/profile data even in restricted folders.
const userDataDir =
  process.env.ELECTRON_USER_DATA_DIR ||
  path.join(app.getPath('temp'), 'ea-app-profile');
app.setPath('userData', userDataDir);

const appIconPath = path.join(__dirname, '..', 'build', 'icons', 'app.png');
const appIcoPath = path.join(__dirname, '..', 'build', 'icons', 'app.ico');
const fileIconCandidates = [
  path.join(__dirname, '..', 'build', 'icons', 'eapkg-icon.ico'),
  path.join(__dirname, '..', 'build', 'icons', 'eapkg.ico'),
  path.join(__dirname, '..', 'public', 'favicon.ico'),
];
const fileIconPngCandidates = [
  path.join(__dirname, '..', 'build', 'icons', 'eapkg-icon.png'),
  path.join(__dirname, '..', 'build', 'icons', 'eapkg.png'),
  path.join(__dirname, '..', 'code-file_16591933.png'),
];

if (process.platform === 'win32') {
  // Helps Windows associate the taskbar icon with this app in dev.
  app.setAppUserModelId('com.redlyai.desktop');
}

const buildIcoFromPngBuffer = (pngBuffer) => {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 24) return null;
  const signature = pngBuffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  const width = pngBuffer.readUInt32BE(16);
  const height = pngBuffer.readUInt32BE(20);
  if (!width || !height) return null;
  const size = Math.min(Math.max(width, 1), 256);
  const icoSize = size >= 256 ? 0 : size;

  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize;
  const totalSize = dataOffset + pngBuffer.length;
  const ico = Buffer.alloc(totalSize);
  let offset = 0;

  ico.writeUInt16LE(0, offset);
  offset += 2;
  ico.writeUInt16LE(1, offset);
  offset += 2;
  ico.writeUInt16LE(1, offset);
  offset += 2;

  ico.writeUInt8(icoSize, offset);
  offset += 1;
  ico.writeUInt8(icoSize, offset);
  offset += 1;
  ico.writeUInt8(0, offset);
  offset += 1;
  ico.writeUInt8(0, offset);
  offset += 1;
  ico.writeUInt16LE(1, offset);
  offset += 2;
  ico.writeUInt16LE(32, offset);
  offset += 2;
  ico.writeUInt32LE(pngBuffer.length, offset);
  offset += 4;
  ico.writeUInt32LE(dataOffset, offset);
  offset += 4;

  pngBuffer.copy(ico, dataOffset);
  return ico;
};

const resolveFileTypeIconPath = () => {
  const icoCandidate = fileIconCandidates.find((candidate) =>
    fs.existsSync(candidate),
  );
  if (icoCandidate) return icoCandidate;

  const pngCandidate = fileIconPngCandidates.find((candidate) =>
    fs.existsSync(candidate),
  );
  if (!pngCandidate) return null;

  try {
    const pngBuffer = fs.readFileSync(pngCandidate);
    const icoBuffer = buildIcoFromPngBuffer(pngBuffer);
    if (!icoBuffer) return null;
    const tempIcoPath = path.join(app.getPath('temp'), 'redlyai-ea-file.ico');
    fs.writeFileSync(tempIcoPath, icoBuffer);
    return tempIcoPath;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// .eapkg/.eaproj file-type registration (Windows)
// Writes to HKCU\Software\Classes so no admin elevation is needed.
// ---------------------------------------------------------------------------
const registerEaFileTypes = () => {
  if (process.platform !== 'win32') return;

  try {
    // Determine icon path — prefer generated .ico, else derive from PNG
    const icoPath = resolveFileTypeIconPath();

    // Determine the command to open .eapkg files
    // In packaged app: process.execPath is the .exe
    // In dev: process.execPath is electron.exe (node_modules/.../electron.exe)
    const exePath = process.execPath;
    const openCommand = `"${exePath}" "%1"`;

    const regAdd = (key, valueName, data, type = 'REG_SZ') => {
      const nameArg = valueName ? `/v "${valueName}"` : '/ve';
      execSync(`reg add "${key}" ${nameArg} /t ${type} /d "${data}" /f`, {
        stdio: 'ignore',
      });
    };

    const registerFileType = (extension, progId, friendlyName) => {
      regAdd(`HKCU\\Software\\Classes\\.${extension}`, '', progId);
      regAdd(`HKCU\\Software\\Classes\\${progId}`, '', friendlyName);
      if (icoPath) {
        regAdd(`HKCU\\Software\\Classes\\${progId}\\DefaultIcon`, '', icoPath);
      }
      regAdd(
        `HKCU\\Software\\Classes\\${progId}\\shell\\open\\command`,
        '',
        openCommand,
      );
    };

    registerFileType('eapkg', 'RedlyAI.EAPkg', 'EA Repository Package');
    registerFileType('eaproj', 'RedlyAI.EAProj', 'EA Project');

    // Notify Windows Explorer of the change so icons refresh
    try {
      const _ffi = `
        const { execSync } = require('child_process');
        execSync('ie4uinit.exe -show', { stdio: 'ignore' });
      `;
      // Use a lighter-weight approach: just call SHChangeNotify via a tiny PowerShell snippet
      execSync(
        'powershell -NoProfile -Command "& { Add-Type -TypeDefinition \\"using System; using System.Runtime.InteropServices; public class ShellNotify { [DllImport(\\\\\\"shell32.dll\\\\\\")] public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2); }\\" -Language CSharp; [ShellNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero) }"',
        { stdio: 'ignore' },
      );
    } catch {
      // Not critical — icon may not refresh until next Explorer restart
    }

    console.log('[EA] .eapkg/.eaproj file types registered (HKCU)');
  } catch (err) {
    console.warn('[EA] Failed to register file types:', err.message);
  }
};

const managedRepoRoot = () =>
  path.join(app.getPath('userData'), 'ArchitectureStudio', 'repositories');

const sanitizeRepoId = (value) => {
  const raw = String(value || '').trim();
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new Error('Invalid repository id.');
  return safe;
};

const ensureManagedRepoRoot = async () => {
  const root = managedRepoRoot();
  await fs.promises.mkdir(root, { recursive: true });
  return root;
};

const repoDirForId = (repoId) =>
  path.join(managedRepoRoot(), sanitizeRepoId(repoId));

const readJsonIfExists = async (filePath) => {
  try {
    const text = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const writeJson = async (filePath, value) => {
  const json = JSON.stringify(value, null, 2);
  await fs.promises.writeFile(filePath, json, 'utf8');
};

const getRepositoryNameFromPayload = (payload) => {
  const metaName =
    payload?.meta?.repositoryName ||
    payload?.repository?.metadata?.repositoryName;
  return String(metaName || 'Repository').trim() || 'Repository';
};

const buildMetaRecord = (repoId, payload, existingMeta) => {
  const now = new Date().toISOString();
  const name = getRepositoryNameFromPayload(payload);
  const orgName = String(
    payload?.meta?.organizationName ||
      payload?.repository?.metadata?.organizationName ||
      '',
  ).trim();
  const description = orgName
    ? `${orgName} EA repository`
    : `Repository: ${name}`;
  return {
    id: repoId,
    name,
    description,
    createdAt: existingMeta?.createdAt || payload?.meta?.createdAt || now,
    updatedAt: now,
    lastOpenedAt: existingMeta?.lastOpenedAt || null,
  };
};

const isDev = !!process.env.ELECTRON_START_URL;

const resolveAppIcon = () => {
  const fallbackIco = path.join(__dirname, '..', 'public', 'favicon.ico');
  if (process.platform === 'win32' && fs.existsSync(appIcoPath))
    return appIcoPath;
  if (fs.existsSync(appIconPath)) return appIconPath;
  if (fs.existsSync(fallbackIco)) return fallbackIco;
  return undefined;
};

let mainWindow;
const pendingRepositoryImports = [];

const enqueueRepositoryImport = async (filePath) => {
  try {
    if (
      !filePath ||
      !(
        filePath.toLowerCase().endsWith('.eapkg') ||
        filePath.toLowerCase().endsWith('.zip')
      )
    )
      return;

    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat || stat.size === 0) {
      console.error(
        '[EA] Repository import: file is empty or does not exist:',
        filePath,
      );
      return;
    }

    const content = await fs.promises.readFile(filePath);

    // Validate ZIP header (PK\x03\x04)
    if (
      content.length < 4 ||
      content[0] !== 0x50 ||
      content[1] !== 0x4b ||
      content[2] !== 0x03 ||
      content[3] !== 0x04
    ) {
      console.error(
        '[EA] Repository import: file is not a valid ZIP:',
        filePath,
        'header:',
        content.slice(0, 4).toString('hex'),
      );
      return;
    }

    const name = path.basename(filePath);
    console.log(
      '[EA] Enqueuing repository import:',
      name,
      'size:',
      content.length,
      'bytes',
    );

    const base64 = content.toString('base64');
    pendingRepositoryImports.push({ name, content: base64, format: 'eapkg' });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ea:repositoryPackageImport', {
        name,
        content: base64,
        format: 'eapkg',
      });
    }
  } catch (err) {
    console.error('[EA] Repository import enqueue failed', err);
  }
};

function createWindow() {
  const titleBarOverlay =
    process.platform === 'win32'
      ? {
          color: '#1e1e1e',
          symbolColor: '#cccccc',
          height: 34,
        }
      : undefined;

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: resolveAppIcon(),
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

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

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
    const bytes = args?.bytes ?? null;
    if (!payload && !bytes) return { ok: false, error: 'Missing payload.' };

    const saveAs = Boolean(args?.saveAs);
    let targetPath = typeof args?.filePath === 'string' ? args.filePath : '';

    if (!targetPath || saveAs) {
      const suggestedName =
        typeof args?.suggestedName === 'string'
          ? args.suggestedName
          : 'ea-repository.eapkg';
      const res = await dialog.showSaveDialog({
        title: 'Save EA Project',
        defaultPath: suggestedName,
        filters: [{ name: 'EA Package', extensions: ['eapkg'] }],
      });
      if (res.canceled || !res.filePath) return { ok: true, canceled: true };
      targetPath = res.filePath;
    }

    const toBuffer = (value) => {
      if (Buffer.isBuffer(value)) return value;
      if (value instanceof ArrayBuffer)
        return Buffer.from(new Uint8Array(value));
      if (Array.isArray(value)) return Buffer.from(value);
      if (value?.buffer instanceof ArrayBuffer)
        return Buffer.from(new Uint8Array(value.buffer));
      return null;
    };

    const buffer =
      toBuffer(bytes) || Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
    console.log('[EA] Save Project: writing file to', targetPath);
    try {
      await fs.promises.writeFile(targetPath, buffer);
      try {
        await fs.promises.access(targetPath, fs.constants.F_OK);
      } catch (verifyErr) {
        console.error(
          '[EA] Save Project: file missing after write',
          targetPath,
          verifyErr,
        );
        return {
          ok: false,
          error: `Save failed: file not found at ${targetPath}`,
        };
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

ipcMain.handle('ea:listManagedRepositories', async () => {
  try {
    const root = await ensureManagedRepoRoot();
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const _repoId = sanitizeRepoId(entry.name);
      const repoDir = path.join(root, entry.name);
      const meta = await readJsonIfExists(path.join(repoDir, 'meta.json'));
      if (meta?.id && meta?.name) {
        items.push({
          id: String(meta.id),
          name: String(meta.name),
          description: meta.description ? String(meta.description) : undefined,
          createdAt: meta.createdAt ?? null,
          updatedAt: meta.updatedAt ?? null,
          lastOpenedAt: meta.lastOpenedAt ?? null,
        });
      }
    }
    items.sort((a, b) =>
      String(b.lastOpenedAt || b.updatedAt || '').localeCompare(
        String(a.lastOpenedAt || a.updatedAt || ''),
      ),
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to list repositories.' };
  }
});

ipcMain.handle('ea:loadManagedRepository', async (_event, args) => {
  try {
    const repoId = sanitizeRepoId(args?.repositoryId);
    const repoDir = repoDirForId(repoId);
    const content = await fs.promises.readFile(
      path.join(repoDir, 'repository.json'),
      'utf8',
    );
    const existingMeta = await readJsonIfExists(
      path.join(repoDir, 'meta.json'),
    );
    const nextMeta = {
      ...(existingMeta || {}),
      id: repoId,
      lastOpenedAt: new Date().toISOString(),
    };
    await writeJson(path.join(repoDir, 'meta.json'), nextMeta);
    return { ok: true, repositoryId: repoId, content };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to load repository.' };
  }
});

ipcMain.handle('ea:saveManagedRepository', async (_event, args) => {
  try {
    const payload = args?.payload ?? null;
    if (!payload) return { ok: false, error: 'Missing payload.' };

    const existingId =
      typeof args?.repositoryId === 'string' ? args.repositoryId : '';
    const repoId = sanitizeRepoId(
      existingId ||
        (typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : crypto.randomBytes(16).toString('hex')),
    );
    const root = await ensureManagedRepoRoot();
    const repoDir = path.join(root, repoId);
    await fs.promises.mkdir(repoDir, { recursive: true });

    const metaPath = path.join(repoDir, 'meta.json');
    const existingMeta = await readJsonIfExists(metaPath);
    const meta = buildMetaRecord(repoId, payload, existingMeta);

    await writeJson(path.join(repoDir, 'repository.json'), payload);
    await writeJson(metaPath, meta);

    return { ok: true, repositoryId: repoId, name: meta.name };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to save repository.' };
  }
});

ipcMain.handle('ea:openProject', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: 'Open EA Repository',
      properties: ['openFile'],
      filters: [{ name: 'EA Repository', extensions: ['eapkg', 'zip'] }],
    });
    if (res.canceled || !res.filePaths.length)
      return { ok: true, canceled: true };

    const filePath = res.filePaths[0];
    const content = await fs.promises.readFile(filePath);

    // Validate ZIP header (PK\x03\x04)
    if (
      content.length < 4 ||
      content[0] !== 0x50 ||
      content[1] !== 0x4b ||
      content[2] !== 0x03 ||
      content[3] !== 0x04
    ) {
      return {
        ok: false,
        error:
          'The selected file is not a valid repository archive (invalid ZIP header).',
      };
    }

    const name = path.basename(filePath);
    const base64 = content.toString('base64');
    return { ok: true, name, content: base64, format: 'eapkg' };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Failed to open repository file.',
    };
  }
});

ipcMain.handle('ea:openProjectAtPath', async (_event, args) => {
  try {
    const filePath = typeof args?.filePath === 'string' ? args.filePath : '';
    if (!filePath) return { ok: false, error: 'Missing file path.' };

    const content = await fs.promises.readFile(filePath);

    if (
      content.length < 4 ||
      content[0] !== 0x50 ||
      content[1] !== 0x4b ||
      content[2] !== 0x03 ||
      content[3] !== 0x04
    ) {
      return {
        ok: false,
        error:
          'The selected file is not a valid repository archive (invalid ZIP header).',
      };
    }

    const name = path.basename(filePath);
    const base64 = content.toString('base64');
    return { ok: true, name, content: base64, format: 'eapkg' };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Failed to open repository at path.',
    };
  }
});

ipcMain.handle('ea:importLegacyProjectAtPath', async (_event, args) => {
  try {
    const filePath = typeof args?.filePath === 'string' ? args.filePath : '';
    if (!filePath)
      return { ok: false, error: 'Missing legacy project location.' };
    const content = await fs.promises.readFile(filePath, 'utf8');
    const name = path.basename(filePath);
    return { ok: true, name, content };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Failed to import legacy project.',
    };
  }
});

ipcMain.handle('ea:consumePendingRepositoryImports', async () => {
  const items = pendingRepositoryImports.splice(
    0,
    pendingRepositoryImports.length,
  );
  return { ok: true, items };
});

ipcMain.handle('ea:exportRepository', async (_event, args) => {
  try {
    const bytes = args?.bytes ?? null;
    if (!bytes) return { ok: false, error: 'Missing repository bytes.' };

    const suggestedName =
      typeof args?.suggestedName === 'string'
        ? args.suggestedName
        : 'ea-repository.eapkg';
    const res = await dialog.showSaveDialog({
      title: 'Save As',
      defaultPath: suggestedName,
      filters: [
        { name: 'EA Repository Package', extensions: ['eapkg'] },
        { name: 'ZIP Archive', extensions: ['zip'] },
      ],
    });

    if (res.canceled || !res.filePath) return { ok: true, canceled: true };
    const targetPath = res.filePath;

    const toBuffer = (value) => {
      if (Buffer.isBuffer(value)) return value;
      if (value instanceof Uint8Array) return Buffer.from(value);
      if (value instanceof ArrayBuffer)
        return Buffer.from(new Uint8Array(value));
      if (ArrayBuffer.isView(value))
        return Buffer.from(
          new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
        );
      if (Array.isArray(value)) return Buffer.from(value);
      if (
        value &&
        typeof value === 'object' &&
        typeof value.length === 'number'
      ) {
        return Buffer.from(
          Array.from({ length: value.length }, (_, i) => value[i]),
        );
      }
      if (
        value &&
        typeof value === 'object' &&
        value.buffer instanceof ArrayBuffer
      ) {
        return Buffer.from(
          new Uint8Array(
            value.buffer,
            value.byteOffset || 0,
            value.byteLength || value.length || 0,
          ),
        );
      }
      return Buffer.from([]);
    };

    const buffer = toBuffer(bytes);

    // Verify the output is a proper ZIP before writing
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      console.error(
        '[EA] Export: invalid ZIP header. First 8 bytes:',
        buffer.slice(0, 8).toString('hex'),
        'length:',
        buffer.length,
      );
      return {
        ok: false,
        error:
          'Exported data is not a valid ZIP archive. The file may be corrupted.',
      };
    }

    await fs.promises.writeFile(targetPath, buffer);
    console.log(
      '[EA] Exported repository:',
      targetPath,
      'size:',
      buffer.length,
      'bytes',
    );
    return { ok: true, filePath: targetPath };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to save repository.' };
  }
});

ipcMain.handle('ea:pickProjectFolder', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: 'Select Project Folder',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (res.canceled || !res.filePaths?.length)
      return { ok: true, canceled: true };
    return { ok: true, folderPath: res.filePaths[0] };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to select folder.' };
  }
});

ipcMain.handle('ea:openDevTools', async () => {
  try {
    if (!mainWindow || mainWindow.isDestroyed())
      return { ok: false, error: 'No active window.' };
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to open dev tools.' };
  }
});

app.whenReady().then(() => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  // Register .eapkg/.eaproj file types in Windows registry (icons + open-with)
  registerEaFileTypes();

  // Windows/Linux: handle .eapkg file passed as CLI argument on initial launch.
  // When the OS opens a file with the associated app it passes the path as argv.
  if (process.platform !== 'darwin') {
    const argv = process.argv.slice(1); // skip the executable itself
    const candidates = argv.filter(
      (arg) =>
        typeof arg === 'string' &&
        (arg.toLowerCase().endsWith('.eapkg') ||
          arg.toLowerCase().endsWith('.zip')),
    );
    for (const p of candidates) {
      void enqueueRepositoryImport(p);
    }
  }

  // macOS: handle files opened before the app was ready (queued by the OS).
  // The 'open-file' event may fire before 'ready', so also hook it early below.

  app.on('second-instance', (_event, argv) => {
    const candidates = (argv || []).filter(
      (arg) =>
        typeof arg === 'string' &&
        (arg.toLowerCase().endsWith('.eapkg') ||
          arg.toLowerCase().endsWith('.zip')),
    );
    for (const p of candidates) {
      void enqueueRepositoryImport(p);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    void enqueueRepositoryImport(filePath);
  });

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
