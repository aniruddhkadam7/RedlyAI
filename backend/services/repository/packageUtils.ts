import { strToU8 } from 'fflate';

/**
 * Recursively sort all object keys so that `JSON.stringify` produces
 * deterministic output suitable for checksumming.  Primitives, arrays
 * and `null` pass through unchanged.
 */
const deepSortKeys = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = deepSortKeys(obj[key]);
    }
    return sorted;
  }
  return value;
};

/**
 * Serialise any value to a UTF-8 `Uint8Array` containing valid JSON.
 *
 * - Uses `JSON.stringify` exclusively — never builds JSON by hand —
 *   so all special characters (newlines, tabs, backslashes, quotes, etc.)
 *   are escaped correctly.
 * - Object keys are sorted for deterministic checksums.
 * - A round-trip `JSON.parse` validation is performed before encoding,
 *   ensuring the archive will never contain corrupt JSON.
 */
export const jsonToBytes = (value: unknown): Uint8Array => {
  const sorted = deepSortKeys(value);
  const json = JSON.stringify(sorted);

  // Round-trip validation: catch any corruption before it reaches the archive.
  JSON.parse(json);

  return strToU8(json, true);
};

export const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return toHex(digest);
  }
  return '';
};

/**
 * Verify the output begins with the ZIP local file header (PK\x03\x04).
 * Throws if the bytes are not a valid ZIP archive.
 */
export const verifyZipHeader = (bytes: Uint8Array): void => {
  if (
    !bytes ||
    bytes.length < 4 ||
    bytes[0] !== 0x50 || // P
    bytes[1] !== 0x4b || // K
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    throw new Error(
      'Export produced invalid ZIP: missing PK header. ' +
        `Got bytes [${bytes?.[0]}, ${bytes?.[1]}, ${bytes?.[2]}, ${bytes?.[3]}] (expected [80, 75, 3, 4]).`,
    );
  }
};
