/** Image en niveaux de gris, 0 = noir, 255 = blanc. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function createGray(width: number, height: number, fill = 255): GrayImage {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(fill) };
}

/** Convertit une image RGBA (ImageData de canvas, par exemple) en niveaux de gris (luma Rec. 601). */
export function rgbaToGray(rgba: { width: number; height: number; data: ArrayLike<number> }): GrayImage {
  const { width, height, data } = rgba;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const alpha = (data[j + 3] ?? 255) / 255;
    const luma = 0.299 * data[j]! + 0.587 * data[j + 1]! + 0.114 * data[j + 2]!;
    // Un pixel transparent est considéré blanc (fond d'un SVG sans rectangle).
    out[i] = luma * alpha + 255 * (1 - alpha);
  }
  return { width, height, data: out };
}
