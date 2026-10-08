import { describe, expect, it } from 'vitest';
import { DATA_CELL_INDICES, decodeDataBits, encode, WHITENING } from '../src/core/encoder';
import { buildPayload, idToNumber, numberToId, parsePayload, randomId } from '../src/core/payload';
import { rsDecode, rsEncode } from '../src/core/reedsolomon';
import { prng } from '../src/render/raster';

describe('Reed-Solomon', () => {
  const rnd = prng(7);
  const randomBytes = (n: number) => Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));

  it('produit un mot de code de syndromes nuls', () => {
    const data = randomBytes(7);
    const cw = rsEncode(data, 23);
    expect(cw.slice(0, 7)).toEqual(data);
    expect(rsDecode(cw, 23)).toEqual({ data, corrected: 0 });
  });

  it('corrige jusqu’à 11 octets erronés', () => {
    for (let trial = 0; trial < 300; trial++) {
      const data = randomBytes(7);
      const cw = rsEncode(data, 23);
      const errors = 1 + (trial % 11);
      const positions = new Set<number>();
      while (positions.size < errors) positions.add(Math.floor(rnd() * 30));
      for (const p of positions) cw[p] = cw[p]! ^ (1 + Math.floor(rnd() * 255));
      const res = rsDecode(cw, 23);
      expect(res?.data).toEqual(data);
      expect(res?.corrected).toBe(errors);
    }
  });

  it('ne renvoie jamais de données fausses au-delà de la capacité', () => {
    let wrong = 0;
    for (let trial = 0; trial < 300; trial++) {
      const data = randomBytes(7);
      const cw = rsEncode(data, 23);
      const positions = new Set<number>();
      while (positions.size < 14) positions.add(Math.floor(rnd() * 30));
      for (const p of positions) cw[p] = cw[p]! ^ (1 + Math.floor(rnd() * 255));
      const res = rsDecode(cw, 23);
      if (res && res.data.some((b, i) => b !== data[i])) wrong++;
    }
    expect(wrong).toBe(0);
  });
});

const idRnd = prng(99);

describe('charge utile', () => {
  it('convertit identifiant ↔ nombre', () => {
    expect(numberToId(0)).toBe('00000000');
    expect(numberToId(62 ** 8 - 1)).toBe('zzzzzzzz');
    expect(idToNumber('K7f3Qx2a')).toBe(idToNumber(numberToId(idToNumber('K7f3Qx2a'))));
    for (let i = 0; i < 50; i++) {
      const id = randomId(idRnd);
      expect(parsePayload(buildPayload(id))).toBe(id);
    }
  });

  it('rejette les identifiants mal formés et les en-têtes inconnus', () => {
    expect(() => idToNumber('abc')).toThrow();
    expect(() => idToNumber('abcdefg!')).toThrow();
    const p = buildPayload('K7f3Qx2a');
    p[0] = 0x20;
    expect(parsePayload(p)).toBeNull();
  });
});

describe('encodeur', () => {
  it('a une suite de blanchiment équilibrée', () => {
    const ones = WHITENING.reduce((a, b) => a + b, 0);
    expect(ones).toBeGreaterThan(90);
    expect(ones).toBeLessThan(150);
  });

  it('fait l’aller-retour matrice → identifiant', () => {
    for (let i = 0; i < 50; i++) {
      const id = randomId(idRnd);
      const cells = encode(id);
      expect(decodeDataBits(DATA_CELL_INDICES.map((idx) => cells[idx]!))).toEqual({ id, corrected: 0, erasures: 0 });
    }
  });

  it('produit des matrices différentes pour des identifiants voisins', () => {
    const a = encode('00000001');
    const b = encode('00000002');
    expect(a.filter((v, i) => v !== b[i]).length).toBeGreaterThan(40);
  });
});

describe('Reed-Solomon avec effacements', () => {
  const rnd = prng(17);
  const randomBytes = (n: number) => Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));

  it('corrige 2 × erreurs + effacements ≤ 23', () => {
    for (let trial = 0; trial < 400; trial++) {
      const data = randomBytes(7);
      const cw = rsEncode(data, 23);
      const erasures = trial % 24;
      const errors = Math.floor((23 - erasures) / 2);
      const pos = new Set<number>();
      while (pos.size < erasures + errors) pos.add(Math.floor(rnd() * 30));
      const list = [...pos];
      for (const p of list) cw[p] = cw[p]! ^ (1 + Math.floor(rnd() * 255));
      const erased = list.slice(0, erasures);
      expect(rsDecode(cw, 23, erased)?.data, `${erasures} eff. + ${errors} err.`).toEqual(data);
    }
  });
});
