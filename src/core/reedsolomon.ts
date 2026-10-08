/**
 * Reed-Solomon sur GF(256), polynôme primitif 0x11D, α = 2, racines α^0 … α^(nsym-1) (spec §5.3).
 * Un mot de code est un tableau d'octets : l'octet 0 est le coefficient de plus haut degré.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}

export function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!;
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('division par zéro dans GF(256)');
  return a === 0 ? 0 : EXP[(LOG[a]! + 255 - LOG[b]!) % 255]!;
}

export function gfPow(e: number): number {
  return EXP[((e % 255) + 255) % 255]!;
}

/** Évalue un polynôme stocké du degré bas au degré haut. */
function evalLow(p: number[], x: number): number {
  let y = 0;
  for (let i = p.length - 1; i >= 0; i--) y = gfMul(y, x) ^ p[i]!;
  return y;
}

const generatorCache = new Map<number, number[]>();

/** Générateur ∏ (x − α^i), stocké du degré haut au degré bas, coefficient dominant 1. */
function generator(nsym: number): number[] {
  let g = generatorCache.get(nsym);
  if (!g) {
    g = [1];
    for (let i = 0; i < nsym; i++) {
      const next = new Array<number>(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        next[j] = next[j]! ^ g[j]!;
        next[j + 1] = next[j + 1]! ^ gfMul(g[j]!, gfPow(i));
      }
      g = next;
    }
    generatorCache.set(nsym, g);
  }
  return g;
}

/** Codage systématique : renvoie données + nsym octets de contrôle. */
export function rsEncode(data: Uint8Array, nsym: number): Uint8Array {
  const g = generator(nsym);
  const out = new Uint8Array(data.length + nsym);
  out.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = out[i]!;
    if (coef === 0) continue;
    for (let j = 1; j < g.length; j++) out[i + j] = out[i + j]! ^ gfMul(g[j]!, coef);
  }
  out.set(data);
  return out;
}

function syndromes(cw: Uint8Array, nsym: number): number[] {
  const s: number[] = [];
  for (let j = 0; j < nsym; j++) {
    const x = gfPow(j);
    let y = 0;
    for (const byte of cw) y = gfMul(y, x) ^ byte;
    s.push(y);
  }
  return s;
}

export interface RsResult {
  data: Uint8Array;
  /** Nombre d'octets corrigés. */
  corrected: number;
}

function mulLow(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] = out[i + j]! ^ gfMul(a[i]!, b[j]!);
  return out;
}

/** Berlekamp-Massey sur une suite de syndromes → localisateur Λ (degré bas → haut) et son degré L. */
function berlekampMassey(S: number[]): { locator: number[]; L: number } {
  let C = [1];
  let B = [1];
  let L = 0;
  let m = 1;
  let b = 1;
  for (let i = 0; i < S.length; i++) {
    let d = S[i]!;
    for (let j = 1; j <= L; j++) d ^= gfMul(C[j] ?? 0, S[i - j]!);
    if (d === 0) {
      m++;
      continue;
    }
    const coef = gfDiv(d, b);
    const next = C.slice();
    for (let j = 0; j < B.length; j++) {
      while (next.length <= j + m) next.push(0);
      next[j + m] = next[j + m]! ^ gfMul(coef, B[j]!);
    }
    if (2 * L <= i) {
      B = C;
      L = i + 1 - L;
      b = d;
      m = 1;
    } else {
      m++;
    }
    C = next;
  }
  while (C.length > 1 && C[C.length - 1] === 0) C.pop();
  return { locator: C, L };
}

/**
 * Décode un mot de code. Renvoie null s'il est incorrigible.
 * `erasures` : indices d'octets dont la valeur est douteuse (effacements).
 * Capacité : 2 × erreurs + effacements ≤ nsym.
 */
export function rsDecode(codeword: Uint8Array, nsym: number, erasures: readonly number[] = []): RsResult | null {
  const n = codeword.length;
  const e = erasures.length;
  if (e > nsym) return null;
  const cw = Uint8Array.from(codeword);
  const S = syndromes(cw, nsym);
  if (S.every((s) => s === 0)) return { data: cw.slice(0, n - nsym), corrected: 0 };

  // Localisateur des effacements Γ(x) = ∏ (1 + X x), X = α^(n-1-i).
  let gamma = [1];
  for (const i of erasures) gamma = mulLow(gamma, [1, gfPow(n - 1 - i)]);

  // Syndromes de Forney : les effacements s'annulent, BM ne cherche plus que les erreurs.
  const T = mulLow(S, gamma).slice(0, nsym);
  const { locator: lambda, L } = berlekampMassey(T.slice(e));
  if (lambda.length - 1 !== L || 2 * L + e > nsym) return null;
  const psi = mulLow(lambda, gamma);

  // Recherche de Chien : position i ↔ puissance p = n-1-i, racine de Ψ en α^(-p).
  const positions: number[] = [];
  for (let p = 0; p < n; p++) if (evalLow(psi, gfPow(-p)) === 0) positions.push(p);
  if (positions.length !== L + e) return null;

  // Évaluateur Ω(x) = S(x)Ψ(x) mod x^nsym, puis formule de Forney (première racine α^0).
  const omega = mulLow(S, psi).slice(0, nsym);
  const deriv = psi.map((c, i) => (i % 2 === 1 ? c : 0)).slice(1);
  let corrected = 0;
  for (const p of positions) {
    const X = gfPow(p);
    const Xinv = gfPow(-p);
    const denom = evalLow(deriv, Xinv);
    if (denom === 0) return null;
    const magnitude = gfMul(X, gfDiv(evalLow(omega, Xinv), denom));
    const idx = n - 1 - p;
    if (magnitude !== 0) corrected++;
    cw[idx] = cw[idx]! ^ magnitude;
  }

  if (syndromes(cw, nsym).some((s) => s !== 0)) return null;
  return { data: cw.slice(0, n - nsym), corrected };
}
