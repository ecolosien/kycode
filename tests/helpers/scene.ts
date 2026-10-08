import { encode } from '../../src/core/encoder';
import { N } from '../../src/core/geometry';
import { fitHomography, type Point } from '../../src/decoder/homography';
import { renderScene, type SceneOptions } from '../../src/render/raster';

export interface SceneSpec extends Partial<Omit<SceneOptions, 'transform'>> {
  /** Taille d'un côté de cellule en pixels. */
  cellPx?: number;
  /** Rotation en degrés. */
  angle?: number;
  /** Trapèze : 0 = vue de face, 0.3 = bord haut 30 % plus court (perspective). */
  keystone?: number;
  /** Décalage du centre en pixels. */
  offset?: Point;
}

const H = (N * Math.sqrt(3)) / 2;

export function scene(id: string, spec: SceneSpec = {}, cells = encode(id)) {
  const cellPx = spec.cellPx ?? 10;
  const width = spec.width ?? Math.ceil((N + 8) * cellPx);
  const height = spec.height ?? width;
  const angle = ((spec.angle ?? 0) * Math.PI) / 180;
  const k = spec.keystone ?? 0;
  const [ox, oy] = spec.offset ?? [0, 0];
  // Boîte englobante du symbole → quadrilatère image (trapèze, puis rotation, échelle, centrage).
  const src: Point[] = [[0, 0], [N, 0], [N, H], [0, H]];
  const local: Point[] = src.map(([x, y]) => {
    const shrink = 1 - k * (1 - y / H);
    return [(x - N / 2) * shrink, y - H / 2];
  });
  const dst = local.map(([x, y]) => [
    width / 2 + ox + cellPx * (x * Math.cos(angle) - y * Math.sin(angle)),
    height / 2 + oy + cellPx * (x * Math.sin(angle) + y * Math.cos(angle)),
  ] as Point);
  const transform = fitHomography(src, dst)!;
  return { image: renderScene(cells, { ...spec, width, height, transform }), cells };
}
