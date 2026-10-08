/** Web Worker : décode les images envoyées par la page sans bloquer l'affichage. */
import { decode, type DecodeDiagnostics, type DecodeResult } from '../../src/decoder/decode';
import { rgbaToGray } from '../../src/decoder/image';

export interface DecodeRequest {
  id: number;
  width: number;
  height: number;
  data: ArrayBuffer;
}

export interface DecodeResponse {
  id: number;
  result: DecodeResult | null;
  diagnostics: DecodeDiagnostics;
  ms: number;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<DecodeRequest>) => void) | null;
  postMessage(msg: DecodeResponse): void;
};

ctx.onmessage = (e) => {
  const { id, width, height, data } = e.data;
  const t0 = performance.now();
  const diagnostics: DecodeDiagnostics = { finderCandidates: [] };
  const result = decode(rgbaToGray({ width, height, data: new Uint8ClampedArray(data) }), diagnostics);
  ctx.postMessage({ id, result, diagnostics, ms: performance.now() - t0 });
};
