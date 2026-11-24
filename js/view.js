// Map, colour drawing, slider/play/legend/hover.
import { BOX, FD, W, H, NC, yN, yS, mer, $ } from './config.js';
import { unpack } from './model.js';
const GEN = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
// GRLevelX-style table (BR, dBZ): value, r,g,b,a at this value, r,g,b,a just below the next value
const CT = [[-30, 116, 78, 173, 0, 147, 141, 117, 255], [-20, 150, 145, 83, 255, 210, 212, 180, 255], [-10, 204, 207, 180, 255, 65, 91, 158, 255], [10, 67, 97, 162, 255, 106, 208, 228, 255],
  [18, 111, 214, 232, 255, 53, 213, 91, 255], [22, 17, 213, 24, 255, 9, 94, 9, 255], [35, 29, 104, 9, 255, 234, 210, 4, 255], [40, 255, 226, 0, 255, 255, 128, 0, 255],
  [50, 255, 0, 0, 255, 113, 0, 0, 255], [60, 255, 255, 255, 255, 255, 146, 255, 255], [65, 255, 117, 255, 255, 225, 11, 227, 255], [70, 178, 0, 255, 255, 99, 0, 214, 255],
  [75, 5, 236, 240, 255, 1, 32, 32, 255], [85, 1, 32, 32, 255, 1, 32, 32, 255], [95, 1, 32, 32, 255, 1, 32, 32, 255]];
export function dbzColor(v) {
  if (v < -30) return null; let k = 0; while (k < CT.length - 1 && v >= CT[k + 1][0]) k++;
  const e = CT[k], nx = CT[k + 1], t = nx ? Math.min(1, (v - e[0]) / (nx[0] - e[0])) : 0;
  return [0, 1, 2, 3].map(i => e[1 + i] + (e[5 + i] - e[1 + i]) * t);
}
function gen(t, rev) { t = Math.max(0, Math.min(1, t)); if (rev) t = 1 - t; const x = t * 4, k = Math.min(3, Math.floor(x)), f = x - k, a = GEN[k], b = GEN[k + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
export const ui = { frames: [], T0: 0, follow: true, hour: 0, cur: null, load: null, terrain: null };
const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H; cvs.style.display = 'none'; document.body.appendChild(cvs);
const cx = cvs.getContext('2d'), img = cx.createImageData(W, H);

export function draw() {
  if (!ui.cur) return; const f = FD.find(x => x[0] == $('fs').value), a = ui.cur[f[0]], d = img.data;
  for (let c = 0; c < NC; c++) {
    const v = a[c], o = c * 4; let rgb, al = 190;
    if (isNaN(v) || (f[6] != null && !(v >= f[6]))) al = 0;
    else if (f[0] == 'dbz') { const q = dbzColor(v); if (!q) al = 0; else { rgb = q; al = q[3] * .75; } } else rgb = gen((v - f[3]) / (f[4] - f[3]), f[5]);
    if (al) { d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; } d[o + 3] = al;
  }
  cx.putImageData(img, 0, 0);
  const cs = f[0] == 'dbz' ? Array.from({ length: 26 }, (_, i) => { const v = -30 + i * 5, q = dbzColor(v); return `rgba(${q.map(Math.round)}) ${(i * 4)}%`; }) : [0, .25, .5, .75, 1].map(t => `rgb(${gen(t, f[5]).map(Math.round)})`);
  $('lg').style.background = `linear-gradient(90deg,${cs})`; $('lt').textContent = `${f[1]}: ${f[3]} to ${f[4]} ${f[2]}`;
}
export async function showFrame(h) {
  ui.hour = h; $('hr').value = h;
  if (!ui.frames[h] && ui.load) ui.frames[h] = await ui.load(h);   // frames from the Action are fetched on demand
  if (ui.hour !== h) return; ui.cur = unpack(ui.frames[h]);
  $('tl').textContent = `+${h} h · ` + new Date(ui.T0 + h * 36e5).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' }) + ' PT';
  draw();
}
export function setupControls() {
  FD.forEach(f => $('fs').add(new Option(f[1], f[0]))); $('fs').onchange = draw;
  $('hr').oninput = e => { ui.follow = false; showFrame(+e.target.value); };
  let timer = null;
  $('pl').onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $('pl').textContent = 'Play'; return; }
    ui.follow = false; $('pl').textContent = 'Pause';
    timer = setInterval(() => { const m = +$('hr').max; showFrame(ui.hour + 1 > m ? 0 : ui.hour + 1); }, 600);
  };
}
export function makeMap(KEY) {
  maptilersdk.config.apiKey = KEY;
  const map = new maptilersdk.Map({ container: 'map', style: maptilersdk.MapStyle.STREETS, center: [-117.8, 33.8], zoom: 7 });
  map.on('mousemove', e => {
    if (!ui.cur) return; const c = Math.floor((e.lngLat.lng - BOX.W) / (BOX.E - BOX.W) * W), r = Math.floor((yN - mer(e.lngLat.lat)) / (yN - yS) * H);
    if (c < 0 || r < 0 || c >= W || r >= H) return; const k = r * W + c;
    $('info').textContent = FD.map(f => `${f[1].padEnd(15)}${isNaN(ui.cur[f[0]][k]) ? '—' : ui.cur[f[0]][k].toFixed(1)} ${f[2]}`).join('\n') + `\n${'Terrain'.padEnd(15)}${ui.terrain ? ui.terrain[k].toFixed(0) : '—'} m`;
  });
  return map;
}
export function addOverlay(map) {
  map.addSource('wx', { type: 'canvas', canvas: cvs, animate: true, coordinates: [[BOX.W, BOX.N], [BOX.E, BOX.N], [BOX.E, BOX.S], [BOX.W, BOX.S]] });
  map.addLayer({ id: 'wx', type: 'raster', source: 'wx', paint: { 'raster-opacity': .8, 'raster-resampling': 'nearest' } });
}
