/** Feuille de test imprimable : tailles et styles, identifiants reconnus par le scanner (config.TEST_STYLES). */
import { encode } from '../../src/core/encoder';
import { N } from '../../src/core/geometry';
import { renderSvg } from '../../src/render/svg';
import { TEST_STYLES } from './config';

const QUIET = 2;
/** Largeur totale du SVG (zone de silence comprise) pour un côté de symbole donné, en mm. */
const svgWidthMm = (sideMm: number) => (sideMm * (N + 2 * QUIET)) / N;

const groups: { title: string; style: keyof typeof TEST_STYLES; sizes: number[] }[] = [
  { title: 'Tailles — noir', style: 'noir', sizes: [10, 12, 15, 20, 25, 30, 40] },
  { title: 'Style « points 15 % »', style: 'pnts', sizes: [15, 20, 25, 30] },
  { title: 'Couleur bleue', style: 'bleu', sizes: [15, 20, 25, 30] },
  { title: 'Gris (faible contraste)', style: 'gris', sizes: [15, 20, 25, 30] },
];

const sheet = document.getElementById('sheet')!;
for (const group of groups) {
  const section = document.createElement('section');
  section.className = 'group';
  section.innerHTML = `<h2>${group.title}</h2>`;
  const codes = document.createElement('div');
  codes.className = 'codes';
  for (const size of group.sizes) {
    const id = `T${String(size).padStart(3, '0')}${group.style}`;
    const fig = document.createElement('figure');
    fig.innerHTML = renderSvg(encode(id), { quietZone: QUIET, ...TEST_STYLES[group.style].options });
    const svg = fig.querySelector('svg')!;
    svg.style.width = `${svgWidthMm(size).toFixed(2)}mm`;
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<b>${size} mm</b><br><span class="mono">${id}</span>`;
    fig.append(cap);
    codes.append(fig);
  }
  section.append(codes);
  sheet.append(section);
}
