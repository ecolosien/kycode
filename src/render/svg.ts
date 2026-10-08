/**
 * Rendu SVG d'une matrice KYcode (spec §6).
 * Sans espacement, les cellules sombres adjacentes sont fusionnées en contours uniques (pas de liserés).
 */
import { LAYOUT, type KYMatrix } from '../core/encoder';
import { allCells, cellVertices, N } from '../core/geometry';

export interface SvgOptions {
  /** Couleur sombre. */
  foreground?: string;
  /** Couleur claire ; 'none' pour un fond transparent. */
  background?: string;
  /** Zone de silence, en côtés de cellule (minimum 2). */
  quietZone?: number;
  /** Réduction des cellules de données vers leur centre, 0 … 0.15. */
  inset?: number;
  /** Largeur en pixels de l'attribut width (la hauteur suit). Absent = taille libre. */
  width?: number;
}

const H = (N * Math.sqrt(3)) / 2;
const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** Contours fusionnés des cellules sombres, en coordonnées symbole (côté = N). */
export function mergedOutline(cells: KYMatrix, include: (index: number) => boolean = () => true): [number, number][][] {
  // Sommets sur le réseau : clé entière (2x, r). Chaque triangle est parcouru dans le même sens ;
  // une arête partagée par deux cellules sombres apparaît dans les deux sens et s'annule.
  const key = (X: number, r: number) => `${X},${r}`;
  const edges = new Map<string, string[]>();
  const pending = new Set<string>();
  const addEdge = (from: string, to: string) => {
    const reverse = `${to}>${from}`;
    if (pending.has(reverse)) {
      pending.delete(reverse);
      const list = edges.get(to)!;
      list.splice(list.indexOf(from), 1);
      return;
    }
    pending.add(`${from}>${to}`);
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from)!.push(to);
  };

  allCells().forEach((cell, i) => {
    if (!cells[i] || !include(i)) return;
    const { r, c } = cell;
    if (c % 2 === 0) {
      const k = c / 2;
      const apex = key(N - r + 2 * k, r);
      const right = key(N - r + 2 * k + 1, r + 1);
      const left = key(N - r + 2 * k - 1, r + 1);
      addEdge(apex, left);
      addEdge(left, right);
      addEdge(right, apex);
    } else {
      const k = (c - 1) / 2;
      const tl = key(N - r + 2 * k, r);
      const tr = key(N - r + 2 * k + 2, r);
      const bottom = key(N - r + 2 * k + 1, r + 1);
      addEdge(tl, bottom);
      addEdge(bottom, tr);
      addEdge(tr, tl);
    }
  });

  const toXY = (k: string): [number, number] => {
    const [X, r] = k.split(',').map(Number) as [number, number];
    return [X / 2, (r * Math.sqrt(3)) / 2];
  };
  const loops: [number, number][][] = [];
  for (const [start, outs] of edges) {
    while (outs.length > 0) {
      const loop: [number, number][] = [toXY(start)];
      let current = outs.pop()!;
      while (current !== start) {
        loop.push(toXY(current));
        current = edges.get(current)!.pop()!;
      }
      loops.push(loop);
    }
  }
  return loops;
}

export function renderSvg(cells: KYMatrix, options: SvgOptions = {}): string {
  const fg = options.foreground ?? '#000000';
  const bg = options.background ?? '#ffffff';
  const q = Math.max(2, options.quietZone ?? 2);
  const inset = Math.min(0.15, Math.max(0, options.inset ?? 0));
  const vbW = N + 2 * q;
  const vbH = H + 2 * q;
  const tr = (p: [number, number]) => `${fmt(p[0] + q)} ${fmt(p[1] + q)}`;
  const loopsToPath = (loops: [number, number][][]) =>
    loops.map((l) => `M${l.map(tr).join('L')}Z`).join('');

  let d: string;
  if (inset === 0) {
    d = loopsToPath(mergedOutline(cells));
  } else {
    // Repères pleins et fusionnés ; cellules de données réduites individuellement.
    const isData = (i: number) => LAYOUT[i]!.zone === 'data';
    const parts = [loopsToPath(mergedOutline(cells, (i) => !isData(i)))];
    LAYOUT.forEach((cell, i) => {
      if (!cells[i] || !isData(i)) return;
      const v = cellVertices(cell);
      const cx = (v[0]![0] + v[1]![0] + v[2]![0]) / 3;
      const cy = (v[0]![1] + v[1]![1] + v[2]![1]) / 3;
      const shrunk = v.map(([x, y]) => [cx + (x - cx) * (1 - inset), cy + (y - cy) * (1 - inset)] as [number, number]);
      parts.push(loopsToPath([shrunk]));
    });
    d = parts.join('');
  }

  const size = options.width ? ` width="${options.width}" height="${fmt((options.width * vbH) / vbW)}"` : '';
  const rect = bg === 'none' ? '' : `<rect width="${fmt(vbW)}" height="${fmt(vbH)}" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(vbW)} ${fmt(vbH)}"${size}>${rect}<path fill="${fg}" d="${d}"/></svg>`;
}
