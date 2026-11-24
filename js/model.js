// Loads the WASM physics core, builds the initial state in its memory, steps it hour by hour.
import { BOX, STEP, NLON, LV, NL, ST, W, H, NC, FD, mid, colLon, rowLat } from './config.js';
const es = T => 6.112 * Math.exp(17.67 * T / (T + 243.5)), rs = (p, T) => { const e = es(T); return .622 * e / (p - e); };
let wasm, S = {};

export async function loadModel(npts, nh = 1, bytes = null) {
  bytes = bytes || await (await fetch('wasm/model.wasm')).arrayBuffer();
  wasm = (await WebAssembly.instantiate(bytes, { env: { abort() { throw new Error('wasm abort'); } } })).instance.exports;
  wasm.init(W, H, npts, nh);
  const buf = wasm.memory.buffer, f32 = ['U', 'V', 'TH', 'TH0', 'Q', 'QC', 'RC', 'PR', 'UBG', 'VBG', 'US', 'VS', 'QFT', 'THSST', 'QSST', 'BOW', 'PS', 'PK', 'PM', 'ZTc', 'SLP'];
  f32.forEach((n, i) => S[n] = new Float32Array(buf, wasm.ptr(i), NC));
  S.MASK = new Uint8Array(buf, wasm.ptr(21), NC); S.IX = new Int32Array(buf, wasm.ptr(22), 4 * NC); S.WT = new Float32Array(buf, wasm.ptr(23), 4 * NC);
  S.ANA = new Float32Array(buf, wasm.ptr(24), npts * nh * ST); S.COLLON = new Float32Array(buf, wasm.ptr(25), W); S.OUT = new Float32Array(buf, wasm.ptr(26), 11 * NC);
  S.THT = new Float32Array(buf, wasm.ptr(27), NC); S.QT = new Float32Array(buf, wasm.ptr(28), NC); S.T2T = new Float32Array(buf, wasm.ptr(29), NC);
}
export const configure = c => wasm.setConfig(c.dt, c.dp, c.muStep, c.blk, c.bw);
export const terrain = () => S.ZTc;

export function setAnalysis(ana) {
  S.ANA.set(ana); S.COLLON.set(colLon);
  for (let r = 0; r < H; r++) for (let i = 0; i < W; i++) {
    const c = 4 * (r * W + i), fx = (colLon[i] - BOX.W) / STEP, fy = (rowLat[r] - BOX.S) / STEP,
      i0 = Math.min(Math.floor(fx), NLON - 2), j0 = Math.min(Math.floor(fy), 6 - 1), tx = fx - i0, ty = fy - j0, b = j0 * NLON + i0;
    S.IX[c] = b; S.IX[c + 1] = b + 1; S.IX[c + 2] = b + NLON; S.IX[c + 3] = b + NLON + 1;
    S.WT[c] = (1 - tx) * (1 - ty); S.WT[c + 1] = tx * (1 - ty); S.WT[c + 2] = (1 - tx) * ty; S.WT[c + 3] = tx * ty;
  }
}

// static fields (terrain, pressure, land/sea) from hour-0 analysis, then dynamic state from the forcing
export function initState(ZT) {
  const b = 5 * NL, { ANA, IX, WT } = S;
  for (let c = 0; c < NC; c++) {
    const j = 4 * c, o0 = IX[j] * ST, o1 = IX[j + 1] * ST, o2 = IX[j + 2] * ST, o3 = IX[j + 3] * ST, a0 = WT[j], a1 = WT[j + 1], a2 = WT[j + 2], a3 = WT[j + 3];
    const g = o => a0 * ANA[o0 + o] + a1 * ANA[o1 + o] + a2 * ANA[o2 + o] + a3 * ANA[o3 + o];
    const zc = g(b + 7), zr = ZT[c], lat = rowLat[(c / W) | 0], lon = colLon[c % W];
    // ocean mask from terrain (Salton Sink is land)
    S.MASK[c] = ((zr <= .5) || (zr !== zr && zc < 1)) && !(lat < 34 && lat > 32.6 && lon > -116.3 && lon < -114.5) ? 1 : 0;
    const zt = zr !== zr ? zc : Math.max(0, zr); S.ZTc[c] = zt;
    const dz = zc - zt, t2 = g(b) + dz * .0065, ps = g(b + 2) * Math.exp(dz / (29.3 * (t2 + 273.15)));
    S.PS[c] = ps; S.PK[c] = Math.pow(ps / 1000, .2857); S.PM[c] = Math.pow((ps - 50) / 1000, .2857);
  }
  for (let r = 1; r < H - 1; r++) for (let i = 1; i < W - 1; i++) { const k = r * W + i; S.SLP[k] = Math.hypot(S.ZTc[k + 1] - S.ZTc[k - 1], S.ZTc[k - W] - S.ZTc[k + W]) / 3000; }
  wasm.updateForcing(0); wasm.initFromForcing();
}

// advance to forecast hour h and return the packed frame (8-bit codes, 0 = no data)
export function runHour(h, T0, cfg) {
  const NSUB = Math.round(3600 / cfg.dt);
  if (h > 0) wasm.updateForcing(h);
  if (h > 0) for (let s = 0; s < NSUB; s++) {
    const t = T0 + ((h - 1) * NSUB + s) * cfg.dt * 1000, yr = new Date(t).getUTCFullYear(), doy = Math.floor((t - Date.UTC(yr, 0, 0)) / 864e5),
      dec = 23.44 * Math.sin(2 * Math.PI * (284 + doy) / 365) * Math.PI / 180, ph = mid * Math.PI / 180;
    wasm.substep((t % 864e5) / 36e5, Math.sin(ph) * Math.sin(dec), Math.cos(ph) * Math.cos(dec));
  }
  wasm.diagAll(h);
  const P = new Uint8Array(FD.length * NC);
  FD.forEach((f, k) => { const lo = f[7], sc = 254 / (f[8] - lo), o = k * NC; for (let c = 0; c < NC; c++) { const v = S.OUT[o + c]; P[o + c] = v !== v ? 0 : 1 + Math.max(0, Math.min(254, Math.round((v - lo) * sc))); } });
  wasm.convInit();
  return P;
}
export function unpack(P) {
  const o = {}; FD.forEach((f, k) => { const a = o[f[0]] = new Float32Array(NC), lo = f[7], sc = (f[8] - lo) / 254; for (let c = 0; c < NC; c++) { const q = P[k * NC + c]; a[c] = q ? lo + (q - 1) * sc : NaN; } });
  return o;
}
