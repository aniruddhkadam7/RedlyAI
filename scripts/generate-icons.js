/**
 * Icon generation helper for electron-builder file associations.
 *
 * Generates:
 *   build/icons/icon.ico        — 256×256 multi-size ICO (Windows app icon)
 *   build/icons/icon.icns       — 512×512 ICNS (macOS app icon)
 *   build/icons/icon.png        — 512×512 PNG fallback (Linux)
 *   build/icons/eapkg-icon.ico  — Document type icon (Windows .eapkg association)
 *   build/icons/eapkg-icon.icns — Document type icon (macOS .eapkg association)
 *
 * Prerequisites:
 *   - Requires `png-to-ico` package: npm i -D png-to-ico
 *   - For .icns on macOS: uses built-in `iconutil` (no extra deps)
 *   - For .icns on Windows/Linux: install `png2icns` or skip (builder can use .ico fallback)
 *
 * Usage:
 *   node scripts/generate-icons.js
 *
 * If png-to-ico is not installed this script copies the 512px PNG as a fallback
 * and prints instructions.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC_512 = path.join(ROOT, 'public', 'icons', 'icon-512x512.png');
const OUT_DIR = path.join(ROOT, 'build', 'icons');

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- PNG copy (always works) ---
fs.copyFileSync(SRC_512, path.join(OUT_DIR, 'icon.png'));
fs.copyFileSync(SRC_512, path.join(OUT_DIR, 'eapkg-icon.png'));
console.log('✓ Copied icon.png and eapkg-icon.png');

// --- ICO generation ---
try {
  const pngToIco = require('png-to-ico');
  const icoBuf = pngToIco([SRC_512]);
  if (icoBuf instanceof Promise) {
    icoBuf.then((buf) => {
      fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), buf);
      fs.writeFileSync(path.join(OUT_DIR, 'eapkg-icon.ico'), buf);
      console.log('✓ Generated icon.ico and eapkg-icon.ico');
    });
  } else {
    fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), icoBuf);
    fs.writeFileSync(path.join(OUT_DIR, 'eapkg-icon.ico'), icoBuf);
    console.log('✓ Generated icon.ico and eapkg-icon.ico');
  }
} catch {
  console.warn('⚠ png-to-ico not installed. Run: npm i -D png-to-ico');
  console.warn(
    '  Falling back to PNG-only icons (electron-builder will still work).',
  );
}

// --- ICNS generation (macOS only via iconutil) ---
if (process.platform === 'darwin') {
  try {
    const iconset = path.join(OUT_DIR, 'icon.iconset');
    fs.mkdirSync(iconset, { recursive: true });
    const sizes = [16, 32, 64, 128, 256, 512];
    // sips is available on macOS
    for (const s of sizes) {
      execSync(
        `sips -z ${s} ${s} "${SRC_512}" --out "${path.join(iconset, `icon_${s}x${s}.png`)}"`,
        { stdio: 'ignore' },
      );
      execSync(
        `sips -z ${s * 2} ${s * 2} "${SRC_512}" --out "${path.join(iconset, `icon_${s}x${s}@2x.png`)}"`,
        { stdio: 'ignore' },
      );
    }
    execSync(
      `iconutil -c icns "${iconset}" -o "${path.join(OUT_DIR, 'icon.icns')}"`,
      { stdio: 'ignore' },
    );
    fs.copyFileSync(
      path.join(OUT_DIR, 'icon.icns'),
      path.join(OUT_DIR, 'eapkg-icon.icns'),
    );
    fs.rmSync(iconset, { recursive: true, force: true });
    console.log('✓ Generated icon.icns and eapkg-icon.icns');
  } catch (e) {
    console.warn('⚠ ICNS generation failed:', e.message);
  }
} else {
  console.log(
    'ℹ ICNS generation skipped (not macOS). electron-builder will use PNG fallback.',
  );
}

console.log('\nDone. Icons written to build/icons/');
