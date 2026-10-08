/**
 * Scanner KYcode : caméra arrière → Web Worker de décodage → résultat.
 * ?demo dans l'URL remplace la caméra par une vidéo synthétique (code en mouvement), pour les essais sans téléphone.
 */
import { encode } from '../../src/core/encoder';
import { N } from '../../src/core/geometry';
import { applyH, type Point } from '../../src/decoder/homography';
import { renderSvg } from '../../src/render/svg';
import { describeTestId, redirectUrl } from './config';
import { DecoderClient, grabFrame } from './decoder-client';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const overlay = $<HTMLCanvasElement>('overlay');
const hint = $('hint');
const stats = $('stats');
const sheet = $('sheet');

const FRAME_MAX_SIDE = 960;
const decoder = new DecoderClient();
const frameCanvas = document.createElement('canvas');
let scanning = false;

interface HistoryEntry {
  id: string;
  at: string;
  ms: number;
  corrected: number;
  erasures: number;
  source: 'caméra' | 'photo';
}
const HISTORY_KEY = 'kycode.scan.history';
const history: HistoryEntry[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryEntry[];
  } catch {
    return [];
  }
})();

// ---------- Démarrage de la caméra ----------

async function startCamera() {
  const err = $('startError');
  err.hidden = true;
  try {
    const demo = new URLSearchParams(location.search).has('demo');
    video.srcObject = demo
      ? await demoStream()
      : await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
    await video.play();
    $('start').hidden = true;
    $('controls').hidden = false;
    resume();
  } catch (e) {
    err.hidden = false;
    err.textContent = !window.isSecureContext
      ? 'La caméra exige une connexion HTTPS (ou localhost).'
      : e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur.'
        : `Caméra indisponible : ${(e as Error).message}`;
  }
}

// ---------- Boucle de scan ----------

let frames = 0;
let lastStatsAt = performance.now();
let lastMs = 0;

async function loop() {
  while (scanning) {
    if (video.readyState < 2 || video.videoWidth === 0) {
      await nextFrame();
      continue;
    }
    const { image, scale } = grabFrame(video, video.videoWidth, video.videoHeight, FRAME_MAX_SIDE, frameCanvas);
    const res = await decoder.decode(image);
    if (!scanning) break;
    frames++;
    lastMs = res.ms;
    updateStats();
    const toVideo = (p: Point): Point => [p[0] / scale, p[1] / scale];
    if (res.result) {
      const H = res.result.homography;
      // L'image a pu bouger pendant le décodage : on fige à l'écran l'image décodée sous le contour.
      drawOverlay(symbolOutline().map((p) => toVideo(applyH(H, p[0], p[1]))), '#2ee66b', frameCanvas);
      showResult(res.result.id, res.ms, res.result.corrected, res.result.erasures, 'caméra');
      return;
    }
    const seen = res.diagnostics.finderCandidates.map(toVideo);
    drawMarkers(seen);
    setHint(
      seen.length === 0
        ? 'Visez un KYcode'
        : seen.length < 3
          ? `Repères vus : ${seen.length}/3 — cadrez tout le triangle`
          : 'Approchez-vous et restez stable',
    );
  }
}

function resume() {
  sheet.hidden = true;
  scanning = true;
  clearOverlay();
  void loop();
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function updateStats() {
  const now = performance.now();
  if (now - lastStatsAt < 1000) return;
  stats.textContent = `${((frames * 1000) / (now - lastStatsAt)).toFixed(1)} img/s · ${lastMs.toFixed(0)} ms`;
  frames = 0;
  lastStatsAt = now;
}

function setHint(text: string) {
  hint.hidden = false;
  hint.textContent = text;
}

// ---------- Affichage ----------

const H_SYMBOL = (N * Math.sqrt(3)) / 2;
const symbolOutline = (): Point[] => [[N / 2, 0], [N, H_SYMBOL], [0, H_SYMBOL]];

/** Prépare le canvas superposé et renvoie la conversion coordonnées vidéo → écran (object-fit: cover). */
function prepareOverlay() {
  const dpr = window.devicePixelRatio || 1;
  const w = overlay.clientWidth;
  const h = overlay.clientHeight;
  overlay.width = Math.round(w * dpr);
  overlay.height = Math.round(h * dpr);
  const g = overlay.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const s = Math.max(w / video.videoWidth, h / video.videoHeight);
  const ox = (w - video.videoWidth * s) / 2;
  const oy = (h - video.videoHeight * s) / 2;
  const freeze = (frame: CanvasImageSource) => g.drawImage(frame, ox, oy, video.videoWidth * s, video.videoHeight * s);
  return { g, freeze, map: (p: Point): Point => [ox + p[0] * s, oy + p[1] * s] };
}

function clearOverlay() {
  if (video.videoWidth) prepareOverlay();
}

function drawOverlay(poly: Point[], color: string, frame?: CanvasImageSource) {
  const { g, map, freeze } = prepareOverlay();
  if (frame) freeze(frame);
  g.beginPath();
  poly.map(map).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.lineWidth = 4;
  g.strokeStyle = color;
  g.lineJoin = 'round';
  g.stroke();
}

function drawMarkers(points: Point[]) {
  const { g, map } = prepareOverlay();
  g.fillStyle = 'rgba(255, 210, 0, 0.9)';
  for (const p of points.map(map)) {
    g.beginPath();
    g.arc(p[0], p[1], 7, 0, Math.PI * 2);
    g.fill();
  }
}

function showResult(id: string, ms: number, corrected: number, erasures: number, source: HistoryEntry['source']) {
  scanning = false;
  hint.hidden = true;
  navigator.vibrate?.(60);
  $('resultId').textContent = id;
  const test = describeTestId(id);
  $('resultTest').textContent = test ?? '';
  $('resultTest').hidden = !test;
  const quality = erasures > 0 ? `${erasures} octet(s) douteux effacé(s)` : corrected > 0 ? `${corrected} octet(s) corrigé(s)` : 'lecture franche';
  $('resultMeta').textContent = `${ms.toFixed(0)} ms · ${quality} · source : ${source}`;
  const link = $<HTMLAnchorElement>('resultLink');
  link.href = redirectUrl(id);
  link.hidden = !!test;
  history.unshift({ id, at: new Date().toISOString(), ms: Math.round(ms), corrected, erasures, source });
  history.length = Math.min(history.length, 200);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Stockage indisponible (navigation privée) : l'historique reste en mémoire.
  }
  renderHistory();
  sheet.hidden = false;
}

function renderHistory() {
  $('historyCount').textContent = String(history.length);
  $('history').replaceChildren(
    ...history.slice(0, 50).map((h) => {
      const li = document.createElement('li');
      const test = describeTestId(h.id);
      li.textContent = `${new Date(h.at).toLocaleTimeString()} — ${h.id}${test ? ` (${test.replace('Code de test : ', '')})` : ''} — ${h.ms} ms, corr. ${h.corrected}, eff. ${h.erasures}, ${h.source}`;
      return li;
    }),
  );
}

// ---------- Photo importée ----------

async function decodeFile(file: File) {
  scanning = false;
  const bitmap = await createImageBitmap(file);
  const { image } = grabFrame(bitmap, bitmap.width, bitmap.height, 1600);
  const res = await decoder.decode(image);
  if (res.result) {
    clearOverlay();
    showResult(res.result.id, res.ms, res.result.corrected, res.result.erasures, 'photo');
  } else {
    const n = res.diagnostics.finderCandidates.length;
    setHint(`Aucun KYcode lisible dans la photo (repères vus : ${Math.min(n, 3)}/3)`);
    setTimeout(resume, 2500);
  }
}

// ---------- Caméra de démonstration ----------

async function demoStream(): Promise<MediaStream> {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const g = canvas.getContext('2d')!;
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([renderSvg(encode('K7f3Qx2a'), { width: 600 })], { type: 'image/svg+xml' }));
  await img.decode();
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#7d8590';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.translate(640 + Math.sin(t * 0.7) * 180, 360 + Math.cos(t * 0.5) * 60);
    g.rotate(t * 0.6);
    g.transform(1, 0, Math.sin(t) * 0.25, 1, 0, 0);
    const s = 0.55 + 0.25 * Math.sin(t * 0.4);
    g.scale(s, s);
    g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    requestAnimationFrame(draw);
  };
  draw();
  return canvas.captureStream(30);
}

// ---------- Événements ----------

$('startBtn').addEventListener('click', () => void startCamera());
$('again').addEventListener('click', resume);
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void decodeFile(f);
  (e.target as HTMLInputElement).value = '';
});
$('copyHistory').addEventListener('click', () => {
  const lines = history.map((h) => [h.at, h.id, describeTestId(h.id) ?? '', h.ms, h.corrected, h.erasures, h.source].join('\t'));
  void navigator.clipboard?.writeText(['date\tid\ttest\tms\tcorrigés\teffacés\tsource', ...lines].join('\n'));
});
renderHistory();
if (new URLSearchParams(location.search).has('demo')) void startCamera();
