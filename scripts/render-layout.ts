/**
 * Génère docs/layout-v0.svg (carte des zones) et docs/apercu-v0.svg (aperçu avec données aléatoires).
 * L'aperçu n'est PAS un encodage réel : il sert seulement à visualiser le rendu.
 */
import { writeFileSync } from 'node:fs';
import { buildLayout, cellVertices, N } from '../src/core/geometry';

const SCALE = 20;
const MARGIN = 2;
const H = (N * Math.sqrt(3)) / 2;
const width = (N + 2 * MARGIN) * SCALE;
const height = (H + 2 * MARGIN) * SCALE;

const pts = (r: number, c: number) =>
  cellVertices({ r, c })
    .map(([x, y]) => `${((x + MARGIN) * SCALE).toFixed(2)},${((y + MARGIN) * SCALE).toFixed(2)}`)
    .join(' ');

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" width="${width.toFixed(0)}" height="${height.toFixed(0)}">\n<rect width="100%" height="100%" fill="#fff"/>\n${body}</svg>\n`;

const layout = buildLayout();

const ZONE_COLORS = {
  finder: ['#1b2a6b', '#c9d3ff'],
  separator: ['#f2c94c', '#f2c94c'],
  align: ['#7b1fa2', '#e6c8f0'],
  data: ['#e8e8e8', '#e8e8e8'],
} as const;

const map = layout
  .map((cell) => {
    const [dark, light] = ZONE_COLORS[cell.zone];
    return `<polygon points="${pts(cell.r, cell.c)}" fill="${cell.dark === false ? light : dark}" stroke="#999" stroke-width="0.5"/>`;
  })
  .join('\n');
writeFileSync('docs/layout-v0.svg', svg(map));

// PRNG déterministe pour un aperçu reproductible.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const preview = layout
  .filter((cell) => (cell.zone === 'data' ? rand() < 0.5 : cell.dark))
  .map((cell) => `<polygon points="${pts(cell.r, cell.c)}" fill="#111"/>`)
  .join('\n');
writeFileSync('docs/apercu-v0.svg', svg(preview));

console.log('docs/layout-v0.svg et docs/apercu-v0.svg générés');
