/**
 * Génère des exemples dans docs/exemples : SVG de style et scènes dégradées (PNG) avec leur résultat de décodage.
 * Usage : npm run examples
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { encode } from '../src/core/encoder';
import { decode } from '../src/decoder/decode';
import { renderSvg } from '../src/render/svg';
import { scene, type SceneSpec } from '../tests/helpers/scene';
import { grayToPng } from './lib/png';

const ID = 'K7f3Qx2a';
const dir = 'docs/exemples';
mkdirSync(dir, { recursive: true });
const cells = encode(ID);

const styles = {
  noir: {},
  bleu: { foreground: '#1b4fa8' },
  points: { inset: 0.15 },
  vert: { foreground: '#1e7a46', inset: 0.08 },
};
for (const [name, opts] of Object.entries(styles)) writeFileSync(`${dir}/style-${name}.svg`, renderSvg(cells, { width: 400, ...opts }));

const scenes: Record<string, SceneSpec> = {
  'rotation-perspective': { cellPx: 9, angle: 23, keystone: 0.35 },
  'flou-bruit': { cellPx: 8, blur: 1, noise: 30, seed: 1 },
  'faible-contraste': { cellPx: 8, dark: 105, light: 165, gradient: 0.4, noise: 8, seed: 2 },
};
for (const [name, spec] of Object.entries(scenes)) {
  const { image } = scene(ID, spec);
  writeFileSync(`${dir}/scene-${name}.png`, grayToPng(image));
  const res = decode(image);
  console.log(`${name.padEnd(22)} → ${res ? `${res.id} (corrigés : ${res.corrected}, effacés : ${res.erasures})` : "NON DÉCODÉ"}`);
}
console.log(`Exemples écrits dans ${dir}/`);
