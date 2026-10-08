/**
 * Générateur KYcode : identifiant + style → aperçu SVG, vérification de lecture, export SVG/PNG.
 * Chaque aperçu est rasterisé puis décodé : un code non relu n'est jamais présenté comme valide.
 */
import { encode } from '../../src/core/encoder';
import { idToNumber, randomId } from '../../src/core/payload';
import { svgToCanvas, svgToPngBlob } from '../../src/render/png-browser';
import { renderSvg, type SvgOptions } from '../../src/render/svg';
import { redirectUrl } from './config';
import { DecoderClient } from './decoder-client';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const idInput = $<HTMLInputElement>('idInput');
const fg = $<HTMLInputElement>('fg');
const bg = $<HTMLInputElement>('bg');
const transparent = $<HTMLInputElement>('transparent');
const inset = $<HTMLInputElement>('inset');
const check = $('check');
const checkDetail = $('checkDetail');
const decoder = new DecoderClient();

let current: { id: string; svg: string } | null = null;
let revision = 0;

function options(): SvgOptions {
  return {
    foreground: fg.value,
    background: transparent.checked ? 'none' : bg.value,
    inset: Number(inset.value) / 100,
  };
}

/** Rapport de contraste WCAG entre deux couleurs #rrggbb. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

async function update() {
  const rev = ++revision;
  const id = idInput.value;
  const err = $('idError');
  try {
    idToNumber(id);
    err.hidden = true;
  } catch (e) {
    err.hidden = false;
    err.textContent = (e as Error).message;
    current = null;
    setCheck('bad', '✕ Identifiant invalide', '');
    return;
  }
  $('linkPreview').textContent = redirectUrl(id);
  $('insetValue').textContent = `${inset.value} %`;
  const svg = renderSvg(encode(id), options());
  current = { id, svg };
  $('preview').innerHTML = svg;

  // Vérification : rendu sur fond blanc (cas d'un fond transparent posé sur une page claire), puis décodage.
  setCheck('', 'Vérification…', '');
  const canvas = await svgToCanvas(svg, 480);
  const ctx = canvas.getContext('2d')!;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const res = await decoder.decode(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (rev !== revision) return;

  const ratio = contrast(fg.value, transparent.checked ? '#ffffff' : bg.value);
  if (!res.result || res.result.id !== id) {
    setCheck('bad', '✕ Lecture impossible', 'Ce style ne peut pas être relu : augmentez le contraste ou réduisez l’espacement.');
  } else if (ratio < 4) {
    setCheck('warn', '⚠ Lisible, mais contraste faible', `Rapport de contraste ${ratio.toFixed(1)}:1 (4:1 recommandé). Risque d’échec à l’impression ou en faible lumière.`);
  } else {
    setCheck('ok', '✓ Lecture vérifiée', `Relu à l’écran en ${res.ms.toFixed(0)} ms. Contraste ${ratio.toFixed(1)}:1. À confirmer sur téléphone avant impression en série.`);
  }
}

function setCheck(kind: '' | 'ok' | 'warn' | 'bad', text: string, detail: string) {
  check.className = `status ${kind}`;
  check.textContent = text;
  checkDetail.textContent = detail;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

idInput.value = new URLSearchParams(location.search).get('id') ?? randomId();
for (const el of [idInput, fg, bg, transparent, inset]) el.addEventListener('input', () => void update());
$('randomBtn').addEventListener('click', () => {
  idInput.value = randomId();
  void update();
});
$('svgBtn').addEventListener('click', () => {
  if (current) download(new Blob([current.svg], { type: 'image/svg+xml' }), `kycode-${current.id}.svg`);
});
$('pngBtn').addEventListener('click', async () => {
  if (!current) return;
  const width = Math.min(8000, Math.max(100, Number($<HTMLInputElement>('pngWidth').value) || 1200));
  download(await svgToPngBlob(current.svg, width), `kycode-${current.id}.png`);
});
void update();
