// SoCal 1.5 km forecast core (AssemblyScript -> WebAssembly).
// JS owns I/O and initial state; this module steps the physics and computes the frame diagnostics.
const NL: i32 = 15;
const ST: i32 = 83; // floats per analysis column: NL*5 + 8
const LV: StaticArray<f64> = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150];
const I850: i32 = 5, I700: i32 = 7, I500: i32 = 9;
const CORI: f64 = 8.2e-5, GP: f64 = 4, TAU: f64 = 14400, CD: f64 = 0.004, LH: f64 = 2500;
// run-time settings (see setConfig)
let DT: f64 = 600, DTC: f64 = 0.4, DECAY: f64 = 0.7788007830714049, DPAR: f64 = 30, MUSTEP: f64 = 0;
let BLK: i32 = 2, BW: i32 = 0, HH: i32 = 0, NHF: i32 = 1, NPTS: i32 = 0;
export function setConfig(dt: f64, dp: f64, muStep: f64, blk: i32, bw: i32): void {
  DT = dt; DTC = dt / 1500.0; DECAY = Math.exp(-dt / 2400.0); DPAR = dp; MUSTEP = muStep; BLK = blk; BW = bw;
}

let W: i32 = 0, H: i32 = 0, NC: i32 = 0;
let U = new Float32Array(0), V = new Float32Array(0), TH = new Float32Array(0), TH0 = new Float32Array(0), Q = new Float32Array(0),
  QC = new Float32Array(0), RC = new Float32Array(0), PR = new Float32Array(0), RHF = new Float32Array(0), UA = new Float32Array(0),
  VA = new Float32Array(0), TMP = new Float32Array(0), UBG = new Float32Array(0), VBG = new Float32Array(0), US = new Float32Array(0),
  VS = new Float32Array(0), QFT = new Float32Array(0), THSST = new Float32Array(0), QSST = new Float32Array(0), BOW = new Float32Array(0),
  PS = new Float32Array(0), PK = new Float32Array(0), PM = new Float32Array(0), ZTc = new Float32Array(0), SLP = new Float32Array(0),
  LPI = new Float32Array(0), LPL = new Float32Array(0), LPE = new Float32Array(0), LPM = new Float32Array(0), COSZ = new Float32Array(0),
  WT = new Float32Array(0), ANA = new Float32Array(0), COLLON = new Float32Array(0), OUT = new Float32Array(0),
  THT = new Float32Array(0), QT = new Float32Array(0), T2T = new Float32Array(0);
let MASK = new Uint8Array(0), IX = new Int32Array(0);

export function init(w: i32, h: i32, npts: i32, nh: i32): void {
  W = w; H = h; NC = w * h; NPTS = npts; NHF = nh;
  THT = new Float32Array(NC); QT = new Float32Array(NC); T2T = new Float32Array(NC);
  U = new Float32Array(NC); V = new Float32Array(NC); TH = new Float32Array(NC); TH0 = new Float32Array(NC); Q = new Float32Array(NC);
  QC = new Float32Array(NC); RC = new Float32Array(NC); PR = new Float32Array(NC); RHF = new Float32Array(NC); UA = new Float32Array(NC);
  VA = new Float32Array(NC); TMP = new Float32Array(NC); UBG = new Float32Array(NC); VBG = new Float32Array(NC); US = new Float32Array(NC);
  VS = new Float32Array(NC); QFT = new Float32Array(NC); THSST = new Float32Array(NC); QSST = new Float32Array(NC); BOW = new Float32Array(NC);
  PS = new Float32Array(NC); PK = new Float32Array(NC); PM = new Float32Array(NC); ZTc = new Float32Array(NC); SLP = new Float32Array(NC);
  LPI = new Float32Array(NC); LPL = new Float32Array(NC); LPE = new Float32Array(NC); LPM = new Float32Array(NC); COSZ = new Float32Array(w);
  MASK = new Uint8Array(NC); IX = new Int32Array(4 * NC); WT = new Float32Array(4 * NC); ANA = new Float32Array(npts * nh * ST);
  COLLON = new Float32Array(w); OUT = new Float32Array(11 * NC);
}
// pointers so JS can build typed-array views onto wasm memory
export function ptr(id: i32): usize {
  switch (id) {
    case 0: return U.dataStart; case 1: return V.dataStart; case 2: return TH.dataStart; case 3: return TH0.dataStart;
    case 4: return Q.dataStart; case 5: return QC.dataStart; case 6: return RC.dataStart; case 7: return PR.dataStart;
    case 8: return UBG.dataStart; case 9: return VBG.dataStart; case 10: return US.dataStart; case 11: return VS.dataStart;
    case 12: return QFT.dataStart; case 13: return THSST.dataStart; case 14: return QSST.dataStart; case 15: return BOW.dataStart;
    case 16: return PS.dataStart; case 17: return PK.dataStart; case 18: return PM.dataStart; case 19: return ZTc.dataStart;
    case 20: return SLP.dataStart; case 21: return MASK.dataStart; case 22: return IX.dataStart; case 23: return WT.dataStart;
    case 24: return ANA.dataStart; case 25: return COLLON.dataStart; case 26: return OUT.dataStart;
    case 27: return THT.dataStart; case 28: return QT.dataStart; case 29: return T2T.dataStart;
  }
  return 0;
}

@inline function f(a: Float32Array, k: i32): f64 { return <f64>unchecked(a[k]); }
@inline function cl(v: f64, a: f64): f64 { return v < -a ? -a : v > a ? a : v; }
@inline function es(T: f64): f64 { return 6.112 * Math.exp(17.67 * T / (T + 243.5)); }
@inline function rs(p: f64, T: f64): f64 { const e = es(T); return 0.622 * e / (p - e); }
@inline function dewOf(q: f64, p: f64): f64 { const lg = Math.log(q * p / (0.622 + q) / 6.112); return 243.5 * lg / (17.67 - lg); }
// analysis interpolated to cell c, quantity offset o
function g(c: i32, o: i32): f64 {
  const j = 4 * c;
  const hb = HH * NPTS;
  return f(WT, j) * f(ANA, (hb + unchecked(IX[j])) * ST + o) + f(WT, j + 1) * f(ANA, (hb + unchecked(IX[j + 1])) * ST + o) +
    f(WT, j + 2) * f(ANA, (hb + unchecked(IX[j + 2])) * ST + o) + f(WT, j + 3) * f(ANA, (hb + unchecked(IX[j + 3])) * ST + o);
}

// semi-Lagrangian advection with open boundaries
function adv(a: Float32Array, ax: Float32Array, ay: Float32Array): void {
  for (let r = 0; r < H; r++) for (let i = 0; i < W; i++) {
    const k = r * W + i;
    let x = <f64>i - f(ax, k) * DTC, y = <f64>r + f(ay, k) * DTC;
    x = x < 0 ? 0 : x > <f64>(W - 1) - 0.001 ? <f64>(W - 1) - 0.001 : x;
    y = y < 0 ? 0 : y > <f64>(H - 1) - 0.001 ? <f64>(H - 1) - 0.001 : y;
    const x0 = <i32>x, y0 = <i32>y, fx = x - <f64>x0, fy = y - <f64>y0, q = y0 * W + x0;
    TMP[k] = <f32>((f(a, q) * (1 - fx) + f(a, q + 1) * fx) * (1 - fy) + (f(a, q + W) * (1 - fx) + f(a, q + W + 1) * fx) * fy);
  }
  for (let k = 0; k < NC; k++) a[k] = TMP[k];
}

// large-scale forcing for forecast hour h, interpolated from the analysis columns (hour index clamps to what was loaded)
export function updateForcing(h: i32): void {
  HH = h < NHF ? h : NHF - 1;
  const b = 5 * NL;
  for (let c = 0; c < NC; c++) {
    const zc = g(c, b + 7), zt = f(ZTc, c), dz = zc - zt, t2 = g(c, b) + dz * 0.0065, td2 = Math.min(t2, g(c, b + 1) + dz * 0.002), ps = f(PS, c);
    let kf = 0; while (kf < NL - 1 && !(LV[kf] < ps - 25.0)) kf++;
    UBG[c] = <f32>(0.5 * (g(c, b + 3) + g(c, 2 * NL + kf))); VBG[c] = <f32>(0.5 * (g(c, b + 4) + g(c, 3 * NL + kf)));
    US[c] = <f32>(0.5 * (g(c, 2 * NL + I700) + g(c, 2 * NL + I500))); VS[c] = <f32>(0.5 * (g(c, 3 * NL + I700) + g(c, 3 * NL + I500)));
    THT[c] = <f32>((t2 + 273.15) * Math.pow(1000.0 / ps, 0.2857)); QT[c] = <f32>rs(ps, td2); T2T[c] = <f32>t2;
    QFT[c] = <f32>Math.min(f(QT, c), rs(850.0, g(c, NL + I850)));
    TH0[c] = THT[c]; // thermal pressure gradient acts on departures from the large-scale temperature
  }
}
export function initFromForcing(): void {
  for (let c = 0; c < NC; c++) {
    U[c] = UBG[c]; V[c] = VBG[c]; TH[c] = THT[c]; Q[c] = QT[c]; QC[c] = 0; RC[c] = 0; PR[c] = 0;
    const ps = f(PS, c), t2 = f(T2T, c);
    THSST[c] = <f32>((t2 + 274.15) * Math.pow(1000.0 / ps, 0.2857)); QSST[c] = <f32>rs(ps, t2 + 1.0);
    BOW[c] = <f32>(0.15 + 0.25 * (1.0 - Math.min(1.0, f(Q, c) / rs(ps, t2))));
  }
}

export function substep(ut: f64, sp0: f64, cp0: f64): void {
  for (let i = 0; i < W; i++) COSZ[i] = <f32>(sp0 + cp0 * Math.cos((ut + f(COLLON, i) / 15.0 - 12.0) * Math.PI / 12.0));
  for (let k = 0; k < NC; k++) { UA[k] = U[k]; VA[k] = V[k]; }
  adv(U, UA, VA); adv(V, UA, VA); adv(TH, UA, VA); adv(Q, UA, VA); adv(QC, UA, VA); adv(RC, US, VS);
  for (let r = 0; r < H; r++) for (let i = 0; i < W; i++) {
    const k = r * W + i, ps = f(PS, k), inner = r > 0 && r < H - 1 && i > 0 && i < W - 1;
    const rho = ps * 100.0 / (287.0 * f(TH, k) * f(PK, k));
    let gx: f64 = 0, gy: f64 = 0, hx: f64 = 0, hy: f64 = 0;
    if (inner) {
      gx = (f(TH, k + 1) - f(TH0, k + 1) - f(TH, k - 1) + f(TH0, k - 1)) / 3000.0;
      gy = (f(TH, k - W) - f(TH0, k - W) - f(TH, k + W) + f(TH0, k + W)) / 3000.0;
      hx = (f(ZTc, k + 1) - f(ZTc, k - 1)) / 3000.0; hy = (f(ZTc, k - W) - f(ZTc, k + W)) / 3000.0;
    }
    const u0 = f(U, k), v0 = f(V, k), sp = Math.sqrt(u0 * u0 + v0 * v0), ub = f(UBG, k), vb = f(VBG, k);
    let un = cl(u0 + DT * (CORI * (v0 - vb) + GP * gx - CD * sp * u0 / 1000.0 - (u0 - ub) / TAU), 30);
    let vn = cl(v0 + DT * (-CORI * (u0 - ub) + GP * gy - CD * sp * v0 / 1000.0 - (v0 - vb) / TAU), 30);
    const s2 = un * un + vn * vn; if (s2 > 400) { const fc = 20.0 / Math.sqrt(s2); un *= fc; vn *= fc; } // cap 10 m wind at 20 m/s
    U[k] = <f32>un; V[k] = <f32>vn;
    const cs = f(COSZ, i), sw = cs > 0 ? 950.0 * cs : 0.0, cf = 1.0 - 0.6 * Math.min(1.0, f(QC, k) / 1e-4);
    let dth: f64, dq = (f(QFT, k) - f(Q, k)) / 65000.0 * (cs > 0 ? 1.0 : 0.3);
    if (unchecked(MASK[k]) == 1) { dth = 1.2e-3 * sp * (f(THSST, k) - f(TH, k)) / 1000.0; dq += 1.2e-3 * sp * (f(QSST, k) - f(Q, k)) / 1000.0; }
    else dth = (f(BOW, k) * sw * cf - 15.0) / (rho * 1005.0 * 1000.0);
    let th = f(TH, k) + DT * dth, q = f(Q, k) + DT * dq, qc = f(QC, k);
    const pm = ps - 50.0, qs = rs(pm, th * f(PM, k) - 273.15);
    if (q > qs) { const c = 0.5 * (q - qs); q -= c; qc += c; th += LH * c; }
    else if (qc > 0) { const e = Math.min(qc, 0.5 * (qs - q)); qc -= e; q += e; th -= LH * e; }
    let rml: f64 = 0;
    if (qc > 1.5e-4) { const cv = (qc - 1.5e-4) * DT / 1800.0; qc -= cv; rml = cv * rho * 1000.0 / DT * 3600.0; }
    const wo = un * hx + vn * hy; let ro: f64 = 0;
    if (wo > 0) { ro = 3600.0 * 0.08 * Math.max(0.0, (q / qs - 0.7) / 0.3) * rho * q * wo; const sink = Math.min(q * 0.5, ro / 3600.0 / (rho * 1000.0) * DT); q -= sink; th += LH * sink; }
    const rc = f(RC, k);
    if (rc > 0) { q -= Math.min(q * 0.5, DT * rc * 0.3 / 3600.0 / (rho * 1000.0)); th -= DT * rc * 8e-5; }
    const rcn = rc * DECAY;
    const de = <f64>min(min(i, W - 1 - i), min(r, H - 1 - r));  // lateral-boundary relaxation zone toward the large-scale fields
    if (de < <f64>BW) {
      const wb = 1.0 - de / <f64>BW, rt = Math.min(1.0, wb * wb * DT / 1200.0);
      U[k] = <f32>(f(U, k) + rt * (f(UBG, k) - f(U, k))); V[k] = <f32>(f(V, k) + rt * (f(VBG, k) - f(V, k)));
      th += rt * (f(THT, k) - th); q += rt * (f(QT, k) - q); qc *= 1.0 - rt;
    }
    TH[k] = <f32>th; Q[k] = <f32>Math.max(1e-5, q); QC[k] = <f32>qc; RC[k] = <f32>rcn; PR[k] = <f32>(ro + rml + rcn);
  }
}

// ---------- parcel ascent + frame diagnostics ----------
const eP = new StaticArray<f64>(24), eT = new StaticArray<f64>(24), eD = new StaticArray<f64>(24), eU = new StaticArray<f64>(24),
  eV = new StaticArray<f64>(24), eZ = new StaticArray<f64>(24), eTv = new StaticArray<f64>(24);
let n: i32 = 0, xT: f64 = 0, xD: f64 = 0, PC: f64 = 0, PI_: f64 = 0, PL: f64 = 0, PEL: f64 = 150;
function envAt(p: f64): void {
  let k = 1; while (k < n - 1 && eP[k] > p) k++;
  let fr = (p - eP[k - 1]) / (eP[k] - eP[k - 1]); fr = fr < 0 ? 0 : fr > 1 ? 1 : fr;
  xT = eT[k - 1] + fr * (eT[k] - eT[k - 1]); xD = eD[k - 1] + fr * (eD[k] - eD[k - 1]);
}
function zAt(p: f64): f64 {
  let k = 1; while (k < n - 1 && eP[k] > p) k++;
  const fr = Math.log(eP[k - 1] / p) / Math.log(eP[k - 1] / eP[k]);
  return eZ[k - 1] + Math.max(0.0, Math.min(1.5, fr)) * (eZ[k] - eZ[k - 1]);
}
function parcel(p0: f64, T0: f64, D0: f64): void {
  const Tk = T0 + 273.15, Dk = D0 + 273.15, Tl = 1.0 / (1.0 / (Dk - 56.0) + Math.log(Tk / Dk) / 800.0) + 56.0, pl = p0 * Math.pow(Tl / Tk, 3.5);
  let p = p0, Tp = Tk, r = rs(p0, D0), sat = false, cape: f64 = 0, cin: f64 = 0, pos = false, done = false, t5: f64 = NaN, pd: f64 = 0, pel: f64 = 150, k: i32 = 1;
  while (p > 150) {
    let pn = p - DPAR;
    if (!sat) { if (pn <= pl) { pn = pl; Tp = Tl; sat = true; r = rs(pl, Tl - 273.15); } else Tp = Tk * Math.pow(pn / p0, 0.2857); }
    else { Tp += (287.0 * Tp + 2.5e6 * r) / (1005.0 + 6.25e12 * r * 0.622 / (287.0 * Tp * Tp)) * (pn - p) / p; r = rs(pn, Tp - 273.15); }
    while (k < n - 1 && eP[k] > pn) k++;
    let fr = (pn - eP[k - 1]) / (eP[k] - eP[k - 1]); fr = fr < 0 ? 0 : fr > 1 ? 1 : fr;
    const Tve = eTv[k - 1] + fr * (eTv[k] - eTv[k - 1]), B = 9.81 * (Tp * (1 + 0.61 * r) - Tve) / Tve,
      dz = 287.0 * Tve * Math.log(p / pn) / 9.81, df = eT[k - 1] + fr * (eT[k] - eT[k - 1]) - (Tp - 273.15);
    // buoyancy within +-EPS (~0.1 K) counts as neutral, so the exactly-neutral mixed layer is not mistaken for a free-convection layer
    if (!done) { if (B > 0.003) { cape += B * dz; pos = true; } else if (pos) { if (B < -0.003) { done = true; pel = pn; } } else if (B < 0) cin += B * dz; }
    if (isNaN(t5) && pn <= 500) t5 = pd + (df - pd) * (p - 500) / (p - pn);
    pd = df; p = pn;
  }
  PC = cape; PI_ = cin; PL = t5; PEL = pel;
}

function diag(c: i32): void {
  const zt = f(ZTc, c), ps = f(PS, c), th = f(TH, c), q = f(Q, c), u = f(U, c), v = f(V, c);
  const Ts = th * Math.pow(ps / 1000.0, 0.2857) - 273.15, Ds = Math.min(Ts, dewOf(q, ps));
  eP[0] = ps; eT[0] = Ts; eD[0] = Ds; eU[0] = u; eV[0] = v; eZ[0] = zt;
  const pm = ps - 100.0, Tm = th * Math.pow(pm / 1000.0, 0.2857) - 273.15;
  eP[1] = pm; eT[1] = Tm; eD[1] = Math.min(Tm, dewOf(q, pm)); eU[1] = u; eV[1] = v;
  eZ[1] = zt + 287.0 * ((Ts + Tm) / 2.0 + 273.15) / 9.81 * Math.log(ps / pm); n = 2;
  for (let k = 0; k < NL; k++) if (LV[k] < ps - 110.0) {
    eP[n] = LV[k]; eT[n] = g(c, k); eD[n] = Math.min(g(c, NL + k), eT[n]); eU[n] = g(c, 2 * NL + k); eV[n] = g(c, 3 * NL + k); eZ[n] = g(c, 4 * NL + k); n++;
  }
  // parcel ascents once per 2x2 block (3 km); all other diagnostics per 1.5 km cell
  const rr = c / W, ii = c - rr * W, ld = BLK == 1 ? c : (rr & ~1) * W + (ii & ~1);
  if (c == ld) {
    for (let k = 0; k < n; k++) eTv[k] = (eT[k] + 273.15) * (1 + 0.61 * rs(eP[k], eD[k]));
    parcel(ps, Ts, Ds); LPI[c] = <f32>PI_; LPL[c] = <f32>PL; LPE[c] = <f32>PEL; let mu = PC;
    if (MUSTEP > 0) {                       // accurate mode: true most-unstable CAPE, parcels from every MUSTEP hPa in the lowest 300 hPa
      for (let d = MUSTEP; d <= 300.0; d += MUSTEP) { envAt(ps - d); parcel(ps - d, xT, Math.min(xD, xT)); if (PC > mu) mu = PC; }
    } else {
      envAt(ps - 150.0);
      const De = Math.min(xD, xT), the = (xT + 273.15) * Math.pow(1000.0 / (ps - 150.0), 0.2857) * Math.exp(2.5e6 * rs(ps - 150.0, De) / (1005.0 * (xT + 273.15))),
        ths = (Ts + 273.15) * Math.pow(1000.0 / ps, 0.2857) * Math.exp(2.5e6 * rs(ps, Ds) / (1005.0 * (Ts + 273.15)));
      if (the > ths) { parcel(ps - 150.0, xT, De); if (PC > mu) mu = PC; }
    }
    LPM[c] = <f32>mu;
  }
  const cin = f(LPI, ld), li = f(LPL, ld), pel = f(LPE, ld), mu2 = f(LPM, ld);
  OUT[5 * NC + c] = <f32>cin; OUT[6 * NC + c] = <f32>li; OUT[4 * NC + c] = <f32>mu2; RHF[c] = <f32>(q / rs(ps, Ts));
  let ix: f64 = 0, iy: f64 = 0;
  for (let k = 0; k < n - 1 && eP[k + 1] >= 300.0; k++) {
    const r0 = rs(eP[k], eD[k]), r1 = rs(eP[k + 1], eD[k + 1]), q0 = r0 / (1 + r0), q1 = r1 / (1 + r1), dp = (eP[k] - eP[k + 1]) * 100.0 / 9.81;
    ix += 0.5 * (q0 * eU[k] + q1 * eU[k + 1]) * dp; iy += 0.5 * (q0 * eV[k] + q1 * eV[k + 1]) * dp;
  }
  OUT[3 * NC + c] = <f32>Math.sqrt(ix * ix + iy * iy);
  const Rr = f(PR, c); let dbz: f64 = NaN, top: f64 = 0, vil: f64 = 0;
  if (Rr > 0.02) {
    dbz = f(RC, c) > 1 ? 10.0 * Math.log10(300.0 * Math.pow(Rr, 1.4)) : 10.0 * Math.log10(200.0 * Math.pow(Rr, 1.6)); // convective vs stratiform Z-R
    let zf = eZ[n - 1];
    for (let k = 0; k < n; k++) if (eT[k] <= 0) { zf = k > 0 ? eZ[k - 1] + (eZ[k] - eZ[k - 1]) * eT[k - 1] / (eT[k - 1] - eT[k]) : zt; break; }
    top = f(RC, c) > 1 ? Math.max(zAt(pel), zt + 3000.0) : zt + 2500.0;
    vil = Math.min(80.0, 0.0889 * Math.pow(Rr, 0.84) * Math.max(0.5, Math.min(zf, top) - zt) / 1000.0);
  }
  const w = Math.sqrt(u * u + v * v), steer = Math.sqrt(f(US, c) * f(US, c) + f(VS, c) * f(VS, c));
  OUT[c] = <f32>dbz; OUT[NC + c] = <f32>(top / 1000.0); OUT[2 * NC + c] = <f32>vil; OUT[7 * NC + c] = <f32>Ts; OUT[9 * NC + c] = <f32>w; OUT[10 * NC + c] = <f32>Rr;
  OUT[8 * NC + c] = <f32>(w + 0.35 * Math.max(0.0, steer - w) + (f(RC, c) > 0.5 ? 3.0 + 2.0 * Math.sqrt(f(RC, c)) : 0.0));
}
export function diagAll(h: i32): void { HH = h < NHF ? h : NHF - 1; for (let c = 0; c < NC; c++) diag(c); }
// convective initiation for the next hour from this frame's CAPE / CIN, boosted over mountains
export function convInit(): void {
  for (let c = 0; c < NC; c++) {
    const mu = f(OUT, 4 * NC + c);
    if (mu > 300 && f(RHF, c) > 0.5) {
      const t = Math.min(40.0, 0.004 * (mu - 300.0) * Math.max(0.0, 1.0 + f(OUT, 5 * NC + c) / 75.0) * (0.3 + Math.min(1.5, 8.0 * f(SLP, c))));
      if (t > f(RC, c)) RC[c] = <f32>t;
    }
  }
}
