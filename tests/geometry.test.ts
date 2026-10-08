import { describe, expect, it } from 'vitest';
import { allCells, buildLayout, cellAt, cellFromBary, DATA_CELLS, N, rotate } from '../src/core/geometry';

describe('géométrie KYcode v0', () => {
  const layout = buildLayout();
  const count = (zone: string) => layout.filter((c) => c.zone === zone).length;

  it('contient N² cellules', () => {
    expect(allCells()).toHaveLength(N * N);
  });

  it('répartit les zones comme la spec §4', () => {
    expect(count('finder')).toBe(243);
    expect(count('separator')).toBe(57);
    expect(count('align')).toBe(36);
    expect(count('data')).toBe(DATA_CELLS);
  });

  it('a des repères de 45 sombres / 27 clairs / 9 sombres', () => {
    const finders = layout.filter((c) => c.zone === 'finder');
    expect(finders.filter((c) => c.dark)).toHaveLength(3 * (45 + 9));
    const align = layout.filter((c) => c.zone === 'align');
    expect(align.filter((c) => !c.dark)).toHaveLength(9);
  });

  it('convertit aller-retour entre (r,c) et barycentriques', () => {
    for (const cell of allCells()) {
      expect(cellFromBary(cell.a, cell.b, cell.g)).toEqual(cell);
    }
  });

  it('a des motifs fonctionnels invariants par rotation de 120°', () => {
    const byKey = new Map(layout.map((c) => [`${c.r},${c.c}`, c]));
    for (const cell of layout) {
      const rot = byKey.get(`${rotate(cell).r},${rotate(cell).c}`)!;
      expect(rot.zone).toBe(cell.zone);
      expect(rot.dark).toBe(cell.dark);
    }
  });

  it('fait trois rotations pour revenir au point de départ', () => {
    const cell = cellAt(17, 9);
    expect(rotate(cell, 3)).toEqual(cell);
    expect(rotate(rotate(cell))).toEqual(rotate(cell, 2));
  });
});
