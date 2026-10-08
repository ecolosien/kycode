/** KYcode Triangle — API publique. */
export { encode, type KYMatrix } from './core/encoder';
export { idToNumber, numberToId, randomId, ID_LENGTH } from './core/payload';
export { renderSvg, type SvgOptions } from './render/svg';
export { decode, type DecodeDiagnostics, type DecodeResult } from './decoder/decode';
export { rgbaToGray, type GrayImage } from './decoder/image';
