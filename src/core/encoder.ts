/**
 * Encodeur KYcode v0 : identifiant → valeur (sombre/clair) de chacune des N² cellules.
 */
import { buildLayout, DATA_CELLS, type FunctionCell } from './geometry';
import { buildPayload, parsePayload } from './payload';
import { rsDecode, rsEncode } from './reedsolomon';

export const DATA_BYTES = 7;
export const EC_BYTES = 23;

export const LAYOUT: readonly FunctionCell[] = buildLayout();
/** Rangs canoniques des cellules de données, dans l'ordre de placement. */
export const DATA_CELL_INDICES: readonly number[] = LAYOUT.flatMap((c, i) => (c.zone === 'data' ? [i] : []));

/** Suite de blanchiment W[0…239] (spec §5.5). */
export const WHITENING: readonly number[] = (() => {
  const w: number[] = [];
  let s = 0xace1;
  for (let i = 0; i < DATA_CELLS; i++) {
    w.push(s & 1);
    const t = (s ^ (s >> 2) ^ (s >> 3) ^ (s >> 5)) & 1;
    s = (s >> 1) | (t << 15);
  }
  return w;
})();

/** Matrice KYcode : true = cellule sombre, indexée dans l'ordre canonique. */
export type KYMatrix = boolean[];

export function encode(id: string): KYMatrix {
  const codeword = rsEncode(buildPayload(id), EC_BYTES);
  const cells: KYMatrix = LAYOUT.map((c) => c.dark === true);
  DATA_CELL_INDICES.forEach((cellIdx, i) => {
    const bit = (codeword[i >> 3]! >> (7 - (i & 7))) & 1;
    cells[cellIdx] = (bit ^ WHITENING[i]!) === 1;
  });
  return cells;
}

/** Effacements maximum : au-delà, le risque de faux décodage cesse d'être négligeable (spec §7). */
export const MAX_ERASURES = 16;

/**
 * Bits de données lus (ordre de placement, sombre = true) → identifiant, ou null.
 * `margins` (optionnel, même ordre) : écart de chaque lecture au seuil ; les octets aux marges les plus
 * faibles sont alors déclarés effacés par paliers si le décodage simple échoue.
 */
export function decodeDataBits(
  bits: readonly boolean[],
  margins?: readonly number[],
): { id: string; corrected: number; erasures: number } | null {
  const codeword = new Uint8Array(DATA_BYTES + EC_BYTES);
  for (let i = 0; i < DATA_CELLS; i++) {
    if ((bits[i] ? 1 : 0) ^ WHITENING[i]!) codeword[i >> 3] = codeword[i >> 3]! | (1 << (7 - (i & 7)));
  }
  const byConfidence = margins
    ? Array.from({ length: DATA_BYTES + EC_BYTES }, (_, b) => ({ b, m: Math.min(...margins.slice(b * 8, b * 8 + 8)) }))
        .sort((x, y) => x.m - y.m)
        .map((x) => x.b)
    : [];
  const levels = margins ? [0, 2, 4, 6, 8, 10, 12, 14, MAX_ERASURES] : [0];
  for (const k of levels) {
    const erasures = byConfidence.slice(0, k);
    const rs = rsDecode(codeword, EC_BYTES, erasures);
    if (!rs) continue;
    const id = parsePayload(rs.data);
    if (id) return { id, corrected: rs.corrected, erasures: k };
  }
  return null;
}
