/**
 * Rasterisation d'une matrice KYcode dans une image en niveaux de gris, avec dégradations optionnelles.
 * Sert aux tests de robustesse du décodeur (scènes synthétiques) et aux aperçus sans canvas.
 */
import type { KYMatrix } from '../core/encoder';
import { cellIndexAtXY, xyToBary } from '../core/geometry';
import { applyH, invertH, type Homography } from '../decoder/homography';
import { createGray, type GrayImage } from '../decoder/image';

export interface SceneOptions {
  width: number;
  height: number;
  /** Homographie coordonnées symbole (côté N, sommet en (N/2, 0)) → pixels. */
  transform: Homography;
  dark?: number;
  light?: number;
  /** Couleur hors du symbole et de sa zone de silence (fond de la scène). */
  surround?: number;
  /** Zone de silence dessinée en clair autour du triangle, en côtés de cellule. */
  quietZone?: number;
  /** Suréchantillonnage par axe (anticrénelage). */
  supersample?: number;
  /** Rayon du flou (3 passes de flou boîte ≈ gaussien). */
  blur?: number;
  /** Écart-type du bruit gaussien, en niveaux de gris. */
  noise?: number;
  /** Éclairage : facteur multiplicatif de gauche (1 - gradient) à droite (1). */
  gradient?: number;
  seed?: number;
}

/** PRNG déterministe (mulberry32). */
export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderScene(cells: KYMatrix, o: SceneOptions): GrayImage {
  const dark = o.dark ?? 20;
  const light = o.light ?? 240;
  const surround = o.surround ?? light;
  const q = o.quietZone ?? 2;
  const ss = o.supersample ?? 3;
  const inv = invertH(o.transform);
  if (!inv) throw new Error('transformation non inversible');
  const img = createGray(o.width, o.height);
  const sqrt3 = Math.sqrt(3);

  for (let py = 0; py < o.height; py++) {
    for (let px = 0; px < o.width; px++) {
      let acc = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [x, y] = applyH(inv, px + (sx + 0.5) / ss, py + (sy + 0.5) / ss);
          const idx = cellIndexAtXY(x, y);
          if (idx >= 0) {
            acc += cells[idx] ? dark : light;
          } else {
            // Zone de silence : distance aux côtés du triangle ≤ q côtés de cellule.
            const inQuiet = Math.min(...xyToBary(x, y)) >= -q / (sqrt3 / 2);
            acc += inQuiet ? light : surround;
          }
        }
      }
      img.data[py * o.width + px] = acc / (ss * ss);
    }
  }

  if (o.blur && o.blur > 0) boxBlur3(img, Math.round(o.blur));
  if (o.gradient) {
    for (let py = 0; py < o.height; py++)
      for (let px = 0; px < o.width; px++) {
        const i = py * o.width + px;
        img.data[i] = img.data[i]! * (1 - o.gradient * (1 - px / o.width));
      }
  }
  if (o.noise) {
    const rnd = prng(o.seed ?? 1);
    for (let i = 0; i < img.data.length; i++) {
      const g = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
      img.data[i] = img.data[i]! + g * o.noise;
    }
  }
  return img;
}

/** Flou boîte de rayon r appliqué 3 fois (approximation gaussienne). */
export function boxBlur3(img: GrayImage, r: number): void {
  if (r <= 0) return;
  const { width: w, height: h } = img;
  const buf = new Float32Array(img.data);
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += buf[y * w + Math.min(w - 1, Math.max(0, x + k))]!;
        tmp[y * w + x] = s / (2 * r + 1);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]!;
        buf[y * w + x] = s / (2 * r + 1);
      }
    }
  }
  img.data.set(buf);
}
