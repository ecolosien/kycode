/** Homographies planes 3×3 (h33 = 1), stockées en ligne : [h11 h12 h13 h21 h22 h23 h31 h32 h33]. */
export type Homography = number[];
export type Point = [number, number];

export function applyH(H: Homography, x: number, y: number): Point {
  const w = H[6]! * x + H[7]! * y + H[8]!;
  return [(H[0]! * x + H[1]! * y + H[2]!) / w, (H[3]! * x + H[4]! * y + H[5]!) / w];
}

/** Résout A·x = b (A carrée, élimination de Gauss avec pivot partiel). Renvoie null si singulière. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    if (Math.abs(M[pivot]![col]!) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Homographie src → dst par moindres carrés (au moins 4 correspondances, pas 3 points alignés). */
export function fitHomography(src: Point[], dst: Point[]): Homography | null {
  if (src.length < 4 || src.length !== dst.length) return null;
  // Normalisation pour la stabilité numérique.
  const norm = (pts: Point[]) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const d = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length || 1;
    const k = Math.SQRT2 / d;
    return { T: [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1], pts: pts.map(([x, y]) => [k * (x - cx), k * (y - cy)] as Point) };
  };
  const s = norm(src);
  const t = norm(dst);
  const AtA = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const Atb = new Array<number>(8).fill(0);
  s.pts.forEach(([x, y], i) => {
    const [u, v] = t.pts[i]!;
    const rows: [number[], number][] = [
      [[x, y, 1, 0, 0, 0, -u * x, -u * y], u],
      [[0, 0, 0, x, y, 1, -v * x, -v * y], v],
    ];
    for (const [row, rhs] of rows) {
      for (let a = 0; a < 8; a++) {
        Atb[a]! += row[a]! * rhs;
        for (let b = 0; b < 8; b++) AtA[a]![b]! += row[a]! * row[b]!;
      }
    }
  });
  const h = solve(AtA, Atb);
  if (!h) return null;
  const Hn = [...h, 1];
  const inv = invertH(t.T);
  if (!inv) return null;
  return normalizeH(mulH(inv, mulH(Hn, s.T)));
}

/** Transformation affine (3 correspondances) exprimée comme homographie. */
export function fitAffine(src: Point[], dst: Point[]): Homography | null {
  const A = src.map(([x, y]) => [x, y, 1]);
  const px = solve(A, dst.map((p) => p[0]));
  const py = solve(A, dst.map((p) => p[1]));
  return px && py ? [...px, ...py, 0, 0, 1] : null;
}

export function mulH(A: Homography, B: Homography): Homography {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c]! += A[r * 3 + k]! * B[k * 3 + c]!;
  return out;
}

export function invertH(m: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  return normalizeH([A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det));
}

function normalizeH(m: Homography): Homography {
  const s = m[8]!;
  return Math.abs(s) > 1e-15 ? m.map((v) => v / s) : m;
}
