// Orchestration. Preferred: show the frames the GitHub Action precomputed. Fallback: run a quick forecast in the browser.
import { NLON, NLAT, NH, W, H, PRESETS, $, setStatus, getKey } from './config.js';
import { loadAnalysis, loadTerrain } from './data.js';
import { loadModel, setAnalysis, initState, runHour, configure, terrain } from './model.js';
import { ui, showFrame, setupControls, makeMap, addOverlay } from './view.js';

const KEY = getKey();
setupControls();
const map = makeMap(KEY);

async function fromAction() {
  let man; try { man = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json(); } catch (e) { return false; }
  if (!man || man.W !== W || man.H !== H) return false;
  ui.T0 = man.T0; ui.load = async h => new Uint8Array(await (await fetch(`data/h${String(h).padStart(2, '0')}.bin`)).arrayBuffer());
  ui.terrain = new Int16Array(await (await fetch('data/terrain.bin')).arrayBuffer());
  $('hr').max = man.nh - 1; await showFrame(0); addOverlay(map);
  setStatus(`High-accuracy run from ${man.cycle} (computed by GitHub Actions)`); return true;
}
async function inBrowser() {
  const cfg = PRESETS.browser;
  setStatus('Loading physics core…'); await loadModel(NLON * NLAT, 1);
  configure(cfg); const { ana, T0 } = await loadAnalysis(setStatus, { hours: 1 }); ui.T0 = T0; setAnalysis(ana);
  setStatus('Loading 1.5 km terrain…'); initState(await loadTerrain(KEY)); ui.terrain = terrain(); addOverlay(map);
  for (let h = 0; h <= NH; h++) {
    ui.frames[h] = runHour(h, T0, cfg); $('hr').max = h; if (ui.follow) showFrame(h);
    setStatus(h < NH ? `Quick in-browser forecast… hour +${h} of ${NH}` : `Done: ${NH} h quick forecast (no precomputed run found)`);
    await new Promise(r => setTimeout(r, 0));
  }
}
map.on('load', async () => { try { if (!(await fromAction())) await inBrowser(); } catch (e) { setStatus('Error: ' + e.message); console.error(e); } });
