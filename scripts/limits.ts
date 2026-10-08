/**
 * Mesure les limites du décodeur sur scènes synthétiques : taux de réussite par niveau de dégradation.
 * Usage : npm run limits
 */
import { randomId } from '../src/core/payload';
import { decode } from '../src/decoder/decode';
import { prng } from '../src/render/raster';
import { scene, type SceneSpec } from '../tests/helpers/scene';

const TRIALS = 12;
const rnd = prng(31);
const ids = Array.from({ length: TRIALS }, () => randomId(rnd));

function rate(spec: (i: number) => SceneSpec): string {
  let ok = 0;
  ids.forEach((id, i) => {
    if (decode(scene(id, spec(i)).image)?.id === id) ok++;
  });
  return `${Math.round((100 * ok) / TRIALS)} %`.padStart(6);
}

const sweeps: [string, number[], (v: number, i: number) => SceneSpec][] = [
  ['Taille de cellule (px)', [2, 2.5, 3, 3.5, 4, 5, 6], (v, i) => ({ cellPx: v, angle: i * 29 })],
  ['Flou (rayon px, cellule 8 px)', [0, 1, 2, 3, 4], (v, i) => ({ cellPx: 8, blur: v, angle: i * 29 })],
  ['Bruit (écart-type)', [10, 20, 30, 40, 50, 60], (v, i) => ({ noise: v, seed: i + 1, angle: i * 29 })],
  ['Perspective (trapèze)', [0.2, 0.3, 0.4, 0.5, 0.6], (v, i) => ({ keystone: v, angle: i * 29 })],
  ['Contraste (écart clair-sombre)', [100, 60, 40, 30, 20], (v, i) => ({ dark: 140 - v / 2, light: 140 + v / 2, noise: 4, seed: i + 1, angle: i * 29 })],
];

for (const [label, values, spec] of sweeps) {
  console.log(`\n${label}`);
  for (const v of values) console.log(`  ${String(v).padStart(5)}  →  ${rate((i) => spec(v, i))}`);
}
