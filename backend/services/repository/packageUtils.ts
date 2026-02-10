import { strToU8 } from 'fflate';

const stableStringify = (value: unknown): string => {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'bigint') return JSON.stringify(value.toString());
  if (t === 'function' || t === 'symbol') return JSON.stringify(String(value));
  if (t === 'number' || t === 'boolean') return String(value);
  if (t === 'undefined') return 'null';
  if (t !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`;
};

export const jsonToBytes = (value: unknown): Uint8Array =>
  strToU8(stableStringify(value), true);

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
