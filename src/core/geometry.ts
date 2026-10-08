/**
 * KYcode v0 — géométrie de la grille et carte des zones fonctionnelles.
 * Référence normative : docs/KYcode-spec-v0.md
 */

/** Nombre de rangées du triangle (côté du symbole, en cellules). */
export const N = 24;
/** Côté d'un repère de coin, en rangées. */
export const FINDER_SIDE = 9;
/** Côté du repère central (triangle inversé), en rangées. */
export const ALIGN_SIDE = 6;
/** Nombre de cellules de données (= 30 octets). */
export const DATA_CELLS = 240;

export type Zone = 'finder' | 'separator' | 'align' | 'data';

export interface Cell {
  /** Rangée, 0 = sommet. */
  r: number;
  /** Indice dans la rangée, 0..2r. Pair = pointe en haut, impair = pointe en bas. */
  c: number;
  up: boolean;
  /** Coordonnées barycentriques entières (a, b, g) — voir spec §3.2. */
  a: number;
  b: number;
  g: number;
}

export interface FunctionCell extends Cell {
  zone: Zone;
  /** Valeur imposée (true = sombre) pour les zones fonctionnelles ; undefined pour les données. */
  dark?: boolean;
  /** Rang dans l'ordre de placement des données, pour les cellules de données. */
  dataIndex?: number;
}

export function cellAt(r: number, c: number): Cell {
  const up = c % 2 === 0;
  const k = up ? c / 2 : (c - 1) / 2;
  return { r, c, up, a: N - 1 - r, b: k, g: up ? r - k : r - 1 - k };
}

/** Inverse de cellAt : (a, b, g) → (r, c). La somme vaut N-1 (pointe en haut) ou N-2 (pointe en bas). */
export function cellFromBary(a: number, b: number, g: number): Cell {
  const sum = a + b + g;
  if (sum !== N - 1 && sum !== N - 2) throw new Error(`barycentriques invalides (${a},${b},${g})`);
  const up = sum === N - 1;
  const r = N - 1 - a;
  return cellAt(r, up ? 2 * b : 2 * b + 1);
}

/** Rotation de 120° autour du centre de gravité : (a, b, g) → (g, a, b). */
export function rotate(cell: Cell, times = 1): Cell {
  let { a, b, g } = cell;
  for (let i = 0; i < ((times % 3) + 3) % 3; i++) [a, b, g] = [g, a, b];
  return cellFromBary(a, b, g);
}

/** Toutes les cellules dans l'ordre canonique : rangée par rangée, de gauche à droite. */
export function allCells(): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c <= 2 * r; c++) cells.push(cellAt(r, c));
  return cells;
}

function classify(cell: Cell): Pick<FunctionCell, 'zone' | 'dark'> {
  const { a, b, g, up } = cell;
  const lim = up ? FINDER_SIDE - 1 : FINDER_SIDE - 2;

  // Repères de coin : chaque coin est défini par les deux coordonnées qui y valent 0.
  for (const [x, y] of [[b, g], [a, b], [a, g]] as const) {
    if (x + y <= lim) {
      const d = Math.min(x, y, lim - x - y);
      return { zone: 'finder', dark: d !== 1 };
    }
  }
  for (const [x, y] of [[b, g], [a, b], [a, g]] as const) {
    if (x + y === lim + 1) return { zone: 'separator', dark: false };
  }

  // Repère central : triangle inversé de côté ALIGN_SIDE centré sur (N/3, N/3, N/3).
  const u = (N + ALIGN_SIDE) / 3;
  const off = up ? 1 / 3 : 2 / 3;
  const maxCoord = Math.max(a, b, g) + off;
  if (maxCoord <= u) return { zone: 'align', dark: u - maxCoord < 1 };

  return { zone: 'data' };
}

/** Carte complète des cellules, avec zone, valeur imposée et ordre de placement des données. */
export function buildLayout(): FunctionCell[] {
  let dataIndex = 0;
  return allCells().map((cell) => {
    const z = classify(cell);
    return z.zone === 'data' ? { ...cell, ...z, dataIndex: dataIndex++ } : { ...cell, ...z };
  });
}

/** Sommets d'une cellule dans un repère où le côté du symbole vaut N et le sommet est en (N/2, 0). */
export function cellVertices(cell: Pick<Cell, 'r' | 'c'>): [number, number][] {
  const h = Math.sqrt(3) / 2;
  const { r, c } = cell;
  const y0 = r * h;
  const y1 = (r + 1) * h;
  if (c % 2 === 0) {
    const k = c / 2;
    const xb = N / 2 - (r + 1) / 2 + k;
    return [[N / 2 - r / 2 + k, y0], [xb + 1, y1], [xb, y1]];
  }
  const k = (c - 1) / 2;
  const xt = N / 2 - r / 2 + k;
  return [[xt, y0], [xt + 1, y0], [xt + 0.5, y1]];
}

/** Rang d'une cellule dans l'ordre canonique (les rangées précédentes contiennent r² cellules). */
export function cellIndex(r: number, c: number): number {
  return r * r + c;
}

/** Coordonnées barycentriques continues du centre de gravité d'une cellule (somme = N). */
export function cellCentroidBary(cell: Pick<Cell, 'a' | 'b' | 'g' | 'up'>): [number, number, number] {
  const off = cell.up ? 1 / 3 : 2 / 3;
  return [cell.a + off, cell.b + off, cell.g + off];
}

/** Barycentriques continues (α, β, γ), somme N → coordonnées planes (sommet en (N/2, 0)). */
export function baryToXY(alpha: number, beta: number, _gamma: number): [number, number] {
  const t = N - alpha;
  return [beta + N / 2 - t / 2, (t * Math.sqrt(3)) / 2];
}

/** Coordonnées planes → barycentriques continues. Hors du symbole si une coordonnée est négative. */
export function xyToBary(x: number, y: number): [number, number, number] {
  const t = y / (Math.sqrt(3) / 2);
  return [N - t, x - N / 2 + t / 2, N / 2 + t / 2 - x];
}

/** Rang canonique de la cellule contenant le point (x, y), ou -1 hors du symbole. */
export function cellIndexAtXY(x: number, y: number): number {
  const [al, be, ga] = xyToBary(x, y);
  if (al < 0 || be < 0 || ga < 0) return -1;
  const a = Math.floor(al);
  const b = Math.floor(be);
  const g = Math.floor(ga);
  const sum = a + b + g;
  const r = N - 1 - a;
  if (r < 0 || r >= N) return -1;
  if (sum === N - 1) return cellIndex(r, 2 * b);
  if (sum === N - 2) return cellIndex(r, 2 * b + 1);
  return -1;
}
