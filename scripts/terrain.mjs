// 1.5 km terrain for the Action: AWS Terrarium tiles (public, no key), box-averaged to the model grid.
import { PNG } from 'pngjs';
import { BOX, W, H, NC, colLon, rowLat } from '../js/config.js';
export async function loadTerrainNode(log) {
  const Z = 9, N2 = 1 << Z, tx = l => (l + 180) / 360 * N2, ty = a => { a *= Math.PI / 180; return (1 - Math.log(Math.tan(a) + 1 / Math.cos(a)) / Math.PI) / 2 * N2; };
  const x0 = Math.floor(tx(BOX.W)) - 1, x1 = Math.floor(tx(BOX.E)) + 1, y0 = Math.floor(ty(BOX.N)) - 1, y1 = Math.floor(ty(BOX.S)) + 1, MW = (x1 - x0 + 1) * 256, MH = (y1 - y0 + 1) * 256;
  const mos = new Float32Array(MW * MH);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    if (!r.ok) throw new Error(`terrain tile ${x}/${y}: ${r.status}`);
    const png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
    for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) { const o = (py * 256 + px) * 4; mos[((y - y0) * 256 + py) * MW + (x - x0) * 256 + px] = png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768; }
  }
  log(`terrain mosaic ${MW}x${MH}`);
  const ZT = new Float32Array(NC);
  for (let r = 0; r < H; r++) { const gy = Math.round((ty(rowLat[r]) - y0) * 256);
    for (let i = 0; i < W; i++) { const gx = Math.round((tx(colLon[i]) - x0) * 256); let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { s += mos[(gy + dy) * MW + gx + dx]; n++; }   // ~1.5 km box average
      ZT[r * W + i] = s / n; } }
  return ZT;
}
