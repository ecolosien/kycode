/**
 * Charge utile KYcode v0 (spec §5.1–5.2) : en-tête + identifiant 48 bits, forme textuelle base 62.
 */

export const HEADER_V0 = 0x10;
export const ID_LENGTH = 8;
export const ID_MAX = 62 ** ID_LENGTH; // exclu
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function idToNumber(id: string): number {
  if (!new RegExp(`^[0-9A-Za-z]{${ID_LENGTH}}$`).test(id)) {
    throw new Error(`identifiant invalide « ${id} » : ${ID_LENGTH} caractères 0-9A-Za-z attendus`);
  }
  let n = 0;
  for (const ch of id) n = n * 62 + ALPHABET.indexOf(ch);
  return n;
}

export function numberToId(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0 || n >= ID_MAX) throw new Error(`valeur d'identifiant hors limites : ${n}`);
  let s = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    s = ALPHABET[n % 62] + s;
    n = Math.floor(n / 62);
  }
  return s;
}

/**
 * Identifiant aléatoire. Par défaut via crypto.getRandomValues (navigateur, Node ≥ 19) ;
 * `random` (valeurs dans [0, 1[) permet un tirage reproductible dans les tests.
 */
export function randomId(random?: () => number): string {
  if (random) return numberToId(Math.floor(random() * ID_MAX));
  const buf = new Uint32Array(2);
  globalThis.crypto.getRandomValues(buf);
  const n = (buf[0]! % 2 ** 16) * 2 ** 32 + buf[1]!;
  return numberToId(n % ID_MAX);
}

export function buildPayload(id: string): Uint8Array {
  let n = idToNumber(id);
  const out = new Uint8Array(7);
  out[0] = HEADER_V0;
  for (let i = 6; i >= 1; i--) {
    out[i] = n % 256;
    n = Math.floor(n / 256);
  }
  return out;
}

/** Renvoie l'identifiant, ou null si l'en-tête ou la valeur sont invalides. */
export function parsePayload(bytes: Uint8Array): string | null {
  if (bytes.length !== 7 || bytes[0] !== HEADER_V0) return null;
  let n = 0;
  for (let i = 1; i <= 6; i++) n = n * 256 + bytes[i]!;
  return n < ID_MAX ? numberToId(n) : null;
}
