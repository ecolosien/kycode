/** Accès au Web Worker de décodage avec une API à promesses. */
import type { DecodeRequest, DecodeResponse } from './decode-worker';

export class DecoderClient {
  private worker = new Worker(new URL('./decode-worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, (r: DecodeResponse) => void>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<DecodeResponse>) => {
      this.pending.get(e.data.id)?.(e.data);
      this.pending.delete(e.data.id);
    };
  }

  decode(image: ImageData): Promise<DecodeResponse> {
    const id = this.nextId++;
    const req: DecodeRequest = { id, width: image.width, height: image.height, data: image.data.buffer };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage(req, [image.data.buffer]);
    });
  }
}

/** Dessine une source (vidéo, image) dans un canvas réduit et renvoie ses pixels. */
export function grabFrame(source: CanvasImageSource, srcW: number, srcH: number, maxSide: number, canvas = document.createElement('canvas')) {
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { image: g.getImageData(0, 0, canvas.width, canvas.height), scale };
}
