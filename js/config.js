// Shared constants, field table and the 1.5 km grid geometry.
export const BOX = { S: 32.25, N: 35.25, W: -121, E: -114.5 }, STEP = .5, NLON = 14, NLAT = 7, NH = 60;
export const LV = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150], NL = LV.length, ST = NL * 5 + 8;
// browser = quick in-page run; accurate = what the GitHub Action uses (small steps, every-cell parcels, true most-unstable CAPE, GFS edge forcing)
export const PRESETS = { browser: { dt: 600, dp: 30, muStep: 0, blk: 2, bw: 0 }, accurate: { dt: 60, dp: 10, muStep: 25, blk: 1, bw: 10 } };
// key, label, unit, min, max, reverse, transparentBelow, quantMin, quantMax   (order matches the wasm OUT array)
export const FD = [['dbz', 'Reflectivity', 'dBZ', -30, 95, 0, -30, -30, 95], ['etop', 'Echo top (MSL)', 'km', 0, 15, 0, .1, 0, 20], ['vil', 'VIL', 'kg/m²', 0, 40, 0, .1, 0, 80],
  ['ivt', 'IVT', 'kg/m/s', 0, 800, 0, 100, 0, 2000], ['mucape', 'MU CAPE', 'J/kg', 0, 3000, 0, 25, 0, 6000], ['mlcin', 'ML CIN', 'J/kg', -300, 0, 0, null, -1000, 0],
  ['li', 'Lifted index', 'K', -8, 8, 1, null, -15, 15], ['t2m', '2 m temp', '°C', -5, 45, 0, null, -10, 50], ['gust', 'Wind gust', 'm/s', 0, 30, 0, null, 0, 60],
  ['wind', '10 m wind', 'm/s', 0, 20, 0, null, 0, 40], ['pcp', 'Precip rate', 'mm/h', 0, 20, 0, .05, 0, 80]];
export const $ = i => document.getElementById(i), setStatus = m => $('st').textContent = m;
export function getKey() {
  let k = new URLSearchParams(location.search).get('key'); try { k = k || localStorage.mtkey } catch (e) {}
  if (!k) k = prompt('MapTiler API key:'); try { localStorage.mtkey = k } catch (e) {} return k;
}
// grid: rows evenly spaced in Mercator so the canvas overlays the map exactly
export const mer = l => Math.log(Math.tan(Math.PI / 4 + l * Math.PI / 360)), imer = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
export const yN = mer(BOX.N), yS = mer(BOX.S), mid = (BOX.N + BOX.S) / 2, cm = Math.cos(mid * Math.PI / 180);
export const W = Math.round((BOX.E - BOX.W) * 111.32 * cm / 1.5), H = Math.round((yN - yS) * 6371 * cm / 1.5), NC = W * H;
export const colLon = Float32Array.from({ length: W }, (_, i) => BOX.W + (i + .5) / W * (BOX.E - BOX.W));
export const rowLat = Float32Array.from({ length: H }, (_, r) => imer(yN + (r + .5) / H * (yS - yN)));
