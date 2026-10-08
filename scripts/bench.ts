import { decode } from '../src/decoder/decode';
import { binarize } from '../src/decoder/binarize';
import { labelComponents } from '../src/decoder/components';
import { findFinderCandidates } from '../src/decoder/decode';
import { scene } from '../tests/helpers/scene';
const { image } = scene('K7f3Qx2a', { cellPx: 10, width: 960, height: 540, angle: 20, surround: 125, noise: 6 });
for (let i = 0; i < 3; i++) {
  let t = performance.now();
  const b = binarize(image); const tb = performance.now() - t; t = performance.now();
  const { comps } = labelComponents(b.bin, image.width, image.height); const tl = performance.now() - t; t = performance.now();
  const f = findFinderCandidates(comps); const tf = performance.now() - t; t = performance.now();
  const r = decode(image); const td = performance.now() - t;
  console.log(`binarize ${tb.toFixed(0)} ms, composantes ${tl.toFixed(0)} ms (${comps.length}), repères ${tf.toFixed(0)} ms (${f.length}), decode total ${td.toFixed(0)} ms → ${r?.id}`);
}
const empty = scene('K7f3Qx2a', { cellPx: 10, width: 960, height: 540, offset: [5000, 0], surround: 125, noise: 6 }).image;
let t = performance.now(); decode(empty); console.log('image sans code', (performance.now() - t).toFixed(0), 'ms');
