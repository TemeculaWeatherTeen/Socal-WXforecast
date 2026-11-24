// Network inputs: ONE analysis snapshot (GFS via Open-Meteo) and 1.5 km terrain (MapTiler terrain-RGB).
import { BOX, STEP, NLON, NLAT, LV, NL, ST, W, H, NC, colLon, rowLat } from './config.js';
const dew = (T, rh) => { const g = Math.log(rh / 100) + 17.67 * T / (243.5 + T); return 243.5 * g / (17.67 - g); };

export async function loadAnalysis(status, { hours = 1, chunk = 25, delay = 0 } = {}) {
  const lat = [], lon = [], R = [], sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let a = 0; a < NLAT; a++) for (let b = 0; b < NLON; b++) { lat.push(BOX.S + a * STEP); lon.push(BOX.W + b * STEP); }
  const sfc = 'temperature_2m,dew_point_2m,surface_pressure,wind_speed_10m,wind_direction_10m',
    pl = ['temperature', 'relative_humidity', 'wind_speed', 'wind_direction', 'geopotential_height'].flatMap(v => LV.map(l => `${v}_${l}hPa`)).join(',');
  for (let s = 0; s < lat.length; s += chunk) {
    status(`Downloading GFS columns ${s}/${lat.length}…`);
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.slice(s, s + chunk)}&longitude=${lon.slice(s, s + chunk)}&hourly=${sfc},${pl}&models=gfs_seamless&forecast_hours=${hours}&wind_speed_unit=ms&timezone=GMT`;
    let j; for (let tries = 0; ; tries++) {
      const r = await fetch(u); j = await r.json();
      if (!j.error) break; if (tries > 4) throw new Error(j.reason);
      status(`API said: ${j.reason}; waiting…`); await sleep(65000);
    }
    (Array.isArray(j) ? j : [j]).forEach((x, k) => R[s + k] = x); if (delay) await sleep(delay);
  }
  const rad = Math.PI / 180, b = 5 * NL, npts = R.length, nh = R[0].hourly.time.length, ana = new Float32Array(nh * npts * ST);
  for (let h = 0; h < nh; h++) R.forEach((x, p) => {
    const o = x.hourly, f = ana.subarray((h * npts + p) * ST, (h * npts + p + 1) * ST);
    LV.forEach((l, k) => {
      const T = o[`temperature_${l}hPa`][h], sp = o[`wind_speed_${l}hPa`][h], d = o[`wind_direction_${l}hPa`][h] * rad;
      f[k] = T; f[NL + k] = dew(T, Math.max(1, o[`relative_humidity_${l}hPa`][h])); f[2 * NL + k] = -sp * Math.sin(d); f[3 * NL + k] = -sp * Math.cos(d); f[4 * NL + k] = o[`geopotential_height_${l}hPa`][h];
    });
    const d = o.wind_direction_10m[h] * rad, s = o.wind_speed_10m[h];
    f[b] = o.temperature_2m[h]; f[b + 1] = o.dew_point_2m[h]; f[b + 2] = o.surface_pressure[h]; f[b + 3] = -s * Math.sin(d); f[b + 4] = -s * Math.cos(d); f[b + 7] = x.elevation;
  });
  return { ana, T0: Date.parse(R[0].hourly.time[0] + 'Z'), npts, nh };
}

export async function loadTerrain(KEY) {
  const ZT = new Float32Array(NC).fill(NaN), Z = 8, N2 = 1 << Z, tx = l => (l + 180) / 360 * N2,
    ty = a => { a *= Math.PI / 180; return (1 - Math.log(Math.tan(a) + 1 / Math.cos(a)) / Math.PI) / 2 * N2; };
  const x0 = Math.floor(tx(BOX.W)), x1 = Math.floor(tx(BOX.E)), y0 = Math.floor(ty(BOX.N)), y1 = Math.floor(ty(BOX.S));
  const cv = document.createElement('canvas'); cv.width = (x1 - x0 + 1) * 256; cv.height = (y1 - y0 + 1) * 256;
  const cx = cv.getContext('2d', { willReadFrequently: true }), jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(new Promise(ok => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { cx.drawImage(im, (x - x0) * 256, (y - y0) * 256); ok(); }; im.onerror = ok;
    im.src = `https://api.maptiler.com/tiles/terrain-rgb-v2/${Z}/${x}/${y}.webp?key=${KEY}`;
  }));
  await Promise.all(jobs); const d = cx.getImageData(0, 0, cv.width, cv.height).data;
  for (let r = 0; r < H; r++) {
    const gy = Math.floor((ty(rowLat[r]) - y0) * 256);
    for (let i = 0; i < W; i++) { const o = (gy * cv.width + Math.floor((tx(colLon[i]) - x0) * 256)) * 4; if (d[o + 3]) ZT[r * W + i] = -10000 + (d[o] * 65536 + d[o + 1] * 256 + d[o + 2]) * .1; }
  }
  return ZT;
}
