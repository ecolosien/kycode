/**
 * Composantes connexes d'une image binaire, sombres (8-connexité) et claires (4-connexité),
 * avec leurs statistiques et leurs voisines de couleur opposée.
 */

export interface Component {
  id: number;
  dark: boolean;
  area: number;
  cx: number;
  cy: number;
  touchesBorder: boolean;
  neighbors: Set<number>;
}

export function labelComponents(bin: Uint8Array, w: number, h: number): { labels: Int32Array; comps: Component[] } {
  let parent = new Int32Array(1024);
  let count = 0;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number): number => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return ra;
    const lo = ra < rb ? ra : rb;
    parent[ra < rb ? rb : ra] = lo;
    return lo;
  };

  // Premier passage : étiquettes provisoires et équivalences (sans allocation par pixel).
  const labels = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = bin[i]!;
      let label = -1;
      if (x > 0 && bin[i - 1] === v) label = labels[i - 1]!;
      if (y > 0) {
        if (bin[i - w] === v) label = label < 0 ? labels[i - w]! : union(label, labels[i - w]!);
        if (v === 1) {
          if (x > 0 && bin[i - w - 1] === 1) label = label < 0 ? labels[i - w - 1]! : union(label, labels[i - w - 1]!);
          if (x < w - 1 && bin[i - w + 1] === 1) label = label < 0 ? labels[i - w + 1]! : union(label, labels[i - w + 1]!);
        }
      }
      if (label < 0) {
        if (count === parent.length) {
          const grown = new Int32Array(parent.length * 2);
          grown.set(parent);
          parent = grown;
        }
        parent[count] = count;
        label = count++;
      }
      labels[i] = label;
    }
  }

  // Renumérotation compacte et statistiques.
  const remap = new Int32Array(count).fill(-1);
  const comps: Component[] = [];
  const sx: number[] = [];
  const sy: number[] = [];
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const root = find(labels[i]!);
      let id = remap[root]!;
      if (id < 0) {
        id = comps.length;
        remap[root] = id;
        comps.push({ id, dark: bin[i] === 1, area: 0, cx: 0, cy: 0, touchesBorder: false, neighbors: new Set() });
        sx.push(0);
        sy.push(0);
      }
      labels[i] = id;
      const c = comps[id]!;
      c.area++;
      sx[id]! += x;
      sy[id]! += y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.touchesBorder = true;
    }
  }
  comps.forEach((c, id) => {
    c.cx = sx[id]! / c.area + 0.5;
    c.cy = sy[id]! / c.area + 0.5;
  });

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = labels[i]!;
      if (x < w - 1 && bin[i + 1] !== bin[i]) link(comps, a, labels[i + 1]!);
      if (y < h - 1 && bin[i + w] !== bin[i]) link(comps, a, labels[i + w]!);
    }
  }
  return { labels, comps };
}

function link(comps: Component[], a: number, b: number) {
  comps[a]!.neighbors.add(b);
  comps[b]!.neighbors.add(a);
}
