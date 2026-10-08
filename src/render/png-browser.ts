/** Export PNG dans le navigateur : rasterise un SVG via un canvas. */

export async function svgToCanvas(svg: string, widthPx: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = Math.round((widthPx * img.naturalHeight) / img.naturalWidth);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function svgToPngBlob(svg: string, widthPx: number): Promise<Blob> {
  const canvas = await svgToCanvas(svg, widthPx);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('échec de l’export PNG'))), 'image/png'),
  );
}
