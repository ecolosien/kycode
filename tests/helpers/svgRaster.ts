import type { GrayImage } from '../../src/decoder/image';

/**
 * Rasteriseur minimal pour les SVG produits par renderSvg (un <rect> de fond + un <path> M/L/Z),
 * règle de remplissage non nulle, suréchantillonnage vertical. Sert à vérifier l'export sans navigateur.
 */
export function rasterizeSvg(svg: string, widthPx: number): GrayImage {
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
  const vbW = Number(vb[1]);
  const vbH = Number(vb[2]);
  const scale = widthPx / vbW;
  const height = Math.ceil(vbH * scale);
  const d = svg.match(/<path[^>]* d="([^"]*)"/)![1]!;
  const edges: [number, number, number, number][] = [];
  for (const sub of d.split('Z').filter(Boolean)) {
    const pts = sub.replace('M', '').split('L').map((p) => p.split(' ').map((v) => Number(v) * scale) as [number, number]);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      edges.push([p[0], p[1], q[0], q[1]]);
    });
  }
  const data = new Uint8ClampedArray(widthPx * height);
  const SS = 4;
  const acc = new Float32Array(widthPx);
  for (let y = 0; y < height; y++) {
    acc.fill(0);
    for (let s = 0; s < SS; s++) {
      const sy = y + (s + 0.5) / SS;
      const xs: [number, number][] = [];
      for (const [x0, y0, x1, y1] of edges) {
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push([x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0), y1 > y0 ? 1 : -1]);
      }
      xs.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i]![1];
        if (wind === 0) continue;
        const a = xs[i]![0];
        const b = xs[i + 1]![0];
        for (let x = Math.max(0, Math.floor(a)); x < Math.min(widthPx, Math.ceil(b)); x++) {
          acc[x]! += Math.max(0, Math.min(b, x + 1) - Math.max(a, x)) / SS;
        }
      }
    }
    for (let x = 0; x < widthPx; x++) data[y * widthPx + x] = 255 * (1 - Math.min(1, acc[x]!));
  }
  return { width: widthPx, height, data };
}
