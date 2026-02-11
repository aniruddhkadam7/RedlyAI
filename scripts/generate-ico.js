/**
 * Generate Windows .ico files and app icon PNGs using sharp for resizing.
 *
 * Produces a multi-size ICO (16, 32, 48, 64, 128, 256) for the app icon
 * and a single-image ICO for the .eapkg file-type icon.
 *
 * Requires:  npm install --save-dev sharp
 *
 * Usage:  node scripts/generate-ico.js
 * Output: build/icons/app.ico, app.png, eapkg.ico, eapkg.png
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
let png2icons = null;

try {
  // Optional dependency for cross-platform ICNS generation.
  // Install with: npm i -D png2icons
  png2icons = require('png2icons');
} catch {
  png2icons = null;
}

const ROOT = path.resolve(__dirname, '..');

// Source images
const APP_SRC = path.join(ROOT, 'build', 'icons', 'app.png');
const EAPKG_SRC = path.join(ROOT, 'build', 'icons', 'eapkg.png');
const EAPKG_ICON_SRC = path.join(ROOT, 'build', 'icons', 'eapkg-icon.png');

const OUT_DIR = path.join(ROOT, 'build', 'icons');

// ICO sizes for application icon (standard Windows multi-size)
const APP_ICO_SIZES = [16, 32, 48, 64, 128, 256];

/* ------------------------------------------------------------------ */
/*  ICO builder                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build an ICO buffer from an array of PNG buffers.
 * Each PNG must already be resized to the target dimension.
 */
function buildIco(pngBuffers, sizes) {
  const imageCount = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataStart = headerSize + entrySize * imageCount;

  let totalDataSize = 0;
  for (const buf of pngBuffers) totalDataSize += buf.length;
  const totalSize = dataStart + totalDataSize;

  const ico = Buffer.alloc(totalSize);
  let offset = 0;

  // ICONDIR
  ico.writeUInt16LE(0, offset);
  offset += 2; // reserved
  ico.writeUInt16LE(1, offset);
  offset += 2; // type: 1 = ICO
  ico.writeUInt16LE(imageCount, offset);
  offset += 2; // image count

  // Write ICONDIRENTRY for each image, then copy PNG data
  let dataOffset = dataStart;
  for (let i = 0; i < imageCount; i++) {
    const png = pngBuffers[i];
    const s = sizes[i];
    const icoSize = s >= 256 ? 0 : s; // 0 means 256+

    ico.writeUInt8(icoSize, offset);
    offset += 1; // width
    ico.writeUInt8(icoSize, offset);
    offset += 1; // height
    ico.writeUInt8(0, offset);
    offset += 1; // color palette
    ico.writeUInt8(0, offset);
    offset += 1; // reserved
    ico.writeUInt16LE(1, offset);
    offset += 2; // color planes
    ico.writeUInt16LE(32, offset);
    offset += 2; // bits per pixel
    ico.writeUInt32LE(png.length, offset);
    offset += 4; // image data size
    ico.writeUInt32LE(dataOffset, offset);
    offset += 4; // offset to data

    png.copy(ico, dataOffset);
    dataOffset += png.length;
  }

  return ico;
}

/**
 * Build a single-image ICO from a raw PNG buffer (no resizing).
 */
function singlePngToIco(pngBuffer) {
  const w = pngBuffer.readUInt32BE(16);
  return buildIco([pngBuffer], [Math.min(w, 256)]);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── 1. App icon (multi-size ICO) ──────────────────────────────────
  if (!fs.existsSync(APP_SRC)) {
    console.error('ERROR: app.png not found at', APP_SRC);
    process.exit(1);
  }

  console.log('Generating multi-size app icon…');
  const resizedPngs = [];
  for (const size of APP_ICO_SIZES) {
    const buf = await sharp(APP_SRC)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    resizedPngs.push(buf);
  }

  const appIco = buildIco(resizedPngs, APP_ICO_SIZES);
  fs.writeFileSync(path.join(OUT_DIR, 'app.ico'), appIco);

  // 256px PNG for electron-builder / Linux
  const png256 = await sharp(APP_SRC)
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, 'app-256.png'), png256);

  // 512px PNG for macOS / high-res
  const png512 = await sharp(APP_SRC)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png512);

  // Legacy alias
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), appIco);

  // ── 2. .eapkg file-type icon (single-image ICO) ──────────────────
  if (!fs.existsSync(EAPKG_SRC)) {
    const fallback = path.join(ROOT, 'code-file_16591933.png');
    if (fs.existsSync(fallback)) {
      fs.copyFileSync(fallback, EAPKG_SRC);
    } else {
      console.error('ERROR: eapkg.png not found at', EAPKG_SRC);
      console.error(
        'Place code-file_16591933.png at project root or build/icons/eapkg.png',
      );
      process.exit(1);
    }
  }

  const eapkgPng = fs.readFileSync(EAPKG_SRC);
  const eapkgIco = singlePngToIco(eapkgPng);
  fs.writeFileSync(path.join(OUT_DIR, 'eapkg.ico'), eapkgIco);
  fs.copyFileSync(EAPKG_SRC, path.join(OUT_DIR, 'eapkg.png'));

  // ── 2b. .eapkg file-type icon — multi-size ICO from eapkg-icon.png ─
  if (fs.existsSync(EAPKG_ICON_SRC)) {
    console.log('Generating multi-size eapkg-icon…');
    const eapkgIconPngs = [];
    for (const size of APP_ICO_SIZES) {
      const buf = await sharp(EAPKG_ICON_SRC)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      eapkgIconPngs.push(buf);
    }
    const eapkgIconIco = buildIco(eapkgIconPngs, APP_ICO_SIZES);
    fs.writeFileSync(path.join(OUT_DIR, 'eapkg-icon.ico'), eapkgIconIco);
  } else {
    console.warn(
      'eapkg-icon.png not found – skipping eapkg-icon.ico generation',
    );
  }

  // ── 3. ICNS generation (cross-platform via png2icons) ───────────
  if (png2icons) {
    try {
      const appIcns = png2icons.createICNS(png512, png2icons.BICUBIC, 0);
      if (appIcns) {
        fs.writeFileSync(path.join(OUT_DIR, 'app.icns'), appIcns);
      }

      const eapkgIcns = png2icons.createICNS(eapkgPng, png2icons.BICUBIC, 0);
      if (eapkgIcns) {
        fs.writeFileSync(path.join(OUT_DIR, 'eapkg.icns'), eapkgIcns);
      }

      if (fs.existsSync(EAPKG_ICON_SRC)) {
        const eapkgIconPngBuf = fs.readFileSync(EAPKG_ICON_SRC);
        const eapkgIconIcns = png2icons.createICNS(
          eapkgIconPngBuf,
          png2icons.BICUBIC,
          0,
        );
        if (eapkgIconIcns) {
          fs.writeFileSync(
            path.join(OUT_DIR, 'eapkg-icon.icns'),
            eapkgIconIcns,
          );
        }
      }
    } catch (err) {
      console.warn('ICNS generation failed:', err.message);
    }
  } else {
    console.warn('png2icons not installed. Skipping ICNS generation.');
  }

  console.log('Generated:');
  console.log(
    `  build/icons/app.ico         (multi-size: ${APP_ICO_SIZES.join(',')})`,
  );
  console.log('  build/icons/app-256.png     (256px app icon)');
  console.log('  build/icons/icon.ico        (legacy alias → app.ico)');
  console.log('  build/icons/icon.png        (512px app icon)');
  console.log('  build/icons/app.icns        (macOS app icon)');
  console.log('  build/icons/eapkg.ico       (.eapkg file icon)');
  console.log('  build/icons/eapkg.png');
  console.log('  build/icons/eapkg.icns');
  console.log(
    `  build/icons/eapkg-icon.ico  (multi-size: ${APP_ICO_SIZES.join(',')})`,
  );
  console.log('  build/icons/eapkg-icon.icns');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
