import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encoder';
import { decode } from '../src/decoder/decode';
import { mergedOutline, renderSvg } from '../src/render/svg';
import { rasterizeSvg } from './helpers/svgRaster';

const CELL_AREA = Math.sqrt(3) / 4;
const signedArea = (loop: [number, number][]) =>
  loop.reduce((s, p, i) => {
    const q = loop[(i + 1) % loop.length]!;
    return s + (p[0] * q[1] - q[0] * p[1]) / 2;
  }, 0);

describe('rendu SVG', () => {
  const cells = encode('K7f3Qx2a');

  it('fusionne les cellules sans perte de surface', () => {
    const loops = mergedOutline(cells);
    const area = Math.abs(loops.reduce((s, l) => s + signedArea(l), 0));
    expect(area).toBeCloseTo(cells.filter(Boolean).length * CELL_AREA, 6);
    // Bien moins de contours que de cellules sombres : les arêtes internes ont disparu.
    expect(loops.length).toBeLessThan(cells.filter(Boolean).length / 3);
  });

  it('produit un SVG valide avec les options de style', () => {
    const svg = renderSvg(cells, { foreground: '#1b2a6b', background: 'none', width: 300, inset: 0.1 });
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 28 24\.785"/);
    expect(svg).toContain('fill="#1b2a6b"');
    expect(svg).not.toContain('<rect');
  });

  it('exporte un SVG qui se décode (TRG-06)', () => {
    for (const inset of [0, 0.15]) {
      const img = rasterizeSvg(renderSvg(cells, { inset }), 300);
      expect(decode(img)?.id).toBe('K7f3Qx2a');
    }
  });
});
