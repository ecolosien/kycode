/**
 * Décodeur KYcode v0 sur image fixe (spec §7).
 */
import { DATA_CELL_INDICES, decodeDataBits, LAYOUT } from '../core/encoder';
import { baryToXY, cellCentroidBary, cellVertices, N } from '../core/geometry';
import { binarize, type Binarized } from './binarize';
import { labelComponents, type Component } from './components';
import { applyH, fitAffine, fitHomography, type Homography, type Point } from './homography';
import type { GrayImage } from './image';
import { boxBlur3 } from '../render/raster';

export interface FinderCandidate {
  center: Point;
  /** Aire noyau + anneau clair, en pixels. */
  area: number;
}

export interface DecodeResult {
  id: string;
  /** Octets corrigés par Reed-Solomon. */
  corrected: number;
  /** Octets douteux déclarés effacés pour réussir le décodage (0 = lecture franche). */
  erasures: number;
  /** Cellules fonctionnelles (repères, séparateurs) lues avec la mauvaise couleur. */
  functionalErrors: number;
  /** Centres des repères A (sommet), G (bas gauche), B (bas droite), en pixels. */
  finders: [Point, Point, Point];
  alignment: Point | null;
  /** Homographie coordonnées symbole → pixels. */
  homography: Homography;
}

const s3 = Math.sqrt(3) / 2;
/** Centres des repères dans l'orientation canonique : A, G, B (spec §4.1). */
const FINDER_SYMBOL: Point[] = [baryToXY(18, 3, 3), baryToXY(3, 3, 18), baryToXY(3, 18, 3)];
const CENTER_SYMBOL: Point = baryToXY(N / 3, N / 3, N / 3);
/** Distance entre centres de repères / racine de l'aire noyau+anneau, dans le symbole idéal. */
const IDEAL_SPACING = 15 / Math.sqrt(36 * (s3 / 2));

export function findFinderCandidates(comps: Component[]): FinderCandidate[] {
  const out: FinderCandidate[] = [];
  for (const core of comps) {
    if (!core.dark || core.touchesBorder || core.area < 6 || core.neighbors.size !== 1) continue;
    const ring = comps[[...core.neighbors][0]!]!;
    if (ring.touchesBorder) continue;
    const others = [...ring.neighbors].filter((id) => id !== core.id).map((id) => comps[id]!);
    if (others.length === 0) continue;
    // Tolère quelques taches parasites dans l'anneau clair.
    const outer = others.reduce((a, b) => (b.area > a.area ? b : a));
    const specks = others.reduce((s, c) => s + (c === outer ? 0 : c.area), 0);
    if (specks > core.area * 0.15) continue;
    const ratio = ring.area / core.area;
    if (ratio < 1.5 || ratio > 7) continue;
    const area = core.area + ring.area;
    out.push({ center: [(core.cx * core.area + ring.cx * ring.area) / area, (core.cy * core.area + ring.cy * ring.area) / area], area });
  }
  return out;
}

interface Triplet {
  pts: [FinderCandidate, FinderCandidate, FinderCandidate];
  score: number;
}

function rankTriplets(cands: FinderCandidate[]): Triplet[] {
  const list = cands.slice().sort((a, b) => b.area - a.area).slice(0, 40);
  const out: Triplet[] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      for (let k = j + 1; k < list.length; k++) {
        const t = [list[i]!, list[j]!, list[k]!] as Triplet['pts'];
        const sizes = t.map((c) => Math.sqrt(c.area));
        const sizeRatio = Math.max(...sizes) / Math.min(...sizes);
        if (sizeRatio > 2.5) continue;
        const d = [dist(t[0].center, t[1].center), dist(t[1].center, t[2].center), dist(t[0].center, t[2].center)];
        const sideRatio = Math.max(...d) / Math.min(...d);
        if (sideRatio > 2.2) continue;
        const spacing = d.reduce((a, b) => a + b) / 3 / (sizes.reduce((a, b) => a + b) / 3);
        if (spacing < IDEAL_SPACING / 1.8 || spacing > IDEAL_SPACING * 1.8) continue;
        out.push({ pts: t, score: Math.abs(Math.log(spacing / IDEAL_SPACING)) + Math.log(sideRatio) + Math.log(sizeRatio) });
      }
  return out.sort((a, b) => a.score - b.score);
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Réduit les grandes images (photos) pour garder un temps de traitement raisonnable. */
function downscale(img: GrayImage, maxSide: number): { img: GrayImage; factor: number } {
  const f = Math.ceil(Math.max(img.width, img.height) / maxSide);
  if (f <= 1) return { img, factor: 1 };
  const w = Math.floor(img.width / f);
  const h = Math.floor(img.height / f);
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += img.data[(y * f + dy) * img.width + x * f + dx]!;
      data[y * w + x] = s / (f * f);
    }
  return { img: { width: w, height: h, data }, factor: f };
}

/**
 * Points d'échantillonnage d'une cellule : centre de gravité + 3 points proches vers les sommets
 * (les pointes d'un triangle sont les premières délavées par le flou).
 */
function samplePoints(cellIdx: number): Point[] {
  const cell = LAYOUT[cellIdx]!;
  const c = baryToXY(...cellCentroidBary(cell));
  const pts: Point[] = [c];
  for (const v of cellVertices(cell)) pts.push([c[0] + (v[0] - c[0]) * 0.2, c[1] + (v[1] - c[1]) * 0.2]);
  return pts;
}
const SAMPLE_POINTS: Point[][] = LAYOUT.map((_, i) => samplePoints(i));

/**
 * Lit une cellule : moyenne des niveaux de gris aux points d'échantillonnage, comparée au seuil local.
 * Renvoie l'écart signé au seuil (négatif = sombre), ou null hors de l'image.
 */
function readCell(img: GrayImage, b: Binarized, H: Homography, cellIdx: number): number | null {
  const { width: w, height: h, data } = img;
  let sum = 0;
  let cx = 0;
  let cy = 0;
  const pts = SAMPLE_POINTS[cellIdx]!;
  for (let k = 0; k < pts.length; k++) {
    const [x, y] = applyH(H, pts[k]![0], pts[k]![1]);
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return null;
    if (k === 0) [cx, cy] = [x, y];
    sum += bilinear(data, w, x - 0.5, y - 0.5);
  }
  return sum / pts.length - b.thresholdAt(cx, cy);
}

function bilinear(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * w + x0;
  return (
    data[i]! * (1 - fx) * (1 - fy) + data[i + 1]! * fx * (1 - fy) + data[i + w]! * (1 - fx) * fy + data[i + w + 1]! * fx * fy
  );
}

/** Informations sur une tentative, utiles pour guider l'utilisateur quand le décodage échoue. */
export interface DecodeDiagnostics {
  /** Centres des repères candidats du meilleur passage, en pixels de l'image d'entrée. */
  finderCandidates: Point[];
}

/**
 * Cherche et décode un KYcode dans l'image. Renvoie null si aucun symbole valide n'est trouvé :
 * un résultat non nul a toujours passé la correction d'erreur et la vérification d'en-tête.
 */
export function decode(input: GrayImage, diagnostics?: DecodeDiagnostics): DecodeResult | null {
  const { img, factor } = downscale(input, 1000);
  const first = decodeAt(img, factor, diagnostics);
  if (first) return first;
  // Second passage sur une copie lissée : le bruit fin perce les anneaux des repères.
  const smoothed: GrayImage = { ...img, data: new Uint8ClampedArray(img.data) };
  boxBlur3(smoothed, 1);
  return decodeAt(smoothed, factor, diagnostics);
}

function decodeAt(img: GrayImage, factor: number, diagnostics?: DecodeDiagnostics): DecodeResult | null {
  const { width: w, height: h } = img;
  const binarized = binarize(img);
  const { comps } = labelComponents(binarized.bin, w, h);
  const finders = findFinderCandidates(comps);
  if (diagnostics && finders.length > diagnostics.finderCandidates.length) {
    diagnostics.finderCandidates = finders.map((f) => [f.center[0] * factor, f.center[1] * factor]);
  }
  if (finders.length < 3) return null;

  for (const triplet of rankTriplets(finders).slice(0, 6)) {
    let p = triplet.pts.map((c) => c.center) as [Point, Point, Point];
    // Même sens de parcours que A → G → B dans le symbole (image non inversée).
    if (Math.sign(cross(p[0], p[1], p[2])) !== Math.sign(cross(FINDER_SYMBOL[0]!, FINDER_SYMBOL[1]!, FINDER_SYMBOL[2]!))) {
      p = [p[0], p[2], p[1]];
    }
    const meanSize = triplet.pts.reduce((s, c) => s + Math.sqrt(c.area), 0) / 3;

    for (let rot = 0; rot < 3; rot++) {
      const dst: Point[] = [p[rot]!, p[(rot + 1) % 3]!, p[(rot + 2) % 3]!];
      const affine = fitAffine(FINDER_SYMBOL, dst);
      if (!affine) continue;

      // Repère central : composante claire entourée d'une seule composante sombre, près du centre prédit.
      const predicted = applyH(affine, ...CENTER_SYMBOL);
      const expectedArea = triplet.pts.reduce((s, c) => s + c.area, 0) / 3 / 4;
      let alignment: Point | null = null;
      let best = meanSize * 0.8;
      for (const c of comps) {
        if (c.dark || c.touchesBorder || c.neighbors.size !== 1) continue;
        if (c.area < expectedArea * 0.3 || c.area > expectedArea * 3) continue;
        const d = dist([c.cx, c.cy], predicted);
        if (d < best) {
          best = d;
          alignment = [c.cx, c.cy];
        }
      }
      const H = alignment ? fitHomography([...FINDER_SYMBOL, CENTER_SYMBOL], [...dst, alignment]) ?? affine : affine;

      const bits: boolean[] = [];
      const margins: number[] = [];
      let outOfImage = false;
      for (const idx of DATA_CELL_INDICES) {
        const v = readCell(img, binarized, H, idx);
        if (v === null) {
          outOfImage = true;
          break;
        }
        bits.push(v < 0);
        margins.push(Math.abs(v));
      }
      if (outOfImage) continue;
      const decoded = decodeDataBits(bits, margins);
      if (!decoded) continue;

      let functionalErrors = 0;
      LAYOUT.forEach((cell, idx) => {
        if (cell.zone === 'data') return;
        const v = readCell(img, binarized, H, idx);
        if (v === null || v < 0 !== cell.dark) functionalErrors++;
      });
      const scale = (q: Point): Point => [q[0] * factor, q[1] * factor];
      const Hs = H.map((v, i) => (i < 6 ? v * factor : v));
      return {
        id: decoded.id,
        corrected: decoded.corrected,
        erasures: decoded.erasures,
        functionalErrors,
        finders: [scale(dst[0]!), scale(dst[1]!), scale(dst[2]!)],
        alignment: alignment ? scale(alignment) : null,
        homography: Hs,
      };
    }
  }
  return null;
}
