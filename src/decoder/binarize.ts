/**
 * Binarisation adaptative par blocs (principe du « hybrid binarizer ») :
 * seuil local = moyenne des 5×5 blocs voisins ; les blocs uniformes héritent du seuil des blocs contrastés
 * les plus proches, ce qui garde sombres les grands aplats (noyaux des repères) quelle que soit la taille
 * des cellules, et fonctionne aussi à faible contraste.
 */
import type { GrayImage } from './image';

const BLOCK = 8;
/** Écart-type minimal d'un bloc « contrasté » ; en dessous, le bloc est uniforme (bruit de capteur compris). */
const MIN_STD = 9;

export interface Binarized {
  /** 1 = sombre, 0 = clair. */
  bin: Uint8Array;
  /** Seuil local au pixel (x, y). */
  thresholdAt(x: number, y: number): number;
}

export function binarize(img: GrayImage): Binarized {
  const { width: w, height: h, data } = img;
  const bw = Math.ceil(w / BLOCK);
  const bh = Math.ceil(h / BLOCK);
  const avg = new Float32Array(bw * bh);
  const known = new Uint8Array(bw * bh);

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      let sum2 = 0;
      let count = 0;
      for (let y = by * BLOCK; y < Math.min(h, (by + 1) * BLOCK); y++) {
        for (let x = bx * BLOCK; x < Math.min(w, (bx + 1) * BLOCK); x++) {
          const v = data[y * w + x]!;
          sum += v;
          sum2 += v * v;
          count++;
        }
      }
      const b = by * bw + bx;
      const mean = sum / count;
      avg[b] = mean;
      known[b] = sum2 / count - mean * mean > MIN_STD * MIN_STD ? 1 : 0;
    }
  }

  const uniform = Uint8Array.from(known, (k) => 1 - k);
  const blockMean = Float32Array.from(avg);

  // Blocs uniformes : seuil hérité des blocs contrastés les plus proches (propagation en largeur),
  // sans hypothèse sur le niveau absolu du sombre ou du clair.
  let frontier: number[] = [];
  for (let b = 0; b < known.length; b++) if (known[b]) frontier.push(b);
  if (frontier.length === 0) return { bin: new Uint8Array(w * h), thresholdAt: () => 0 };
  while (frontier.length > 0) {
    const next: number[] = [];
    const sums = new Map<number, [number, number]>();
    for (const b of frontier) {
      const bx = b % bw;
      const by = (b - bx) / bw;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = bx + dx;
        const y = by + dy;
        if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
        const nb = y * bw + x;
        if (known[nb]) continue;
        const acc = sums.get(nb) ?? [0, 0];
        acc[0] += avg[b]!;
        acc[1]++;
        sums.set(nb, acc);
      }
    }
    for (const [nb, [sum, n]] of sums) {
      avg[nb] = sum / n;
      known[nb] = 1;
      next.push(nb);
    }
    frontier = next;
  }

  const out = new Uint8Array(w * h);
  const thresholds = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const yy = Math.min(bh - 1, Math.max(0, by + dy));
          const xx = Math.min(bw - 1, Math.max(0, bx + dx));
          sum += avg[yy * bw + xx]!;
          n++;
        }
      }
      const threshold = sum / n;
      const b = by * bw + bx;
      thresholds[b] = threshold;
      // Bloc uniforme : classé en entier d'après sa moyenne, pour ne pas transformer le bruit en poussière.
      const blockDark = uniform[b] ? (blockMean[b]! < threshold ? 1 : 0) : -1;
      for (let y = by * BLOCK; y < Math.min(h, (by + 1) * BLOCK); y++) {
        for (let x = bx * BLOCK; x < Math.min(w, (bx + 1) * BLOCK); x++) {
          out[y * w + x] = blockDark >= 0 ? blockDark : data[y * w + x]! < threshold ? 1 : 0;
        }
      }
    }
  }
  return {
    bin: out,
    thresholdAt: (x, y) => thresholds[Math.min(bh - 1, Math.floor(y / BLOCK)) * bw + Math.min(bw - 1, Math.floor(x / BLOCK))]!,
  };
}
