import { describe, expect, it } from 'vitest';
import { DATA_CELL_INDICES, encode, LAYOUT } from '../src/core/encoder';
import { randomId } from '../src/core/payload';
import { decode } from '../src/decoder/decode';
import { createGray } from '../src/decoder/image';
import { prng } from '../src/render/raster';
import { scene, type SceneSpec } from './helpers/scene';

const ID = 'K7f3Qx2a';
const expectDecodes = (spec: SceneSpec, id = ID) => {
  const res = decode(scene(id, spec).image);
  expect(res?.id, JSON.stringify(spec)).toBe(id);
  return res!;
};

describe('décodeur — cas nominaux', () => {
  it('décode 30 identifiants aléatoires', () => {
    const rnd = prng(2026);
    for (let i = 0; i < 30; i++) expectDecodes({ cellPx: 6 + (i % 6) }, randomId(rnd));
  });

  it('retrouve l’orientation quelle que soit la rotation', () => {
    for (let angle = 0; angle < 360; angle += 15) {
      const res = expectDecodes({ angle });
      expect(res.corrected).toBe(0);
    }
  });

  it('décode un symbole décentré et petit dans une grande image', () => {
    expectDecodes({ cellPx: 5, width: 640, height: 480, offset: [-180, 120] });
  });

  it('renvoie la position des repères dans l’image', () => {
    const res = expectDecodes({ cellPx: 10 });
    const [A, G, B] = res.finders;
    expect(A[1]).toBeLessThan(G[1]);
    expect(G[0]).toBeLessThan(B[0]);
    expect(res.alignment).not.toBeNull();
  });
});

describe('décodeur — dégradations', () => {
  it('résiste à la perspective', () => {
    for (const keystone of [0.15, 0.3, 0.4]) for (const angle of [0, 70, 200]) expectDecodes({ keystone, angle });
  });

  it('résiste au flou', () => {
    expectDecodes({ cellPx: 10, blur: 1 });
    expectDecodes({ cellPx: 12, blur: 2 });
  });

  it('résiste au bruit', () => {
    expectDecodes({ noise: 25, seed: 3 });
    expectDecodes({ noise: 40, blur: 1, seed: 4 });
  });

  it('résiste au faible contraste et à un éclairage inégal', () => {
    expectDecodes({ dark: 110, light: 170, noise: 8 });
    expectDecodes({ gradient: 0.6, noise: 8 });
  });

  it('corrige des cellules de données abîmées', () => {
    const rnd = prng(5);
    const cells = encode(ID);
    // 10 cellules isolées inversées, chacune dans un octet différent.
    const bytes = new Set<number>();
    while (bytes.size < 10) bytes.add(Math.floor(rnd() * 30));
    for (const b of bytes) {
      const idx = DATA_CELL_INDICES[b * 8 + Math.floor(rnd() * 8)]!;
      cells[idx] = !cells[idx];
    }
    const res = decode(scene(ID, {}, cells).image);
    expect(res?.id).toBe(ID);
    expect(res?.corrected).toBe(10);
  });

  it('corrige une tache qui recouvre une zone de données', () => {
    const cells = encode(ID);
    // 60 cellules de données consécutives forcées en sombre (≈ 7–8 octets).
    for (const idx of DATA_CELL_INDICES.slice(100, 160)) cells[idx] = true;
    expect(decode(scene(ID, {}, cells).image)?.id).toBe(ID);
  });
});

describe('décodeur — rejets', () => {
  it('ne trouve rien dans une image vide ou du bruit', () => {
    expect(decode(createGray(300, 300))).toBeNull();
    const rnd = prng(9);
    const noise = createGray(300, 300);
    noise.data.forEach((_, i) => (noise.data[i] = rnd() * 255));
    expect(decode(noise)).toBeNull();
  });

  it('rejette des données trop abîmées plutôt que de renvoyer un faux identifiant', () => {
    const rnd = prng(11);
    let falsePositives = 0;
    for (let t = 0; t < 20; t++) {
      const cells = encode(ID);
      for (const idx of DATA_CELL_INDICES) if (rnd() < 0.3) cells[idx] = !cells[idx];
      const res = decode(scene(ID, {}, cells).image);
      if (res && res.id !== ID) falsePositives++;
    }
    expect(falsePositives).toBe(0);
  });

  it('ne lit pas un symbole en miroir (non pris en charge en v0)', () => {
    const cells = encode(ID);
    const mirrored = cells.slice();
    LAYOUT.forEach((cell, i) => {
      // Miroir gauche-droite : (r, c) → (r, 2r − c).
      mirrored[cell.r * cell.r + (2 * cell.r - cell.c)] = cells[i]!;
    });
    const res = decode(scene(ID, {}, mirrored).image);
    expect(res === null || res.id !== ID).toBe(true);
    expect(res).toBeNull();
  });
});
