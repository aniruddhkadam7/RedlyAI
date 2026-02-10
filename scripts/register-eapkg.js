/**
 * Register .eapkg file extension in Windows Registry (HKCU — no admin required).
 * Sets the file icon and open-with command for development mode.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

if (process.platform !== 'win32') {
  console.log('Skipping — not Windows');
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, '..');
const icoPath = path.join(projectRoot, 'build', 'icons', 'eapkg-icon.ico');

if (!fs.existsSync(icoPath)) {
  console.error('ICO not found at:', icoPath);
  console.error('Run "node scripts/generate-ico.js" first.');
  process.exit(1);
}

console.log('ICO path:', icoPath);

// Electron in dev mode
const electronExe = path.join(
  projectRoot,
  'node_modules',
  'electron',
  'dist',
  'electron.exe',
);
const mainJs = path.join(projectRoot, 'electron', 'main.js');
const openCommand = `"${electronExe}" "${mainJs}" "%1"`;

function regAdd(key, data) {
  const cmd = `reg add "${key}" /ve /t REG_SZ /d "${data}" /f`;
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit' });
}

// 1. .eapkg extension → RedlyAI.EAPkg
regAdd('HKCU\\Software\\Classes\\.eapkg', 'RedlyAI.EAPkg');

// 2. Friendly type name
regAdd('HKCU\\Software\\Classes\\RedlyAI.EAPkg', 'EA Repository Package');

// 3. Default icon
regAdd('HKCU\\Software\\Classes\\RedlyAI.EAPkg\\DefaultIcon', icoPath);

// 4. Open command
regAdd(
  'HKCU\\Software\\Classes\\RedlyAI.EAPkg\\shell\\open\\command',
  openCommand,
);

// 5. Notify Explorer to refresh icons
try {
  execSync(
    'powershell -NoProfile -Command "Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public class SN { [DllImport(\\"shell32.dll\\")] public static extern void SHChangeNotify(int w, uint u, IntPtr d1, IntPtr d2); }\' -Language CSharp; [SN]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)"',
    { stdio: 'inherit' },
  );
  console.log('Explorer notified of file association change.');
} catch {
  console.log(
    'Could not notify Explorer — you may need to restart Explorer or sign out/in.',
  );
}

console.log('\nDone! .eapkg files should now show the RedlyAI icon.');
console.log('If the icon does not appear immediately, try:');
console.log('  1. Right-click desktop → Refresh');
console.log('  2. Or restart Windows Explorer');
