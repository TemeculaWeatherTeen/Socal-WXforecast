// High-accuracy offline run (GitHub Actions allows up to 6 h per job). Writes site/data/*.
import fs from 'node:fs';
import { NH, NC, W, H, FD, PRESETS } from '../js/config.js';
import { loadAnalysis } from '../js/data.js';
import { loadModel, setAnalysis, initState, runHour, configure, terrain } from '../js/model.js';
import { loadTerrainNode } from './terrain.mjs';
const HOURS = +process.env.HOURS || NH, log = m => console.log(new Date().toISOString().slice(11, 19), m), cfg = PRESETS.accurate;
const { ana, T0, npts, nh } = await loadAnalysis(log, { hours: HOURS + 1, chunk: 8, delay: +(process.env.DELAY_MS ?? 9000) });
log(`GFS columns: ${npts} points x ${nh} hours`);
await loadModel(npts, nh, fs.readFileSync('wasm/model.wasm')); configure(cfg); setAnalysis(ana);
initState(await loadTerrainNode(log));
fs.mkdirSync('site/data', { recursive: true });
fs.writeFileSync('site/data/terrain.bin', Buffer.from(Int16Array.from(terrain(), v => Math.round(v)).buffer));
for (let h = 0; h <= HOURS; h++) {
  const t = Date.now(), P = runHour(h, T0, cfg);
  fs.writeFileSync(`site/data/h${String(h).padStart(2, '0')}.bin`, P); log(`hour +${h} done (${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
fs.writeFileSync('site/data/manifest.json', JSON.stringify({ T0, cycle: new Date(T0).toISOString().slice(0, 13) + 'Z', W, H, nh: HOURS + 1, fields: FD.map(f => f[0]), config: cfg }));
log('finished');
