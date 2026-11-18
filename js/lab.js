/* Race the Wave - lab logic.
   Panel drawing keeps references to its own elements (no getElementById inside
   the panel), so the whole panel can move into a pop-out window and keep working. */
(() => {
  'use strict';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const STORE = 'tsulab-v1';
  const ST_COLORS = ['#0f8b8d', '#8e44ad', '#c48a00'];
  const CP = '#1f6fd1', CS = '#e0531f', CA = '#7b3fbf', RED = '#841617', SLATE = '#5C6670';

  const panelWrap = document.getElementById('panelWrap');
  const panel = document.getElementById('panel');
  const placeholder = document.getElementById('panelPlaceholder');
  const tabsEl = document.getElementById('tabs');
  const stepEl = document.getElementById('step');

  // ---------- state ----------
  const blank = () => ({ name: '', seed: null, step: 0, done: {}, answers: {}, completedAt: null });
  let S = blank();
  try { const raw = localStorage.getItem(STORE); if (raw) S = Object.assign(blank(), JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  const storageOK = (() => { try { localStorage.setItem('tsulab-test', '1'); const ok = localStorage.getItem('tsulab-test') === '1'; localStorage.removeItem('tsulab-test'); return ok; } catch (e) { return false; } })();
  let saveFailed = !storageOK;
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { if (!saveFailed) { saveFailed = true; showStorageWarning(); } } };
  function showStorageWarning() {
    const col = document.getElementById('stepCol'); if (!col || document.getElementById('storeWarn')) return;
    const w = document.createElement('div'); w.id = 'storeWarn'; w.className = 'warn-banner';
    w.innerHTML = '<strong>Warning: this browser is not saving your work.</strong> If you close or reload this page, you will have to start over. Finish the lab in one sitting, or open it in a regular (not private or incognito) window of Chrome, Edge, Firefox or Safari.';
    col.insertBefore(w, col.firstChild);
  }
  window.addEventListener('beforeunload', e => { if (saveFailed && S.seed != null && !S.completedAt) { e.preventDefault(); e.returnValue = ''; } });

  let SC = null;
  const REF = {};
  function loadScenario() { SC = S.seed == null ? null : TSU.build(S.seed); }
  loadScenario();

  // ---------- helpers ----------
  const T = (key, txt) => `<span class="term" data-term="${key}" tabindex="0">${txt}</span>`;
  const fmt = (v, d = 1) => (v == null || isNaN(v)) ? '-' : (+v).toFixed(d);
  function svg(tag, attrs = {}, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, attrs = {}) { const t = svg('text', Object.assign({ x, y }, attrs), parent); t.textContent = s; return t; }
  function svgPoint(s, evt) {
    const pt = s.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(s.getScreenCTM().inverse());
  }
  function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function niceCeil(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p;
    const n = m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10;
    return n * p;
  }
  function slider(label, min, max, step, value, unit, oninput) {
    const wrap = h('label');
    wrap.innerHTML = `${label} `;
    const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
    const out = h('span', 'readout');
    const upd = () => { out.textContent = ` ${(+r.value).toFixed(step < 1 ? 1 : 0)} ${unit}`; oninput(+r.value); };
    r.addEventListener('input', upd);
    wrap.append(r, out);
    setTimeout(upd, 0);
    return { wrap, input: r, out };
  }



  // ---------- visual helpers ----------
  let ANIM = null;
  function stopAnim() { if (ANIM) { cancelAnimationFrame(ANIM.id); ANIM = null; } }
  function animate(step) {
    stopAnim();
    const st = { id: 0, last: null }; ANIM = st;
    const f = ts => {
      if (ANIM !== st) return;
      const dt = st.last == null ? 0 : Math.min(0.1, (ts - st.last) / 1000); st.last = ts;
      if (step(dt) === false) { ANIM = null; return; }
      st.id = requestAnimationFrame(f);
    };
    st.id = requestAnimationFrame(f);
  }
  let GID = 0; const uid = pfx => pfx + '-' + (++GID);
  function halo(t, w = 3) { t.setAttribute('paint-order', 'stroke'); t.setAttribute('stroke', '#fff'); t.setAttribute('stroke-width', w); t.setAttribute('stroke-linejoin', 'round'); return t; }
  function defsOf(s) { return s.querySelector('defs') || svg('defs', {}, s); }
  function lgrad(s, stops, x2 = 0, y2 = 1) {
    const id = uid('lg'); const g = svg('linearGradient', { id, x1: 0, y1: 0, x2, y2 }, defsOf(s));
    stops.forEach(([o, c, op]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 }, g)); return `url(#${id})`;
  }
  function rgrad(s, stops, cx = 0.35, cy = 0.35) {
    const id = uid('rg'); const g = svg('radialGradient', { id, cx, cy, r: 0.75 }, defsOf(s));
    stops.forEach(([o, c]) => svg('stop', { offset: o, 'stop-color': c }, g)); return `url(#${id})`;
  }
  function shadow(s) {
    const id = uid('sh'); const f = svg('filter', { id, x: '-20%', y: '-20%', width: '140%', height: '140%' }, defsOf(s));
    svg('feDropShadow', { dx: 0, dy: 1.5, stdDeviation: 1.6, 'flood-color': '#000', 'flood-opacity': 0.28 }, f); return `url(#${id})`;
  }
  function playButtons(ctr, onPlay, onReset) {
    const b = h('button', 'btn secondary play-btn', '▶ Play'); b.type = 'button'; b.onclick = onPlay;
    ctr.append(b);
    if (onReset) { const r = h('button', 'btn secondary play-btn', '↺ Reset'); r.type = 'button'; r.onclick = onReset; ctr.append(r); }
    return b;
  }
  const fmtHM = min => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
  function clockStr(baseH, addMin, dayBase) {
    const tot = baseH * 60 + addMin; const day = dayBase + Math.floor(tot / 1440); const m = ((tot % 1440) + 1440) % 1440;
    let hh = Math.floor(m / 60), mm = Math.round(m % 60); if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
    const ap = hh >= 12 ? 'p.m.' : 'a.m.'; const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(mm).padStart(2, '0')} ${ap}, Jan ${day}`;
  }

  // ---------- Pacific map ----------
  function geoD(points) {
    let d = '', prev = null;
    for (const [la, lo] of points) {
      if (la > 85 || la < -85) { prev = null; continue; }
      const [x, y] = PAC.proj(la, lo);
      d += (!prev || Math.abs(x - prev[0]) > PAC.W / 2 || Math.abs(y - prev[1]) > PAC.H / 2 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      prev = [x, y];
    }
    return d;
  }
  function drawPacific(parent) {
    const s = svg('svg', { viewBox: `0 0 ${PAC.W} ${PAC.H.toFixed(0)}`, class: 'fig map-fig', role: 'img', 'aria-label': 'Map of the Pacific Ocean' }, parent);
    svg('rect', { x: 0, y: 0, width: PAC.W, height: PAC.H, fill: lgrad(s, [[0, '#9fd0ef'], [0.55, '#5ea7d8'], [1, '#2f78b5']]) }, s);
    const gr = svg('g', { stroke: '#ffffff', 'stroke-opacity': 0.22, 'stroke-width': 0.8, fill: 'none' }, s);
    for (let la = -40; la <= 60; la += 20) svg('path', { d: geoD(Array.from({ length: 73 }, (_, i) => [la, 95 + i * 2.5])) }, gr);
    for (let lo = 100; lo <= 290; lo += 20) svg('path', { d: geoD(Array.from({ length: 50 }, (_, i) => [-50 + i * 2.5, lo])) }, gr);
    svg('path', { d: PAC.land, fill: '#efe6cf', stroke: '#a89270', 'stroke-width': 0.7, filter: shadow(s) }, s);
    const lab = (la, lo, t, o = {}) => { const [x, y] = PAC.proj(la, lo); return txt(s, x, y, t, Object.assign({ 'font-size': 12, fill: '#7a6a4a', 'font-style': 'italic', 'text-anchor': 'middle', 'letter-spacing': '0.08em' }, o)); };
    lab(50, -112, 'NORTH AMERICA', { 'text-anchor': 'end' }); lab(-25, 133, 'AUSTRALIA'); lab(45, 112, 'ASIA');
    lab(10, -150, 'P A C I F I C   O C E A N', { fill: '#e8f4fc', 'font-size': 15, 'letter-spacing': '0.1em' });
    return s;
  }
  function marker(s, la, lo, label, opts = {}) {
    const [x, y] = PAC.proj(la, lo);
    const g = svg('g', {}, s);
    const c = svg('circle', { cx: x, cy: y, r: opts.r || 5, fill: opts.fill || '#fff', stroke: opts.stroke || '#16191C', 'stroke-width': 1.8 }, g);
    const t = halo(txt(g, x + (opts.dx ?? 8), y + (opts.dy ?? 4), label, { 'font-size': 12, 'font-weight': 700, fill: '#16191C', 'text-anchor': opts.anchor || 'start' }), 3.5);
    return { g, c, t, x, y };
  }
  function starAt(s, x, y, r, fill) {
    const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1)); }
    return svg('polygon', { points: p.join(' '), fill, stroke: '#fff', 'stroke-width': 1.5 }, s);
  }
  function ringLayer(s) { return svg('g', { 'stroke-linecap': 'round', fill: 'none' }, s); }
  function drawRing(g, la, lo, rKm, color, opts = {}) {
    if (rKm <= 0) return;
    const pts = TSU.geoCircle(la, lo, rKm, 240), d = geoD(pts);
    if (!opts.noGlow) svg('path', { d, stroke: '#ffffff', 'stroke-opacity': 0.55, 'stroke-width': (opts.w || 3.5) + 4 }, g);
    svg('path', { d, stroke: color, 'stroke-width': opts.w || 3.5, 'stroke-dasharray': opts.dash || '', 'stroke-opacity': opts.op ?? 1 }, g);
  }

  // ---------- Step 1: race + speed curve ----------
  function panel1(p) {
    const ctr = h('div', 'controls'); p.append(ctr);
    const W = 760, H = 450;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
    // --- race (top)
    const L = 175, Rr = 30, TW = W - L - Rr, KM = 1000;
    const XR = d => L + d / KM * TW;
    txt(s, 10, 18, 'A 1,000 km race', { 'font-size': 13, 'font-weight': 700, fill: '#16191C' });
    const clock = txt(s, W - Rr, 18, '', { 'font-size': 13, 'font-weight': 700, 'text-anchor': 'end', fill: RED });
    const lanes = [['Tsunami', null, CP, 'wave'], ['Passenger jet', 900, '#5C6670', 'jet'], ['Car on a highway', 110, '#0f8b8d', 'car'], ['Person sprinting', 25, '#c48a00', 'run']];
    const laneG = [];
    const shd = shadow(s);
    lanes.forEach(([n, , col, kind], k) => {
      const y = 34 + k * 38;
      svg('rect', { x: L, y: y + 6, width: TW, height: 20, rx: 10, fill: k === 0 ? lgrad(s, [[0, '#d5ecfa'], [1, '#9fd0ef']], 1, 0) : '#eef0f2' }, s);
      for (let d = 250; d < KM; d += 250) svg('line', { x1: XR(d), x2: XR(d), y1: y + 6, y2: y + 26, stroke: '#fff', 'stroke-width': 2 }, s);
      txt(s, L - 24, y + 21, n, { 'font-size': 12.5, 'font-weight': 700, fill: col, 'text-anchor': 'end' });
      const g = svg('g', { filter: shd }, s);
      if (kind === 'wave') svg('path', { d: 'M-14,8 C-8,-10 4,-12 12,-2 C6,-4 2,0 4,8 Z', fill: col }, g);
      if (kind === 'jet') svg('path', { d: 'M-14,1 L10,-1 L14,1 L10,3 L-14,3 Z M-2,1 L-8,-8 L-4,-8 L4,1 Z M-2,3 L-8,11 L-4,11 L4,3 Z M-13,1 L-16,-5 L-12,-5 L-9,1 Z', fill: col }, g);
      if (kind === 'car') { svg('rect', { x: -13, y: -5, width: 26, height: 9, rx: 3, fill: col }, g); svg('rect', { x: -7, y: -10, width: 13, height: 7, rx: 2, fill: col }, g); svg('circle', { cx: -7, cy: 5, r: 3.2, fill: '#333' }, g); svg('circle', { cx: 7, cy: 5, r: 3.2, fill: '#333' }, g); }
      if (kind === 'run') { svg('circle', { cx: 2, cy: -9, r: 3.5, fill: col }, g); svg('path', { d: 'M1,-5 L-2,4 M-1,-2 L6,0 M-1,-2 L-7,1 M-2,4 L4,11 M-2,4 L-8,10', stroke: col, 'stroke-width': 2.6, 'stroke-linecap': 'round', fill: 'none' }, g); }
      laneG.push({ g, y: y + 16 });
    });
    [0, 250, 500, 750, 1000].forEach(d => txt(s, XR(d), 34 + 4 * 38 + 6, d.toLocaleString('en-US') + ' km', { 'font-size': 10.5, fill: SLATE, 'text-anchor': 'middle' }));
    // --- speed curve (bottom)
    const CL = 60, CT = 215, CB = H - 34, DMAX = 6000, VMAX = 900;
    const X = d => CL + d / DMAX * (W - CL - 20), Y = v => CB - v / VMAX * (CB - CT);
    for (let d = 0; d <= DMAX; d += 1000) { svg('line', { x1: X(d), x2: X(d), y1: Y(0), y2: Y(VMAX), stroke: '#e6e9ec' }, s); txt(s, X(d), CB + 15, d.toLocaleString('en-US'), { 'font-size': 10.5, 'text-anchor': 'middle', fill: SLATE }); }
    for (let v = 0; v <= VMAX; v += 300) { svg('line', { x1: X(0), x2: X(DMAX), y1: Y(v), y2: Y(v), stroke: '#e6e9ec' }, s); txt(s, CL - 6, Y(v) + 4, v, { 'font-size': 10.5, 'text-anchor': 'end', fill: SLATE }); }
    txt(s, X(DMAX / 2), H - 4, 'Water depth (m)', { 'font-size': 11.5, 'text-anchor': 'middle', fill: SLATE });
    const yl = txt(s, 14, (CT + CB) / 2, 'Speed (km/h)', { 'font-size': 11.5, 'text-anchor': 'middle', fill: SLATE }); yl.setAttribute('transform', `rotate(-90 14 ${(CT + CB) / 2})`);
    let area = `M${X(0)},${Y(0)}`, line = '';
    for (let d = 0; d <= DMAX; d += 40) { const pt = `${X(d).toFixed(1)},${Y(TSU.speedKMH(d)).toFixed(1)}`; area += 'L' + pt; line += (line ? 'L' : 'M') + pt; }
    area += `L${X(DMAX)},${Y(0)}Z`;
    svg('path', { d: area, fill: lgrad(s, [[0, '#5ea7d8', 0.55], [1, '#5ea7d8', 0.05]]) }, s);
    svg('path', { d: line, fill: 'none', stroke: CP, 'stroke-width': 3 }, s);
    [[150, 'continental shelf'], [4000, 'open Pacific']].forEach(([d, l]) => {
      svg('line', { x1: X(d), x2: X(d), y1: Y(0), y2: Y(VMAX), stroke: '#2c5d85', 'stroke-dasharray': '2 4', 'stroke-opacity': 0.6 }, s);
      halo(txt(s, X(d) + 4, Y(VMAX) + 12, l, { 'font-size': 10.5, fill: '#2c5d85', 'font-style': 'italic' }));
    });
    const ov = svg('g', {}, s);
    const ro = h('div', 'readout');
    let depth = S.answers.t1d ?? 4000, t = 0;
    const setRacers = () => {
      const speeds = [TSU.speedKMH(depth), 900, 110, 25];
      laneG.forEach(({ g, y }, k) => { const d = Math.min(KM, speeds[k] * t / 60); g.setAttribute('transform', `translate(${XR(d)},${y})`); });
      clock.textContent = `race clock: ${fmtHM(t)}`;
    };
    const draw = () => {
      while (ov.firstChild) ov.removeChild(ov.firstChild);
      const v = TSU.speedKMH(depth);
      svg('line', { x1: X(depth), x2: X(depth), y1: Y(0), y2: Y(v), stroke: '#16191C', 'stroke-dasharray': '4 3' }, ov);
      svg('line', { x1: X(0), x2: X(depth), y1: Y(v), y2: Y(v), stroke: '#16191C', 'stroke-dasharray': '4 3' }, ov);
      svg('circle', { cx: X(depth), cy: Y(v), r: 7, fill: RED, stroke: '#fff', 'stroke-width': 2 }, ov);
      halo(txt(ov, X(depth) + (depth > 4800 ? -10 : 10), Y(v) - 10, `${Math.round(v)} km/h`, { 'font-size': 13, 'font-weight': 700, fill: RED, 'text-anchor': depth > 4800 ? 'end' : 'start' }), 4);
      ro.innerHTML = `At <strong>${Math.round(depth).toLocaleString('en-US')} m</strong> deep, a tsunami travels <strong>${Math.round(v).toLocaleString('en-US')} km/h</strong> (${TSU.speedMS(depth).toFixed(0)} m/s).`;
      setRacers();
    };
    const sl = slider('Water depth:', 10, 6000, 10, depth, 'm', x => { depth = x; S.answers.t1d = x; save(); stopAnim(); t = 0; draw(); });
    sl.input.style.width = '260px';
    ctr.append(sl.wrap);
    playButtons(ctr, () => { if (t >= 600) t = 0; animate(dt => { t = Math.min(600, t + dt * 12); setRacers(); return t < 600; }); }, () => { stopAnim(); t = 0; setRacers(); });
    p.append(ro); draw();
  }

  // ---------- Step 2: shoaling cross-section ----------
  function panel2(p) {
    const ctr = h('div', 'controls'); p.append(ctr);
    const W = 760, H = 380, L = 40, R = 18, SEA = 150, ZMAX = 4200;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
    const X = x => L + x / 300 * (W - L - R), Z = d => SEA + d / ZMAX * (H - SEA - 22);
    svg('rect', { x: 0, y: 0, width: W, height: SEA, fill: lgrad(s, [[0, '#dbeefa'], [1, '#f6fbff']]) }, s);
    svg('rect', { x: 0, y: SEA, width: W, height: H - SEA, fill: lgrad(s, [[0, '#7cc0ea'], [0.35, '#3d8cc6'], [1, '#0e3f6e']]) }, s);
    let floor = `M${X(0)},${Z(4000)}`; for (let x = 0; x <= 300; x += 2) floor += ` L${X(x).toFixed(1)},${Z(depthAt(x)).toFixed(1)}`;
    svg('path', { d: floor + ` L${W},${Z(2)} L${W},${H} L0,${H} L0,${Z(4000)} Z`, fill: lgrad(s, [[0, '#a3865e'], [1, '#6e5538']]) }, s);
    for (let k = 1; k <= 3; k++) { let d = ''; for (let x = 0; x <= 300; x += 4) d += (d ? 'L' : 'M') + X(x).toFixed(1) + ',' + (Z(depthAt(x)) + k * 9).toFixed(1); svg('path', { d, stroke: '#5a4430', 'stroke-opacity': 0.25, fill: 'none' }, s); }
    // coast, hills, town
    const cx = X(300);
    svg('path', { d: `M${cx - 4},${SEA + 1} L${cx + 6},${SEA - 10} L${W},${SEA - 22} L${W},${H} L${cx - 4},${H} Z`, fill: '#8f7651' }, s);
    svg('path', { d: `M${cx + 4},${SEA - 9} Q${cx + 10},${SEA - 30} ${W},${SEA - 60} L${W},${SEA - 22} Z`, fill: '#6f8f4e' }, s);
    for (let k = 0; k < 3; k++) { const hx = cx + 2 + k * 6; svg('rect', { x: hx - 2, y: SEA - 16 - k * 3, width: 4, height: 5, fill: '#fff', stroke: '#555', 'stroke-width': 0.5 }, s); }
    halo(txt(s, W - 4, SEA - 66, 'coast', { 'font-size': 12, 'font-weight': 700, 'text-anchor': 'end' }));
    txt(s, X(60), Z(4000) - 12, 'deep ocean floor, 4,000 m', { 'font-size': 12, fill: '#d6ecfb' });
    txt(s, X(222), Z(1500), 'continental slope', { 'font-size': 11.5, fill: '#d6ecfb', transform: `rotate(57 ${X(222)} ${Z(1500)})` });
    halo(txt(s, X(270), SEA + 22, 'shelf', { 'font-size': 11.5, fill: '#0e3f6e', 'text-anchor': 'middle' }), 2);
    for (let x = 0; x <= 250; x += 50) txt(s, X(x), H - 6, x + ' km', { 'font-size': 10.5, 'text-anchor': 'middle', fill: '#f2e8d8' });
    // inset: height along the path
    const IX = 52, IY = 14, IW = 230, IH = 96, HM = 14;
    svg('rect', { x: IX - 38, y: IY - 6, width: IW + 50, height: IH + 32, rx: 8, fill: '#ffffff', 'fill-opacity': 0.88, stroke: '#c9cdd2' }, s);
    const ix = x => IX + x / 300 * IW, iy = a => IY + IH - a / HM * IH;
    [0, 5, 10].forEach(a => { svg('line', { x1: ix(0), x2: ix(300), y1: iy(a), y2: iy(a), stroke: '#e6e9ec' }, s); txt(s, IX - 6, iy(a) + 4, a + ' m', { 'font-size': 9.5, 'text-anchor': 'end', fill: SLATE }); });
    txt(s, IX, IY + IH + 16, 'wave height along the way', { 'font-size': 10, fill: SLATE });
    const inset = svg('g', {}, s);
    const g = svg('g', {}, s);
    const waveFill = lgrad(s, [[0, '#a8dcf8'], [1, '#7cc0ea']]);
    const ro = h('div', 'readout');
    let pos = S.answers.t2x ?? 20, a0 = S.answers.t2a ?? 0.5;
    const draw = () => {
      while (g.firstChild) g.removeChild(g.firstChild);
      while (inset.firstChild) inset.removeChild(inset.firstChild);
      const d = depthAt(pos), a = TSU.greens(a0, 4000, d), v = TSU.speedKMH(d);
      const halfLen = Math.max(3, v / 3.6 * 900 / 1000 / 2);
      const amp = Math.min(SEA - 20, a * 9);
      let path = `M${X(Math.max(0, pos - halfLen))},${SEA}`, top = '';
      for (let k = 0; k <= 60; k++) { const xx = pos - halfLen + 2 * halfLen * k / 60; if (xx < 0 || xx > 300) continue; const yy = SEA - amp * Math.pow(Math.sin(Math.PI * k / 60), 2); const pt = `${X(xx).toFixed(1)},${yy.toFixed(1)}`; path += ' L' + pt; top += (top ? 'L' : 'M') + pt; }
      path += ` L${X(Math.min(300, pos + halfLen))},${SEA} Z`;
      svg('path', { d: path, fill: waveFill }, g);
      svg('path', { d: top, fill: 'none', stroke: '#ffffff', 'stroke-width': 2.5, 'stroke-opacity': 0.9 }, g);
      svg('line', { x1: X(pos), x2: X(pos), y1: SEA - amp - 4, y2: Z(d), stroke: '#ffffff', 'stroke-dasharray': '3 4', 'stroke-opacity': 0.9 }, g);
      const right = pos > 200;
      halo(txt(g, X(pos) + (right ? -10 : 10), SEA - amp - 10, `${a.toFixed(1)} m tall`, { 'font-size': 14, 'font-weight': 700, fill: '#0b4f8a', 'text-anchor': right ? 'end' : 'start' }), 4);
      halo(txt(g, X(pos) + (right ? -10 : 10), SEA - amp + 6, `${Math.round(v)} km/h`, { 'font-size': 11.5, fill: '#16191C', 'text-anchor': right ? 'end' : 'start' }), 3);
      let tr = ''; for (let x = 0; x <= 298; x += 2) tr += (tr ? 'L' : 'M') + ix(x).toFixed(1) + ',' + iy(Math.min(HM, TSU.greens(a0, 4000, depthAt(x)))).toFixed(1);
      svg('path', { d: tr, fill: 'none', stroke: '#9fb3c8', 'stroke-width': 1.5 }, inset);
      let done = ''; for (let x = 0; x <= pos; x += 2) done += (done ? 'L' : 'M') + ix(x).toFixed(1) + ',' + iy(Math.min(HM, TSU.greens(a0, 4000, depthAt(x)))).toFixed(1);
      if (done) svg('path', { d: done, fill: 'none', stroke: CP, 'stroke-width': 2.5 }, inset);
      svg('circle', { cx: ix(pos), cy: iy(Math.min(HM, a)), r: 4, fill: RED }, inset);
      ro.innerHTML = `Depth <strong>${Math.round(d).toLocaleString('en-US')} m</strong> - speed <strong>${Math.round(v)} km/h</strong> - height <strong>${a.toFixed(1)} m</strong> - wavelength about <strong>${Math.round(halfLen * 2)} km</strong>`;
    };
    const s1 = slider('Wave position:', 0, 298, 1, pos, 'km', v => { pos = v; S.answers.t2x = v; save(); draw(); });
    const s2 = slider('Height in deep ocean:', 0.2, 2, 0.1, a0, 'm', v => { a0 = v; S.answers.t2a = v; save(); draw(); });
    s1.input.style.width = '200px'; s2.input.style.width = '120px';
    ctr.append(s1.wrap, s2.wrap);
    playButtons(ctr, () => { if (pos >= 296) pos = 0; animate(dt => { pos = Math.min(298, pos + dt * 40); s1.input.value = Math.round(pos); s1.out.textContent = ` ${Math.round(pos)} km`; draw(); return pos < 298; }); });
    p.append(ro); draw();
    txt(s, W - 8, 16, 'wave heights drawn about 15 times taller than true scale', { 'font-size': 10.5, fill: SLATE, 'text-anchor': 'end' });
  }

  // ---------- Step 3: the 1700 tsunami on the Pacific map ----------
  const EPI1700 = [45.5, -125.3];
  const CASCADIA_LINE = [[40.4, -124.9], [42, -125.0], [44, -125.0], [46, -125.2], [47.5, -125.6], [48.5, -126.3], [49.6, -127.3]];
  const PLACES3 = { seaside: [45.99, -123.92], otsuchi: [39.35, 141.95], hilo: [19.72, -155.08] };
  function panel3(p) {
    const ctr = h('div', 'controls'); p.append(ctr);
    const wrap = h('div', 'map-wrap'); p.append(wrap);
    const s = drawPacific(wrap);
    svg('path', { d: geoD(CASCADIA_LINE), stroke: RED, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, s);
    const rings = ringLayer(s);
    const [ex, ey] = PAC.proj(...EPI1700); starAt(s, ex, ey, 10, RED);
    const mS = marker(s, ...PLACES3.seaside, 'Seaside', { dx: -10, dy: 18, anchor: 'end' });
    const mJ = marker(s, ...PLACES3.otsuchi, 'Otsuchi, Japan', { dx: 10, dy: -6 });
    const mH = marker(s, ...PLACES3.hilo, 'Hilo, Hawaii', { dx: 10 });
    const card = svg('g', {}, s);
    svg('rect', { x: PAC.W - 262, y: PAC.H - 128, width: 246, height: 112, rx: 10, fill: '#ffffff', 'fill-opacity': 0.92, stroke: '#c9cdd2' }, card);
    const c1 = txt(card, PAC.W - 248, PAC.H - 104, '', { 'font-size': 13, 'font-weight': 700, fill: RED });
    const c2 = txt(card, PAC.W - 248, PAC.H - 82, '', { 'font-size': 12 });
    const c3 = txt(card, PAC.W - 248, PAC.H - 62, '', { 'font-size': 12 });
    const c4 = txt(card, PAC.W - 248, PAC.H - 38, '', { 'font-size': 11.5, fill: SLATE });
    const tS = TSU.travelHours(TSU.ROUTES.seaside) * 60, tJ = TSU.travelHours(TSU.ROUTES.japan) * 60;
    const vDeep = TSU.speedKMH(TSU.ROUTES.japan.depth);
    const tH = TSU.gcKm(...EPI1700, ...PLACES3.hilo) / vDeep * 60;
    const ro = h('div', 'readout');
    let t = S.answers.t3t ?? 0;
    const draw = () => {
      while (rings.firstChild) rings.removeChild(rings.firstChild);
      const r = vDeep * t / 60;
      [[r - 700, 1.5, 0.35], [r - 350, 2, 0.6], [r, 4, 1]].forEach(([rr, w, op]) => drawRing(rings, ...EPI1700, rr, '#0b4f8a', { w, op, noGlow: op < 1 }));
      [[mS, tS], [mJ, tJ], [mH, tH]].forEach(([m, ta]) => { const hit = t >= ta; m.c.setAttribute('fill', hit ? RED : '#fff'); m.c.setAttribute('r', hit ? 7 : 5); });
      c1.textContent = `${fmtHM(t)} after the earthquake`;
      c2.textContent = `Oregon: ${clockStr(21, t, 26)}`;
      c3.textContent = `Japan: ${clockStr(14, t, 27)}`;
      c4.textContent = [t >= tS ? 'Seaside hit' : '', t >= tH ? 'Hilo hit' : '', t >= tJ ? 'Japan hit' : ''].filter(Boolean).join(' - ') || 'wave on its way';
      ro.innerHTML = `Seaside: ${t >= tS ? `<strong>arrived at ${Math.round(tS)} min</strong>` : 'not yet'} &nbsp;|&nbsp; Hilo: ${t >= tH ? `<strong>arrived at ${fmtHM(tH)}</strong>` : 'not yet'} &nbsp;|&nbsp; Japan: ${t >= tJ ? `<strong>arrived at ${fmtHM(tJ)}</strong>` : 'not yet'}`;
    };
    const sl = slider('Time after the earthquake:', 0, 720, 1, t, 'min', v => { t = v; S.answers.t3t = v; save(); draw(); });
    sl.input.style.width = '300px';
    ctr.append(sl.wrap);
    playButtons(ctr, () => { if (t >= 718) t = 0; animate(dt => { t = Math.min(720, t + dt * 55); sl.input.value = Math.round(t); sl.out.textContent = ` ${Math.round(t)} min`; draw(); return t < 720; }); });
    p.append(ro); draw();
    txt(s, 8, PAC.H - 8, 'Wavefront drawn for open-ocean depth (4,500 m). Basemap: Natural Earth.', { 'font-size': 10.5, fill: '#ffffff' });
  }

  // ---------- Step 4: Tonga race on the map ----------
  const TONGA_LL = [-20.55, -175.39], TOKYO = [35.0, 139.9], KRAKATAU = [-6.1, 105.42];
  function panel4(p) {
    const ctr = h('div', 'controls'); p.append(ctr);
    const wrap = h('div', 'map-wrap'); p.append(wrap);
    const s = drawPacific(wrap);
    const rings = ringLayer(s);
    const [tx, ty] = PAC.proj(...TONGA_LL); starAt(s, tx, ty, 10, '#7b3fbf');
    halo(txt(s, tx + 12, ty + 18, 'Hunga Tonga', { 'font-size': 12.5, 'font-weight': 700, fill: '#5b2a91' }), 3.5);
    const mJ = marker(s, ...TOKYO, 'Japan', { dx: 10, dy: 4 });
    const [kx, ky] = PAC.proj(...KRAKATAU); svg('polygon', { points: `${kx},${ky - 8} ${kx - 7},${ky + 5} ${kx + 7},${ky + 5}`, fill: '#c0392b', stroke: '#fff', 'stroke-width': 1.2 }, s);
    halo(txt(s, kx + 9, ky + 4, 'Krakatau (1883)', { 'font-size': 11.5, 'font-weight': 700, fill: '#8e2c20' }), 3);
    const key = svg('g', {}, s);
    svg('rect', { x: PAC.W - 286, y: PAC.H - 98, width: 270, height: 82, rx: 10, fill: '#fff', 'fill-opacity': 0.92, stroke: '#c9cdd2' }, key);
    svg('line', { x1: PAC.W - 272, x2: PAC.W - 238, y1: PAC.H - 74, y2: PAC.H - 74, stroke: '#7b3fbf', 'stroke-width': 3.5, 'stroke-dasharray': '9 6' }, key);
    txt(key, PAC.W - 230, PAC.H - 70, 'air pressure wave (meteotsunami)', { 'font-size': 12 });
    svg('line', { x1: PAC.W - 272, x2: PAC.W - 238, y1: PAC.H - 50, y2: PAC.H - 50, stroke: '#0b4f8a', 'stroke-width': 4 }, key);
    txt(key, PAC.W - 230, PAC.H - 46, 'classic tsunami', { 'font-size': 12 });
    const kt = txt(key, PAC.W - 272, PAC.H - 26, '', { 'font-size': 12, 'font-weight': 700, fill: RED });
    const T0 = TSU.TONGA, hP = T0.km / T0.pressureKMH * 60, hT = T0.km / TSU.speedKMH(T0.depth) * 60;
    const ro = h('div', 'readout');
    let t = S.answers.t4t ?? 0;
    const draw = () => {
      while (rings.firstChild) rings.removeChild(rings.firstChild);
      const rT = TSU.speedKMH(T0.depth) * t / 60, rP = T0.pressureKMH * t / 60;
      [[rT - 600, 1.5, 0.35], [rT - 300, 2, 0.6], [rT, 4, 1]].forEach(([rr, w, op]) => drawRing(rings, ...TONGA_LL, rr, '#0b4f8a', { w, op, noGlow: op < 1 }));
      drawRing(rings, ...TONGA_LL, rP, '#7b3fbf', { w: 3.5, dash: '10 7' });
      mJ.c.setAttribute('fill', t >= hP ? (t >= hT ? RED : '#b48be0') : '#fff'); mJ.c.setAttribute('r', t >= hP ? 7 : 5);
      kt.textContent = `${fmtHM(t)} after the eruption`;
      ro.innerHTML = `Pressure-driven waves reach Japan: ${t >= hP ? `<strong>${(hP / 60).toFixed(1)} h</strong>` : 'not yet'} &nbsp;|&nbsp; Classic tsunami: ${t >= hT ? `<strong>${(hT / 60).toFixed(1)} h</strong>` : 'not yet'}`;
    };
    const sl = slider('Time after the eruption:', 0, 720, 1, t, 'min', v => { t = v; S.answers.t4t = v; save(); draw(); });
    sl.input.style.width = '300px';
    ctr.append(sl.wrap);
    playButtons(ctr, () => { if (t >= 718) t = 0; animate(dt => { t = Math.min(720, t + dt * 55); sl.input.value = Math.round(t); sl.out.textContent = ` ${Math.round(t)} min`; draw(); return t < 720; }); });
    p.append(ro); draw();
    txt(s, 8, PAC.H - 8, `Model: pressure wave about 700 mph; tsunami over ${T0.depth.toLocaleString('en-US')} m of water. Basemap: Natural Earth.`, { 'font-size': 10.5, fill: '#ffffff' });
  }

  // ---------- Step 5: asteroid size and energy ----------
  function panel5(p) {
    const ctr = h('div', 'controls'); p.append(ctr);
    const W = 760, H = 440, SH = 250;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
    const sky = lgrad(s, [[0, '#0b1d3a'], [0.7, '#2b4f7e'], [1, '#86a9cf']]);
    const rock = rgrad(s, [[0, '#a1887f'], [0.6, '#6d4c41'], [1, '#3e2723']]);
    const scene = svg('g', {}, s);
    // energy bars
    const L = 230, R = 30, EMIN = -3, EMAX = 9, BT = SH + 18;
    const X = e => L + (e - EMIN) / (EMAX - EMIN) * (W - L - R);
    const TICK = { '-2': '0.01', '0': '1', '2': '100', '4': '10,000', '6': '1 million', '8': '100 million' };
    for (let e = EMIN; e <= EMAX; e++) { svg('line', { x1: X(e), x2: X(e), y1: BT, y2: H - 34, stroke: '#e6e9ec' }, s); if (TICK[e]) txt(s, X(e), H - 20, TICK[e], { 'font-size': 10.5, 'text-anchor': 'middle', fill: SLATE }); }
    txt(s, (X(EMIN) + X(EMAX)) / 2, H - 4, 'Impact energy (megatons of TNT, each grid line is 10 times more)', { 'font-size': 11.5, 'text-anchor': 'middle', fill: SLATE });
    const bars = svg('g', {}, s);
    const ro = h('div', 'readout');
    let dKm = S.answers.t5d ?? 0.1, v = S.answers.t5v ?? 20;
    const chic = TSU.impactMt(14, 12);
    const FRAMES = [
      { max: 0.2, w: 1, unit: 'm', bar: 200, refs: [['football field (110 m)', 'field', 0.11], ['Statue of Liberty with base (93 m)', 'tower', 0.093]] },
      { max: 2, w: 10, unit: 'km', bar: 2, refs: [['Burj Khalifa (828 m)', 'tower', 0.828], ['Eiffel Tower (330 m)', 'tower', 0.33]] },
      { max: 99, w: 100, unit: 'km', bar: 20, refs: [['Mount Everest (8.8 km)', 'mtn', 8.85], ['jets cruise near 11 km', 'line', 11]] }
    ];
    const draw = () => {
      while (scene.firstChild) scene.removeChild(scene.firstChild);
      const F = FRAMES.find(f => dKm <= f.max);
      const pxKm = (W - 40) / F.w, groundY = SH - 34;
      svg('rect', { x: 0, y: 0, width: W, height: SH, fill: sky }, scene);
      for (let k = 0; k < 40; k++) svg('circle', { cx: (k * 137) % W, cy: (k * 53) % (groundY - 40), r: k % 5 ? 0.8 : 1.4, fill: '#fff', opacity: 0.7 }, scene);
      svg('rect', { x: 0, y: groundY, width: W, height: SH - groundY, fill: lgrad(s, [[0, '#2f78b5'], [1, '#174a7c']]) }, scene);
      let x0 = 40;
      F.refs.forEach(([n, kind, sz]) => {
        const hp = sz * pxKm;
        if (kind === 'field') { svg('rect', { x: x0, y: groundY - 4, width: hp, height: 4, fill: '#4caf50' }, scene); halo(txt(scene, x0, groundY - 10, n, { 'font-size': 11, fill: '#16191C' }), 3); x0 += hp + 50; }
        if (kind === 'tower') { svg('path', { d: `M${x0},${groundY} L${x0 + Math.max(3, hp * 0.12)},${groundY - hp} L${x0 + Math.max(6, hp * 0.24)},${groundY} Z`, fill: '#cfd8dc', stroke: '#90a4ae' }, scene); halo(txt(scene, x0 + 10, groundY - Math.min(hp, groundY - 20) - 6, n, { 'font-size': 11, fill: '#16191C' }), 3); x0 += Math.max(60, hp * 0.3) + 90; }
        if (kind === 'mtn') { svg('path', { d: `M${x0},${groundY} L${x0 + hp * 1.2},${groundY - hp} L${x0 + hp * 2.4},${groundY} Z`, fill: '#8d9aa6', stroke: '#eceff1' }, scene); svg('path', { d: `M${x0 + hp * 1.05},${groundY - hp * 0.87} L${x0 + hp * 1.2},${groundY - hp} L${x0 + hp * 1.35},${groundY - hp * 0.87} Z`, fill: '#fff' }, scene); halo(txt(scene, x0 + hp * 1.2, groundY - hp - 8, n, { 'font-size': 11, fill: '#16191C', 'text-anchor': 'middle' }), 3); x0 += hp * 2.4 + 30; }
        if (kind === 'line') { const y = groundY - hp; svg('line', { x1: 20, x2: W - 20, y1: y, y2: y, stroke: '#fff', 'stroke-dasharray': '4 6', 'stroke-opacity': 0.6 }, scene); txt(scene, W - 24, y - 5, n, { 'font-size': 10.5, fill: '#fff', 'text-anchor': 'end', opacity: 0.85 }); }
      });
      const rr = Math.max(2, dKm * pxKm / 2), ax = W - 150, ay = Math.max(rr + 10, groundY - rr - 40);
      for (let k = 1; k <= 4; k++) svg('line', { x1: ax + rr * 0.7 + k * 14, y1: ay - rr * 0.7 - k * 14, x2: ax + rr * 0.7 + k * 14 + 40 + rr * 0.5, y2: ay - rr * 0.7 - k * 14 - 40 - rr * 0.5, stroke: '#ffcc80', 'stroke-opacity': 0.5 - k * 0.1, 'stroke-width': Math.max(1, rr * 0.25) }, scene);
      svg('circle', { cx: ax, cy: ay, r: rr, fill: rock }, scene);
      if (rr > 10) [[-0.3, -0.2, 0.18], [0.25, 0.15, 0.12], [-0.05, 0.35, 0.1]].forEach(([a, b, c]) => svg('circle', { cx: ax + a * rr, cy: ay + b * rr, r: c * rr, fill: '#3e2723', opacity: 0.45 }, scene));
      halo(txt(scene, ax, ay + rr + 16, `your asteroid, ${dKm >= 1 ? dKm.toFixed(1) + ' km' : Math.round(dKm * 1000) + ' m'}`, { 'font-size': 12, 'font-weight': 700, fill: '#16191C', 'text-anchor': 'middle' }), 3.5);
      const bw = F.bar * (F.unit === 'm' ? pxKm / 1000 : pxKm);
      svg('rect', { x: 20, y: 12, width: bw, height: 5, fill: '#fff' }, scene);
      txt(scene, 20, 32, `${F.bar} ${F.unit}`, { 'font-size': 11, fill: '#fff' });
      txt(scene, W - 16, 22, 'drawn to scale - the view zooms out for bigger asteroids', { 'font-size': 10.5, fill: '#fff', 'text-anchor': 'end', opacity: 0.85 });
      while (bars.firstChild) bars.removeChild(bars.firstChild);
      const E = TSU.impactMt(dKm, v);
      [['Hiroshima bomb', '(1945)', 0.015, '#9e9e9e'], ['Your asteroid', '', E, CP], ['Chicxulub-size asteroid', '(66 million years ago)', chic, RED]].forEach(([n, sub, en, col], k) => {
        const y = BT + 6 + k * 40;
        txt(bars, L - 10, y + 15, n, { 'font-size': 12.5, 'text-anchor': 'end', fill: col, 'font-weight': 700 });
        if (sub) txt(bars, L - 10, y + 29, sub, { 'font-size': 10.5, 'text-anchor': 'end', fill: SLATE });
        const x1 = X(Math.max(EMIN, Math.min(EMAX, Math.log10(en))));
        svg('rect', { x: X(EMIN), y: y + 2, width: Math.max(2, x1 - X(EMIN)), height: 22, fill: col, rx: 5 }, bars);
      });
      const fm = x => x >= 1 ? Math.round(x).toLocaleString('en-US') : x.toPrecision(2);
      ro.innerHTML = `A <strong>${dKm >= 1 ? dKm.toFixed(1) + ' km' : Math.round(dKm * 1000) + ' m'}</strong> stony asteroid at <strong>${v} km/s</strong> carries about <strong>${fm(E)} megatons</strong> - about ${fm(E / 0.015)} Hiroshima bombs.`;
    };
    const s1 = slider('Diameter:', -2, 1.3, 0.01, Math.log10(dKm), '', x => { dKm = Math.pow(10, x); S.answers.t5d = dKm; save(); draw(); });
    s1.out.hidden = true;
    const s2 = slider('Speed:', 11, 30, 1, v, 'km/s', x => { v = x; S.answers.t5v = x; save(); draw(); });
    ctr.append(s1.wrap, s2.wrap); p.append(ro); draw();
  }

  // ---------- Step 6: evacuation map ----------
  let route6 = 'high';
  function panel6(p) {
    const sc = SC;
    const ctr = h('div', 'controls'); const seg = h('div', 'seg');
    [['high', `High ground (${sc.high.toLocaleString('en-US')} m)`], ['tower', `Evacuation tower (${sc.tower} m)`]].forEach(([k, l]) => {
      const b = h('button', route6 === k ? 'on' : '', l); b.type = 'button'; b.onclick = () => { route6 = k; renderPanel(); }; seg.append(b);
    });
    ctr.append(h('span', '', 'Route:'), seg); p.append(ctr);
    const W = 760, H = 300;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig evac-map' }, p);
    const BEACH = 120, START = 205, Y0 = 210;
    const scale = Math.min(360 / sc.high, 150 / sc.tower, 2.5);   // px per meter
    const EDGE = START + sc.high * scale;
    const towerXY = [START, Y0 - sc.tower * scale];
    svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#e8e2cf' }, s);
    svg('rect', { x: EDGE, y: 0, width: W - EDGE, height: H, fill: lgrad(s, [[0, '#a5c27f'], [1, '#6f8f4e']], 1, 0) }, s);
    for (let k = 1; k <= 5; k++) svg('path', { d: `M${EDGE + k * 22},0 Q${EDGE + k * 22 - 18},${H / 2} ${EDGE + k * 22},${H}`, stroke: '#4f6b34', 'stroke-opacity': 0.35, fill: 'none' }, s);
    for (let k = 0; k < 14; k++) { const x = EDGE + 30 + (k * 53) % Math.max(40, W - EDGE - 40), y = 20 + (k * 71) % (H - 40); svg('circle', { cx: x, cy: y, r: 7, fill: '#3f6b2e', opacity: 0.75 }, s); }
    halo(txt(s, Math.min(W - 70, EDGE + (W - EDGE) / 2), 54, 'HIGH GROUND', { 'font-size': 13, 'font-weight': 700, fill: '#2f4f1f', 'text-anchor': 'middle', 'letter-spacing': '0.06em' }), 3);
    // streets and houses in the inundation zone
    for (let y = 40; y < H; y += 70) svg('line', { x1: BEACH + 20, x2: W, y1: y, y2: y, stroke: '#ffffff', 'stroke-width': 7 }, s);
    for (let x = START; x < EDGE; x += 80) svg('line', { x1: x, x2: x, y1: 0, y2: H, stroke: '#ffffff', 'stroke-width': 7 }, s);
    svg('line', { x1: START, x2: START, y1: 0, y2: H, stroke: '#ffffff', 'stroke-width': 7 }, s);
    for (let x = BEACH + 30; x < EDGE - 10; x += 38) for (let y = 12; y < H; y += 70) if (Math.abs(x - START) > 18) { svg('rect', { x, y: y + 2, width: 16, height: 14, fill: '#d7ccc8', stroke: '#8d6e63', 'stroke-width': 0.8 }, s); svg('rect', { x, y: y + 34, width: 16, height: 14, fill: '#d7ccc8', stroke: '#8d6e63', 'stroke-width': 0.8 }, s); }
    svg('rect', { x: BEACH, y: 0, width: Math.max(0, EDGE - BEACH), height: H, fill: '#e53935', 'fill-opacity': 0.08 }, s);
    svg('line', { x1: EDGE, x2: EDGE, y1: 0, y2: H, stroke: '#c62828', 'stroke-width': 2, 'stroke-dasharray': '7 5' }, s);
    halo(txt(s, EDGE < 330 ? EDGE + 6 : EDGE - 6, H - 10, 'edge of tsunami zone', { 'font-size': 11, fill: '#c62828', 'text-anchor': EDGE < 330 ? 'start' : 'end', 'font-weight': 700 }), 3);
    // beach and ocean
    svg('rect', { x: BEACH - 25, y: 0, width: 25, height: H, fill: '#f3e3b5' }, s);
    svg('rect', { x: 0, y: 0, width: BEACH - 25, height: H, fill: lgrad(s, [[0, '#2f78b5'], [1, '#6fb6e6']], 1, 0) }, s);
    for (let k = 0; k < 8; k++) svg('path', { d: `M${20 + (k % 3) * 22},${18 + k * 36} q8,-6 16,0 t16,0`, stroke: '#ffffff', 'stroke-opacity': 0.6, fill: 'none', 'stroke-width': 1.5 }, s);
    halo(txt(s, 12, 18, 'OCEAN', { 'font-size': 12, 'font-weight': 700, fill: '#0b3d6b' }), 2);
    // tower
    const [tx, ty] = towerXY;
    svg('rect', { x: tx - 11, y: ty - 11, width: 22, height: 22, rx: 3, fill: '#5C6670', stroke: '#16191C', 'stroke-width': 1.2 }, s);
    svg('path', { d: `M${tx - 7},${ty + 5} L${tx},${ty - 6} L${tx + 7},${ty + 5}`, stroke: '#fff', 'stroke-width': 2, fill: 'none' }, s);
    halo(txt(s, tx + 15, ty + 4, 'evacuation tower', { 'font-size': 11, 'font-weight': 700, fill: '#16191C' }), 3);
    // route
    const dest = route6 === 'high' ? [EDGE + 10, Y0] : [tx, ty + 12];
    svg('line', { x1: START, y1: Y0, x2: dest[0], y2: dest[1], stroke: '#0f8b8d', 'stroke-width': 4, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round' }, s);
    // scale bar
    const sb = 100 * scale >= 40 ? 100 : 200;
    svg('rect', { x: W - sb * scale - 20, y: H - 26, width: sb * scale, height: 4, fill: '#16191C' }, s);
    txt(s, W - 20, H - 32, `${sb} m`, { 'font-size': 10.5, 'text-anchor': 'end' });
    const water = svg('g', {}, s);
    const who = svg('g', {}, s);
    const status = halo(txt(s, 0, 0, '', { 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle' }), 3.5);
    const clock = halo(txt(s, W - 10, 20, '', { 'font-size': 14, 'font-weight': 700, 'text-anchor': 'end', fill: '#16191C' }), 4);
    // timeline below
    const TL = svg('svg', { viewBox: `0 0 ${W} 86`, class: 'fig' }, p);
    const TMAX = 35, XT = m => 30 + m / TMAX * (W - 60);
    for (let m = 0; m <= TMAX; m += 5) { svg('line', { x1: XT(m), x2: XT(m), y1: 14, y2: 58, stroke: '#e6e9ec' }, TL); txt(TL, XT(m), 72, m, { 'font-size': 10.5, 'text-anchor': 'middle', fill: SLATE }); }
    txt(TL, W / 2, 85, 'Minutes after the shaking starts', { 'font-size': 11, 'text-anchor': 'middle', fill: SLATE });
    const walk = route6 === 'high' ? sc.walkHigh : sc.walkTower, end = sc.delay + walk, safe = end <= sc.arrival;
    svg('rect', { x: XT(0), y: 24, width: XT(4) - XT(0), height: 24, rx: 4, fill: '#8e44ad' }, TL);
    svg('rect', { x: XT(4), y: 24, width: XT(sc.delay) - XT(4), height: 24, rx: 4, fill: '#c48a00' }, TL);
    svg('rect', { x: XT(sc.delay), y: 24, width: Math.max(2, XT(Math.min(TMAX, end)) - XT(sc.delay)), height: 24, rx: 4, fill: '#0f8b8d' }, TL);
    txt(TL, XT(0) + 4, 40, 'shaking', { 'font-size': 10.5, fill: '#fff', 'font-weight': 700 });
    txt(TL, XT(4) + 4, 40, 'getting going', { 'font-size': 10.5, fill: '#fff', 'font-weight': 700 });
    { const wide = XT(Math.min(TMAX, end)) - XT(sc.delay) > 95; txt(TL, wide ? XT(sc.delay) + 4 : XT(Math.min(TMAX, end)) + 5, 40, `walking ${walk.toFixed(1)} min`, { 'font-size': 10.5, fill: wide ? '#fff' : '#0f8b8d', 'font-weight': 700 }); }
    svg('line', { x1: XT(sc.arrival), x2: XT(sc.arrival), y1: 8, y2: 58, stroke: CP, 'stroke-width': 3 }, TL);
    halo(txt(TL, XT(sc.arrival) + 5, 12, `tsunami arrives, ${sc.arrival} min`, { 'font-size': 11, fill: CP, 'font-weight': 700 }), 3);
    const tMark = svg('line', { x1: 0, x2: 0, y1: 18, y2: 54, stroke: '#16191C', 'stroke-width': 2 }, TL);
    let t = 0;
    const draw = () => {
      // water front: reaches the beach at arrival - 1 min, the zone edge at arrival + 4 min
      while (water.firstChild) water.removeChild(water.firstChild);
      if (t > sc.arrival - 1) {
        const f = Math.min(1, (t - (sc.arrival - 1)) / 5), wx = BEACH - 25 + f * (EDGE - BEACH + 25);
        let d = `M0,0 L${wx},0`; for (let y = 0; y <= H; y += 15) d += ` L${wx + 6 * Math.sin(y / 15 + t * 3)},${y}`; d += ` L0,${H} Z`;
        svg('path', { d, fill: '#1e6fb5', 'fill-opacity': 0.55 }, water);
        let crest = ''; for (let y = 0; y <= H; y += 15) crest += (crest ? 'L' : 'M') + (wx + 6 * Math.sin(y / 15 + t * 3)).toFixed(1) + ',' + y;
        svg('path', { d: crest, stroke: '#fff', 'stroke-width': 3, fill: 'none' }, water);
      }
      while (who.firstChild) who.removeChild(who.firstChild);
      const len = Math.hypot(dest[0] - START, dest[1] - Y0), metres = route6 === 'high' ? sc.high : sc.tower;
      const prog = Math.max(0, Math.min(1, (t - sc.delay) * 60 * sc.person.speed / metres));
      const px = START + (dest[0] - START) * prog, py = Y0 + (dest[1] - Y0) * prog;
      const wx = t > sc.arrival - 1 ? BEACH - 25 + Math.min(1, (t - (sc.arrival - 1)) / 5) * (EDGE - BEACH + 25) : -1;
      const caught = prog < 1 && px <= wx;
      svg('circle', { cx: px, cy: py, r: 9, fill: caught ? RED : prog >= 1 ? '#1d7a46' : '#16191C', stroke: '#fff', 'stroke-width': 2.5 }, who);
      txt(who, px, py + 4, prog >= 1 ? '✓' : caught ? '!' : '', { 'font-size': 12, fill: '#fff', 'text-anchor': 'middle', 'font-weight': 700 });
      halo(txt(who, px, py - 14, 'you', { 'font-size': 11, 'font-weight': 700, 'text-anchor': 'middle' }), 3);
      status.setAttribute('x', px); status.setAttribute('y', py + 26); status.setAttribute('text-anchor', px > W - 120 ? 'end' : 'middle'); s.appendChild(status);
      status.textContent = prog >= 1 ? 'safe!' : caught ? 'caught by the tsunami' : t < sc.delay ? (t < 4 ? 'shaking - drop, cover, hold on' : 'getting going...') : 'walking...';
      status.setAttribute('fill', prog >= 1 ? '#1d7a46' : caught ? RED : '#16191C');
      clock.textContent = `${t.toFixed(1)} min after the shaking starts`;
      tMark.setAttribute('x1', XT(Math.min(TMAX, t))); tMark.setAttribute('x2', XT(Math.min(TMAX, t)));
    };
    const tEnd = Math.min(TMAX, sc.arrival + 6);
    const sl = slider('Time:', 0, tEnd, 0.1, 0, 'min', v => { t = v; draw(); });
    sl.input.style.width = '220px';
    ctr.append(sl.wrap);
    const info = h('div', 'mcard sit-card');
    info.innerHTML = `<strong>You:</strong> ${sc.person.who}, ${sc.person.speed} m/s &nbsp;|&nbsp; <strong>Tsunami:</strong> ${sc.arrival} min &nbsp;|&nbsp; <strong>Leave after:</strong> ${sc.delay} min &nbsp;|&nbsp; <strong>High ground:</strong> ${sc.high.toLocaleString('en-US')} m &nbsp;|&nbsp; <strong>Tower:</strong> ${sc.tower} m`;
    p.append(info);
    playButtons(ctr, () => { if (t >= tEnd - 0.05) t = 0; animate(dt => { t = Math.min(tEnd, t + dt * 2.5); sl.input.value = t; sl.out.textContent = ` ${t.toFixed(1)} min`; draw(); return t < tEnd; }); });
    draw();
  }

  // ---------- step registry ----------
  const STEPS = [];
  const def = o => STEPS.push(o);

  function checkRow(onCheck, nextLabel) {
    const row = h('div', 'check-row');
    const b = h('button', 'btn', 'Check my answers'); b.type = 'button';
    const st = h('span', 'status');
    const nx = h('button', 'btn secondary', nextLabel || 'Next step →'); nx.type = 'button'; nx.hidden = true;
    b.onclick = () => {
      const ok = onCheck();
      st.className = 'status ' + (ok ? 'ok' : 'no');
      st.textContent = ok ? 'All correct - this step is complete.' : 'Not quite yet. Check the notes above, use a hint, and try again.';
      if (ok) { S.done[S.step] = true; save(); renderTabs(); nx.hidden = false; }
    };
    nx.onclick = () => go(S.step + 1);
    if (S.done[S.step]) { nx.hidden = false; st.className = 'status ok'; st.textContent = 'This step is complete.'; }
    row.append(b, st, nx);
    const wrap = h('div'); wrap.append(row, h('div', '', stuckBox()));
    return wrap;
  }
  // multiple-choice question
  function mcq(key, prompt, options, correct, right, wrong) {
    const q = h('div', 'q');
    q.innerHTML = `<div class="prompt">${prompt}</div>` + options.map((o, k) =>
      `<label class="opt"><input type="radio" name="${key}" value="${k}" ${S.answers[key] == k ? 'checked' : ''}> ${o}</label>`).join('') + '<div class="fb"></div>';
    q.addEventListener('change', e => { if (e.target.name === key) { S.answers[key] = +e.target.value; save(); } });
    q.check = () => {
      const v = S.answers[key];
      const ok = v === correct;
      q.className = 'q ' + (ok ? 'good' : 'bad');
      q.querySelector('.fb').innerHTML = v == null ? 'Choose an answer.' : (ok ? right : wrong);
      return ok;
    };
    return q;
  }
  function stuckBox() {
    return `<details class="hint stuck"><summary>Stuck, or something not working?</summary><div>
      <p><strong>Stuck on the science?</strong> Open the hints above, and click any underlined word for a short explanation. Each check tells you which answer to look at again, so change one thing at a time and check again.</p>
      <p><strong>Lost your progress?</strong> Your work is saved in this browser on this computer. A private or incognito window, a different browser or a different computer starts fresh. Go back to the same browser and it will be there.</p>
      <p><strong>Pop-out button does nothing?</strong> Your browser is blocking pop-ups. The lab works fine without them.</p>
      <p><strong>Still stuck?</strong> Send your instructor a Canvas message with your scenario number (${S.seed ?? '-'}), the step, and a screenshot.</p>
    </div></details>`;
  }
  function hint(html, title = 'Need a hint?') { return `<details class="hint poptext"><summary>${title}</summary><div>${html}</div></details>`; }


  function drawStartPanel(p) {
    const W = 760, H = 330;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
    svg('rect', { x: 0, y: 0, width: W, height: 200, fill: '#e3f0fa' }, s);
    svg('rect', { x: 0, y: 200, width: W, height: 130, fill: '#4f8fc0' }, s);
    // three causes
    const cause = (x, title, sub, draw) => { draw(x); txt(s, x, 300, title, { 'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle', fill: '#fff' }); txt(s, x, 318, sub, { 'font-size': 11.5, 'text-anchor': 'middle', fill: '#fff' }); };
    cause(130, 'Earthquakes', 'Cascadia 1700', x => { svg('path', { d: `M${x - 70},230 L${x},230 L${x + 10},214 L${x + 70},214`, stroke: '#5d4037', 'stroke-width': 6, fill: 'none' }, s); svg('path', { d: `M${x - 60},200 q30,-26 60,0 q30,26 60,0`, stroke: '#fff', 'stroke-width': 3, fill: 'none' }, s); });
    cause(380, 'Volcanoes', 'Krakatau 1883, Tonga 2022', x => { svg('polygon', { points: `${x - 60},200 ${x - 12},120 ${x + 12},120 ${x + 60},200`, fill: '#8d6e63' }, s); svg('path', { d: `M${x - 8},120 C${x - 40},60 ${x - 10},30 ${x},40 C${x + 10},30 ${x + 40},60 ${x + 8},120 Z`, fill: '#757575' }, s); svg('path', { d: `M${x - 90},205 q25,-18 50,0 M${x + 40},205 q25,-18 50,0`, stroke: '#fff', 'stroke-width': 3, fill: 'none' }, s); });
    cause(630, 'Asteroids', 'Chicxulub, 66 million years ago', x => { svg('line', { x1: x + 70, y1: 30, x2: x + 8, y2: 185, stroke: '#ffb74d', 'stroke-width': 4 }, s); svg('circle', { cx: x + 8, cy: 185, r: 12, fill: '#6d4c41' }, s); svg('path', { d: `M${x - 70},205 q25,-22 50,0 M${x + 30},205 q25,-22 50,0`, stroke: '#fff', 'stroke-width': 3, fill: 'none' }, s); });
    txt(s, 380, 26, 'Three ways to start a tsunami', { 'font-size': 20, 'font-weight': 700, 'text-anchor': 'middle', fill: RED });
  }

  // ===== Step 0: Start =====
  def({
    tab: 'Start',
    panel(p) {
      p.append(h('p', 'panel-title', 'Where tsunamis come from'));
      drawStartPanel(p);
    },
    content(c) {
      c.innerHTML = `<h2>Race the Wave</h2>
      <div class="poptext">
      <p>On January 26, 1700, a giant earthquake off the Pacific Northwest sent a tsunami onto the Oregon and Washington coast in minutes, and across the Pacific to Japan in hours. Tsunamis can also come from volcanoes, like Krakatau in 1883 and Tonga in 2022, and from asteroids hitting the ocean.</p>
      <p>In this lab we work out how fast a ${T('tsunami', 'tsunami')} travels and why it grows near the coast, follow the 1700 tsunami on its two trips, race the strange waves from the 2022 Tonga eruption, size up an asteroid impact, and finish with your own evacuation plan.</p>
      <p>Each step checks your answers and has hints. There are six steps, and most people need about an hour to an hour and a half. At the end you get a certificate to upload to Canvas.</p>
      <p class="small">Click any word with a dotted underline for a short explanation.</p>
      </div>
      <div class="warn-box">
        <strong>Before you start</strong>
        <ul>
          <li>Use a laptop or desktop computer with Chrome, Edge, Firefox or Safari.</li>
          <li><strong>Do not use a private or incognito window.</strong> Your work will not be saved.</li>
          <li>Your work saves automatically, so you can stop and come back. Come back on the <strong>same computer and the same browser</strong>.</li>
          <li>When you get your <strong>scenario number</strong>, write it down. It is your backup if anything goes wrong.</li>
        </ul>
      </div>`;
      const box = h('div', 'q');
      if (S.seed == null) {
        box.innerHTML = `<div class="prompt">New to the lab? Type your first and last name the way it appears in Canvas</div>`;
        const inp = document.createElement('input'); inp.className = 'name-in'; inp.type = 'text'; inp.placeholder = 'First and last name'; inp.setAttribute('aria-label', 'Your first and last name');
        const b = h('button', 'btn', 'Start the lab'); b.type = 'button'; b.style.marginLeft = '8px';
        const fb = h('div', 'fb');
        b.onclick = () => {
          const nm = inp.value.trim().replace(/\s+/g, ' ');
          if (nm.length < 3 || !/\s/.test(nm)) { fb.textContent = 'Please enter your first and last name.'; box.className = 'q bad'; return; }
          S = blank(); S.name = nm; S.seed = 10000 + Math.floor(Math.random() * 89999); S.done[0] = true; save(); loadScenario();
          alert(`Your scenario number is ${S.seed}.\n\nWrite it down now. If you switch computers or browsers, or lose your work, you can use it with your name on the Start page to get the same lab back.`);
          go(1);
        };
        box.append(inp, b, fb);
        const rbox = h('div', 'q');
        rbox.innerHTML = `<div class="prompt">Already started on another computer or browser?</div>
          <p class="small" style="margin:0 0 6px">Type the same name and your scenario number to get the same evacuation scenario back. You will go through the steps again, but it goes faster the second time.</p>`;
        const rn = document.createElement('input'); rn.className = 'name-in'; rn.type = 'text'; rn.placeholder = 'First and last name'; rn.setAttribute('aria-label', 'Your first and last name');
        const rs = document.createElement('input'); rs.type = 'number'; rs.placeholder = 'Scenario number'; rs.setAttribute('aria-label', 'Your scenario number');
        rs.style.cssText = 'font:inherit;padding:8px 10px;width:170px;border:1px solid #aab;border-radius:6px;margin-left:8px';
        const rb = h('button', 'btn secondary', 'Continue my lab'); rb.type = 'button'; rb.style.marginLeft = '8px';
        const rfb = h('div', 'fb');
        rb.onclick = () => {
          const nm = rn.value.trim().replace(/\s+/g, ' '), sd = parseInt(rs.value, 10);
          if (nm.length < 3 || !/\s/.test(nm)) { rfb.textContent = 'Please enter your first and last name.'; rbox.className = 'q bad'; return; }
          if (!(sd >= 10000 && sd <= 99999)) { rfb.textContent = 'The scenario number has five digits.'; rbox.className = 'q bad'; return; }
          S = blank(); S.name = nm; S.seed = sd; S.done[0] = true; save(); loadScenario(); go(1);
        };
        rbox.append(rn, rs, rb, rfb);
        c.append(box); box.after(rbox); return;
      } else {
        box.innerHTML = `<div class="prompt">Welcome back, ${escapeHtml(S.name)}.</div><p>Your scenario number is <strong>${S.seed}</strong>. Your work so far is saved.</p>`;
        const b = h('button', 'btn', 'Continue where I left off'); b.type = 'button'; b.onclick = () => go(firstOpen());
        const r = h('button', 'btn secondary', 'Start over'); r.type = 'button'; r.style.marginLeft = '8px';
        r.onclick = () => { if (confirm('Are you sure? Starting over ERASES your work in this browser and gives you a NEW scenario.\n\nIf you just want to keep going, click Cancel, then "Continue where I left off".')) { S = blank(); save(); loadScenario(); go(0); } };
        box.append(b, r);
      }
      c.append(box);
    }
  });


  // ===== Step 1: How fast is a tsunami? =====
  def({
    tab: '1. Tsunami speed',
    panel(p) {
      p.append(h('p', 'panel-title', 'Tsunami speed depends on water depth'));
      panel1(p);
    },
    content(c) {
      c.innerHTML = `<h2>How fast is a tsunami?</h2>
      <div class="poptext">
      <p>A ${T('tsunami', 'tsunami')} is not a wind wave. When an earthquake lifts the seafloor, the whole column of water above it is lifted too, from the bottom of the ocean to the top, and so the wave carries a huge amount of water. Its ${T('wavelength', 'wavelength')} can be 100 km or more, much longer than the ocean is deep.</p>
      <p>For a wave like that - a ${T('shallow-water-wave', 'shallow-water wave')} - the speed depends only on the water depth: speed = √(g × depth), where g is gravity, 9.81 m/s². Move the depth slider and watch the speed change on the curve. Then press Play to race the tsunami against a jet, a car and a sprinter over 1,000 km.</p>
      ${hint('The average depth of the open Pacific Ocean is about 4,000 m. Set the slider there and read the speed.')}
      </div>`;
      const q1 = h('div', 'q');
      q1.innerHTML = `<div class="prompt">How fast does a tsunami travel in water 4,000 m deep?</div>
        <input type="number" step="1" value="${S.answers.t1v ?? ''}" aria-label="Speed in kilometers per hour"> km/h <div class="fb"></div>`;
      q1.querySelector('input').addEventListener('input', e => { S.answers.t1v = e.target.value === '' ? null : +e.target.value; save(); });
      q1.check = () => {
        const v = S.answers.t1v, ok = v != null && Math.abs(v - TSU.speedKMH(4000)) <= 25;
        q1.className = 'q ' + (ok ? 'good' : 'bad');
        q1.querySelector('.fb').innerHTML = v == null ? 'Enter a number.' : ok ? `Right, about ${Math.round(TSU.speedKMH(4000))} km/h - close to the speed of a jet.` : 'Set the slider to 4,000 m and read the speed.';
        return ok;
      };
      const q2 = mcq('t1q2', 'What happens to a tsunami\'s speed as it moves into shallower water near the coast?', ['It speeds up', 'It slows down', 'It stays the same', 'It stops completely'], 1,
        'Right. In 10 m of water it moves about 36 km/h, still faster than anyone can run, but much slower than out at sea.', 'Slide the depth down toward 10 m and watch the red dot.');
      const q3 = mcq('t1q3', 'A ship far out in the deep ocean is crossed by a tsunami. What do the sailors most likely notice?', ['A towering wall of water', 'Almost nothing - the wave is very long and low out at sea', 'The ship is pushed onto the seafloor', 'The water turns warm'], 1,
        'Right. In deep water a tsunami may be less than a meter high, spread over a wavelength of 100 km or more, and so ships barely feel it.', 'Think about how long and how tall a tsunami is out in the deep ocean.');
      c.append(q1, q2, q3, checkRow(() => [q1.check(), q2.check(), q3.check()].every(Boolean)));
    }
  });

  // ===== Step 2: The wave grows near shore =====
  const PROF = [[0, 4000], [190, 4000], [250, 200], [285, 30], [300, 2]];   // distance (km), depth (m)
  const depthAt = x => { for (let i = 0; i < PROF.length - 1; i++) { const [xa, da] = PROF[i], [xb, db] = PROF[i + 1]; if (x >= xa && x <= xb) return da + (db - da) * (x - xa) / (xb - xa); } return 2; };
  def({
    tab: '2. Growing near shore',
    panel(p) {
      p.append(h('p', 'panel-title', 'A tsunami moving from the deep ocean onto the continental shelf'));
      panel2(p);
    },
    content(c) {
      c.innerHTML = `<h2>The wave grows near shore</h2>
      <div class="poptext">
      <p>Out in the deep ocean a tsunami is fast, long and low. As it reaches the continental shelf, the front of the wave slows down while the back is still moving fast, and so the wave bunches up. The same energy gets squeezed into less water, and the wave grows taller. This is called ${T('shoaling', 'shoaling')}.</p>
      <p>Move the wave from the deep ocean toward the coast (or press Play) and watch the speed, the wavelength and the height. The heights follow a simple rule called ${T('greens-law', 'Green\'s law')}. Real coastlines with bays and river mouths can make the wave even taller, and on land it can run up much higher than its height at the shore (the ${T('run-up', 'run-up')}).</p>
      ${hint('Set the deep-ocean height to the value in the question, then slide the wave until the depth reads about 10 m.')}
      </div>`;
      const q1 = h('div', 'q');
      q1.innerHTML = `<div class="prompt">A tsunami is 0.5 m tall in 4,000 m of water. Using the panel, about how tall is it when it reaches water 10 m deep?</div>
        <input type="number" step="0.1" value="${S.answers.t2h ?? ''}" aria-label="Wave height in meters"> m <div class="fb"></div>`;
      q1.querySelector('input').addEventListener('input', e => { S.answers.t2h = e.target.value === '' ? null : +e.target.value; save(); });
      const exp = TSU.greens(0.5, 4000, 10);
      q1.check = () => {
        const v = S.answers.t2h, ok = v != null && Math.abs(v - exp) <= 0.3;
        q1.className = 'q ' + (ok ? 'good' : 'bad');
        q1.querySelector('.fb').innerHTML = v == null ? 'Enter a number.' : ok ? `Right, about ${exp.toFixed(1)} m - more than four times taller, and it can run up much higher on land.` : 'Set the deep-ocean height to 0.5 m, then slide the wave toward the coast until the depth reads about 10 m.';
        return ok;
      };
      const q2 = mcq('t2q2', 'Why does the wave get taller as it reaches the coast?', ['The wind pushes it up', 'It slows down in shallow water and its energy is squeezed into less water', 'It picks up water from rivers', 'It gets warmer'], 1,
        'Right. Slower and shorter, with the same energy, means taller.', 'Watch the speed and the wavelength in the readout as you move the wave toward the coast.');
      const q3 = mcq('t2q3', 'Sometimes the sea pulls far back from the beach before a tsunami arrives. What should people on the beach do?', ['Walk out to look at the exposed seafloor', 'Wait to see if a wave comes', 'Go to high ground or inland right away', 'Take photos from the beach'], 2,
        'Right. A sudden drop in the sea is a natural warning that the trough of a tsunami has arrived, and the crest is coming next.', 'The trough of a wave comes before the crest.');
      c.append(q1, q2, q3, checkRow(() => [q1.check(), q2.check(), q3.check()].every(Boolean)));
    }
  });

  // ===== Step 3: Near and far - Cascadia 1700 =====
  def({
    tab: '3. Near and far',
    panel(p) {
      p.append(h('p', 'panel-title', 'The January 26, 1700 Cascadia tsunami - two trips'));
      panel3(p);
    },
    content(c) {
      const hS = TSU.travelHours(TSU.ROUTES.seaside) * 60, hJ = TSU.travelHours(TSU.ROUTES.japan);
      c.innerHTML = `<h2>Near and far - the 1700 Cascadia tsunami</h2>
      <div class="poptext">
      <p>At about 9 p.m. on January 26, 1700, a ${T('megathrust', 'megathrust')} earthquake ruptured the ${T('cascadia', 'Cascadia subduction zone')}. The coast dropped, and a tsunami hit Oregon and Washington. Hours later, villages in Japan recorded a tsunami with no earthquake felt there - an ${T('orphan-tsunami', 'orphan tsunami')}. Those Japanese records are how scientists know the date.</p>
      <p>Move the time slider or press Play and watch the wavefront spread across the Pacific. The same tsunami makes two trips: about ${TSU.ROUTES.seaside.km} km to the Oregon coast, mostly over the shallower continental shelf and slope, and about ${TSU.ROUTES.japan.km.toLocaleString('en-US')} km across the deep North Pacific to Japan.</p>
      <p>The difference matters for warnings. For a distant tsunami, ${T('dart', 'DART buoys')} and ${T('warning-center', 'tsunami warning centers')} have hours to measure the wave and warn the coast. For a Cascadia tsunami, the waves can arrive in 15 to 30 minutes, and Oregon's evacuation planners note that the shaking itself may last 3 to 5 minutes. On the Cascadia coast, the earthquake is the warning.</p>
      ${hint('Slide slowly until the Seaside dot turns red, then read the time on the slider. Do the same for Japan.')}
      </div>`;
      const q1 = h('div', 'q');
      q1.innerHTML = `<div class="prompt">In this model, how many minutes after the earthquake does the tsunami reach Seaside?</div>
        <input type="number" step="1" value="${S.answers.t3s ?? ''}" aria-label="Minutes"> minutes <div class="fb"></div>`;
      q1.querySelector('input').addEventListener('input', e => { S.answers.t3s = e.target.value === '' ? null : +e.target.value; save(); });
      q1.check = () => {
        const v = S.answers.t3s, ok = v != null && Math.abs(v - hS) <= 2;
        q1.className = 'q ' + (ok ? 'good' : 'bad');
        q1.querySelector('.fb').innerHTML = v == null ? 'Enter a number.' : ok ? `Right, about ${Math.round(hS)} minutes.` : 'Move the slider slowly until the Seaside dot first turns red, and read the slider.';
        return ok;
      };
      const q2 = h('div', 'q');
      q2.innerHTML = `<div class="prompt">About how many hours does it take to reach Japan?</div>
        <input type="number" step="0.1" value="${S.answers.t3j ?? ''}" aria-label="Hours"> hours <div class="fb"></div>`;
      q2.querySelector('input').addEventListener('input', e => { S.answers.t3j = e.target.value === '' ? null : +e.target.value; save(); });
      q2.check = () => {
        const v = S.answers.t3j, ok = v != null && Math.abs(v - hJ) <= 0.5;
        q2.className = 'q ' + (ok ? 'good' : 'bad');
        q2.querySelector('.fb').innerHTML = v == null ? 'Enter a number.' : ok ? `Right, about ${hJ.toFixed(0)} hours. An earthquake at 9 p.m. on January 26 in Oregon is the afternoon of January 27 in Japan, and so the wave arrived there around midnight - just when the Japanese records say it did.` : 'Slide until the Japan dot turns red and convert the minutes to hours.';
        return ok;
      };
      const q3 = mcq('t3q3', 'You are on the beach at Seaside and feel strong shaking that lasts a long time. What should you do?', ['Wait for an official tsunami warning on your phone', 'Drive to the beach to look', 'As soon as the shaking stops, walk quickly to high ground or inland', 'Go back to your hotel room on the first floor'], 2,
        'Right. For a local tsunami there may be no time for an official warning, and so long, strong shaking near the coast is the signal to go.', 'For a Cascadia tsunami, how long is there between the shaking and the waves?');
      c.append(q1, q2, q3, checkRow(() => [q1.check(), q2.check(), q3.check()].every(Boolean)));
      c.append(h('p', 'small poptext', 'Sources: Oregon DOGAMI tsunami evacuation reports; Satake and others (1996), Atwater and others (2005), The Orphan Tsunami of 1700; PNSN.'));
    }
  });

  // ===== Step 4: Volcanic tsunamis =====
  def({
    tab: '4. Volcano tsunamis',
    panel(p) {
      p.append(h('p', 'panel-title', 'Hunga Tonga, January 15, 2022 - a race to Japan (model)'));
      panel4(p);
    },
    content(c) {
      const T0 = TSU.TONGA, diff = T0.km / TSU.speedKMH(T0.depth) - T0.km / T0.pressureKMH;
      c.innerHTML = `<h2>Tsunamis from volcanoes</h2>
      <div class="poptext">
      <p>Volcanoes make tsunamis too, when an island collapses into a ${T('caldera', 'caldera')}, when ${T('pyroclastic-flow', 'pyroclastic flows')} pour into the sea, or when an underwater explosion pushes the water. The deadliest was <strong>Krakatau in 1883</strong>: of about 36,000 people who died, more than 34,000 were killed by tsunamis.</p>
      <p>In January 2022, the underwater volcano <strong>Hunga Tonga-Hunga Haʻapai</strong> exploded and surprised scientists. Its blast sent an air pressure wave around the planet, and the wave pushed the ocean along with it - a ${T('meteotsunami', 'meteotsunami')}. The USGS reported that the first waves to reach Japan were not a classic tsunami at all. They had been pushed across the Pacific at about 700 mph by the pressure wave.</p>
      <p>Move the time slider or press Play to race the two across the map. The Japan dot turns light purple when the pressure-driven waves arrive and red when the classic tsunami arrives.</p>
      ${hint('Watch the readout under the map - it shows each arrival time once that wave reaches Japan.')}
      </div>`;
      const q1 = h('div', 'q');
      q1.innerHTML = `<div class="prompt">In this model, how many hours earlier does the pressure-driven wave reach Japan than the classic tsunami?</div>
        <input type="number" step="0.1" value="${S.answers.t4d ?? ''}" aria-label="Hours"> hours <div class="fb"></div>`;
      q1.querySelector('input').addEventListener('input', e => { S.answers.t4d = e.target.value === '' ? null : +e.target.value; save(); });
      q1.check = () => {
        const v = S.answers.t4d, ok = v != null && Math.abs(v - diff) <= 0.4;
        q1.className = 'q ' + (ok ? 'good' : 'bad');
        q1.querySelector('.fb').innerHTML = v == null ? 'Enter a number.' : ok ? `Right, about ${diff.toFixed(1)} hours earlier.` : 'Read both arrival times under the map and subtract.';
        return ok;
      };
      const q2 = mcq('t4q2', 'Why did the Tonga waves surprise tsunami warning centers?', ['They came from an earthquake', 'Warning systems were built mainly for tsunamis from earthquakes, and these first waves were pushed by the air, arriving earlier than a normal tsunami', 'There were no waves at all', 'The waves only reached Tonga'], 1,
        'Right. A pressure wave in the air moves faster than a tsunami in the ocean, and so these waves arrived earlier than the models expected.', 'Compare the two arrival times and think about what warning centers usually watch for.');
      const q3 = mcq('t4q3', 'What killed most of the people in the 1883 Krakatau eruption?', ['Lava flows', 'Ash falling on roofs', 'Tsunamis', 'Earthquakes'], 2,
        'Right, more than 34,000 of about 36,000 deaths.', 'Read the paragraph about Krakatau again.');
      c.append(q1, q2, q3, checkRow(() => [q1.check(), q2.check(), q3.check()].every(Boolean)));
      c.append(h('p', 'small poptext', 'Sources: NOAA NCEI, Krakatau 1883; USGS Pacific Coastal and Marine Science Center, tsunamis caused by the January 2022 eruption in Tonga.'));
    }
  });

  // ===== Step 5: Asteroid impacts =====
  def({
    tab: '5. Asteroid tsunamis',
    panel(p) {
      p.append(h('p', 'panel-title', 'Energy of an asteroid hitting the ocean'));
      panel5(p);
    },
    content(c) {
      c.innerHTML = `<h2>Tsunamis from asteroids</h2>
      <div class="poptext">
      <p>Most of the Earth is ocean, and so most asteroids that reach the surface would hit water. A large impact punches a crater in the ocean and throws out a ring of waves. The energy comes from the asteroid's ${T('kinetic-energy', 'kinetic energy')}: half its mass times its speed squared.</p>
      <p>Move the sliders to change the size and speed of a stony asteroid. The picture shows the asteroid to scale next to things we know, and the view zooms out as it grows. The energy bars use a ${T('logarithmic', 'logarithmic')} scale in ${T('megaton', 'megatons')} of TNT, and the Hiroshima bomb is there for scale. The red bar is an asteroid the size of the one that made the Chicxulub crater in Mexico 66 million years ago. A 2022 study by Range and others modeled its tsunami and found an initial wave more than a mile high, with up to 30,000 times the energy of the 2004 Indian Ocean tsunami.</p>
      <p>Impacts this large are very rare. Earthquakes make far more of the world's tsunamis.</p>
      ${hint('Write down the energy, then move one slider so the diameter (or speed) doubles, and compare the new energy.')}
      </div>`;
      const q1 = mcq('t5q1', 'If an asteroid\'s diameter doubles (same speed), its energy goes up by about...', ['2 times', '4 times', '8 times', '16 times'], 2,
        'Right. Doubling the diameter makes the rock 2 × 2 × 2 = 8 times heavier, and so 8 times the energy.', 'Mass depends on volume, and volume depends on diameter × diameter × diameter.');
      const q2 = mcq('t5q2', 'If its speed doubles (same size), its energy goes up by about...', ['2 times', '4 times', '8 times', '16 times'], 1,
        'Right. Energy depends on speed squared, and 2 × 2 = 4.', 'Energy = ½ × mass × speed × speed.');
      const q3 = mcq('t5q3', 'Which of these makes most of the world\'s tsunamis?', ['Asteroid impacts', 'Earthquakes that move the seafloor', 'Wind storms', 'Volcanic eruptions'], 1,
        'Right. Volcanoes and landslides make some, and huge impacts are very rare, but most tsunamis come from earthquakes.', 'Read the last paragraph of the text.');
      c.append(q1, q2, q3, checkRow(() => [q1.check(), q2.check(), q3.check()].every(Boolean)));
      c.append(h('p', 'small poptext', 'Sources: Range and others, 2022, AGU Advances; University of Michigan news release, October 2022.'));
    }
  });

  // ===== Step 6: Your turn - evacuate =====
  def({
    tab: '6. Your turn',
    panel(p) {
      p.append(h('p', 'panel-title', 'Your evacuation timeline - a Cascadia earthquake near your beach town'));
      panel6(p);
    },
    content(c) {
      const sc = SC;
      c.innerHTML = `<h2>Your turn - can you get out?</h2>
      <div class="poptext">
      <p>Here's your own scenario: a Cascadia earthquake has just started while you're in a low-lying beach town. The numbers in the panel are yours alone. Oregon's evacuation planners assume about 10 minutes pass before people start moving - several minutes of shaking, then shock, finding family and getting out the door.</p>
      <p>Your town has two choices: walk to natural high ground, or climb a ${T('vertical-evacuation', 'vertical evacuation structure')} - a tower or building strong and tall enough to stand above the tsunami. Switch between the two routes in the panel, then press Play to watch your walk and the tsunami on the town map.</p>
      ${hint('Walking time in minutes = distance (m) ÷ speed (m/s) ÷ 60.', 'Hint: walking time')}
      ${hint('You need to arrive before the tsunami. Add the 10 minutes before you can leave to your walking time, and compare it with the arrival time.', 'Hint: will you make it?')}
      </div>`;
      const q1 = h('div', 'q');
      q1.innerHTML = `<div class="prompt">At your walking speed, how many minutes does it take to walk to high ground?</div>
        <input type="number" step="0.1" value="${S.answers.t6w ?? ''}" aria-label="Minutes"> minutes <div class="fb"></div>`;
      q1.querySelector('input').addEventListener('input', e => { S.answers.t6w = e.target.value === '' ? null : +e.target.value; save(); });
      q1.check = () => {
        const v = S.answers.t6w, ok = v != null && Math.abs(v - sc.walkHigh) <= 0.5;
        q1.className = 'q ' + (ok ? 'good' : 'bad');
        q1.querySelector('.fb').innerHTML = v == null ? 'Enter a number.' : ok ? `Right, about ${sc.walkHigh.toFixed(1)} minutes.` : 'Open the walking time hint, or switch the panel to the high ground route and read the walking bar.';
        return ok;
      };
      const q2 = mcq('t6q2', 'Including the 10 minutes before you can leave, do you reach high ground before the tsunami arrives?', ['Yes', 'No'], sc.delay + sc.walkHigh <= sc.arrival ? 0 : 1,
        'Right.', 'Add 10 minutes to your walking time and compare it with the arrival time. The high ground route in the panel shows it too.');
      const q3 = mcq('t6q3', 'What is your safest choice?', ['Walk to high ground', 'Climb the vertical evacuation tower'], sc.best === 'high' ? 0 : 1,
        sc.best === 'high' ? 'Right. You can reach high ground with a few minutes to spare, and natural high ground can hold everyone and stays safe for the hours that tsunami waves keep coming.' : 'Right. High ground is too far to reach in time, and so the closer tower is the way to survive. That is exactly why towns like Ocosta, Washington built one.',
        'Look at both routes in the panel. Which one gets you to safety before the tsunami, with some time to spare?');
      const q4 = mcq('t6q4', 'Why do Oregon and Washington tell people to evacuate on foot, not by car, after a local earthquake?', ['Cars are not allowed on the coast', 'Shaking can damage roads and bridges, and traffic jams can trap drivers in the inundation zone', 'Walking is faster than driving on an open road', 'Gasoline stations close'], 1,
        'Right. In a local tsunami there is no time to be stuck in traffic or at a broken bridge.', 'Think about what the earthquake does to roads and how many people try to leave at once.');
      c.append(q1, q2, q3, q4, checkRow(() => [q1.check(), q2.check(), q3.check(), q4.check()].every(Boolean), 'Get my certificate →'));
      c.append(h('p', 'small poptext', 'Sources: Oregon DOGAMI Open-File Report O-24-12; Washington Emergency Management Division, Tsunami Vertical Evacuation Options (2021); USGS, Preparing for tsunami hazards on Washington’s Pacific coast.'));
    }
  });

  // ===== Certificate =====
  def({
    tab: 'Certificate',
    panel(p) { p.append(h('p', 'panel-title', '')); },
    content(c) {
      if (!S.completedAt) { S.completedAt = new Date().toISOString(); save(); }
      const when = new Date(S.completedAt);
      const code = TSU.verifyCode(S.name, S.seed);
      const sc = SC;
      c.innerHTML = `<div class="cert-layout">
      <div class="cert-side no-print">
        <h2>Your certificate</h2>
        <div class="warn-box"><strong>You are not done until the certificate is in Canvas.</strong>
        <ol style="margin:4px 0 0 18px;padding:0">
          <li>Check that your name is spelled right. <button type="button" class="linkbtn" id="fixName">Fix my name</button></li>
          <li>Click <em>Print or save as PDF</em> and save the PDF, or take a screenshot that shows the whole certificate, including the verification code at the bottom.</li>
          <li>Upload it to the Canvas assignment, and check that the upload went through.</li>
        </ol></div>
        <p><button type="button" class="btn" id="printBtn">Print or save as PDF</button></p>
      </div>
      <div class="cert">
        <h3>Certified Tsunami Scientist</h3>
        <p class="sub">Race the Wave - Tsunamis from Earthquakes, Volcanoes and Asteroids</p>
        <p class="who">${escapeHtml(S.name)}</p>
        <p class="sub">completed all six steps on ${when.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
        <div class="cert-grid">
        <table class="data">
          <tr><th>Speed at 4,000 m</th><td>${fmt(S.answers.t1v, 0)} km/h</td></tr>
          <tr><th>Height at 10 m depth</th><td>${fmt(S.answers.t2h)} m</td></tr>
          <tr><th>1700 tsunami to Seaside</th><td>${fmt(S.answers.t3s, 0)} min</td></tr>
          <tr><th>1700 tsunami to Japan</th><td>${fmt(S.answers.t3j)} h</td></tr>
          <tr><th>Tonga pressure wave lead</th><td>${fmt(S.answers.t4d)} h</td></tr>
        </table>
        <table class="data">
          <tr><th>Evacuation</th><td>${sc.person.who}</td></tr>
          <tr><th>Tsunami arrival</th><td>${sc.arrival} min</td></tr>
          <tr><th>Walk to high ground</th><td>${fmt(S.answers.t6w)} min</td></tr>
          <tr><th>Safest choice</th><td>${sc.best === 'high' ? 'high ground' : 'evacuation tower'}</td></tr>
        </table></div>
        <p class="code"><span class="small">Scenario</span> ${S.seed} &nbsp; <span class="small">Verification code</span> ${code}</p>
      </div></div>`;
      c.querySelector('#printBtn').onclick = () => window.print();
      const fx = c.querySelector('#fixName');
      if (fx) fx.onclick = () => {
        const nm = (prompt('Type your first and last name the way it appears in Canvas:', S.name) || '').trim().replace(/\s+/g, ' ');
        if (nm.length >= 3 && /\s/.test(nm)) { S.name = nm; save(); go(S.step); }
      };
    }
  });

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  // ---------- navigation ----------
  const lastIdx = STEPS.length - 1;
  function unlocked(i) {
    if (i === 0) return true;
    if (S.seed == null) return false;
    if (i === lastIdx) { for (let k = 1; k < lastIdx; k++) if (!S.done[k]) return false; return true; }
    return !!S.done[i - 1];
  }
  function firstOpen() { for (let i = 1; i <= lastIdx; i++) if (!S.done[i] && unlocked(i)) return i; return lastIdx; }
  function renderTabs() {
    tabsEl.innerHTML = '';
    STEPS.forEach((st, i) => {
      const b = h('button', '', st.tab); b.type = 'button';
      if (i === S.step) b.classList.add('active');
      if (S.done[i] && i > 0 && i < lastIdx) b.classList.add('done');
      b.disabled = !unlocked(i);
      b.onclick = () => go(i);
      tabsEl.append(b);
    });
  }
  function renderPanel() {
    stopAnim();
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    STEPS[S.step].panel(panel);
  }
  function go(i) {
    if (!unlocked(i)) i = 0;
    S.step = i; save();
    document.querySelector('main').classList.toggle('certmode', i === lastIdx);
    renderTabs(); renderPanel();
    stepEl.innerHTML = '';
    STEPS[i].content(stepEl);
    if (i > 0 && i < lastIdx && S.seed != null) {
      const bar = h('div', 'scen-bar', `${escapeHtml(S.name)} - scenario number <strong>${S.seed}</strong> (write it down). ${saveFailed ? 'This browser is not saving your work.' : 'Your work saves automatically in this browser.'}`);
      stepEl.insertBefore(bar, stepEl.firstChild);
    }
    if (saveFailed) showStorageWarning();
    broadcast();
    const col = document.getElementById('stepCol'); if (col) col.scrollTop = 0;
    if (i > 0 && window.innerWidth < 1000) { const top = tabsEl.getBoundingClientRect().top; if (top < 0) tabsEl.scrollIntoView({ behavior: 'smooth' }); }
  }

  // ---------- pop-outs ----------
  let bc = null; try { bc = new BroadcastChannel('tsulab'); } catch (e) { /* not supported */ }
  function broadcast() {
    if (!bc) return;
    const parts = [...stepEl.querySelectorAll('h2, .poptext')].map(n => n.outerHTML).join('');
    bc.postMessage({ type: 'text', html: parts.replace(/<details class="hint poptext">/g, '<details class="hint poptext" open>'), title: STEPS[S.step].tab });
  }
  if (bc) bc.onmessage = e => { if (e.data && e.data.type === 'hello') broadcast(); };
  document.getElementById('btnPopText').onclick = () => {
    const w = window.open('instructions.html', 'tsulabText', 'width=560,height=760');
    if (!w) alert('Your browser blocked the pop-out window. Please allow pop-ups for this page.');
    else setTimeout(broadcast, 600);
  };
  let panelWin = null;
  function panelBack() {
    if (!panelWin) return;
    panelWrap.insertBefore(document.adoptNode(panel), placeholder);
    placeholder.hidden = true; panelWin = null;
  }
  document.getElementById('btnPopPanel').onclick = () => {
    if (panelWin && !panelWin.closed) { panelWin.focus(); return; }
    const w = window.open('', 'tsulabPanel', 'width=1000,height=760');
    if (!w) { alert('Your browser blocked the pop-out window. Please allow pop-ups for this page.'); return; }
    const css = new URL('css/style.css?v=v2', location.href).href;
    w.document.open();
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Panel - Race the Wave</title><link rel="stylesheet" href="${css}"></head><body class="popwin"><div id="host"></div><div id="glossaryPop" class="gloss-pop" hidden></div></body></html>`);
    w.document.close();
    w.document.getElementById('host').appendChild(w.document.adoptNode(panel));
    Glossary.attach(w.document);
    placeholder.hidden = false; panelWin = w;
    w.addEventListener('pagehide', panelBack);
    w.addEventListener('beforeunload', panelBack);
  };
  document.getElementById('btnPanelBack').onclick = () => { const w = panelWin; panelBack(); if (w) w.close(); };
  window.addEventListener('beforeunload', () => { if (panelWin) panelWin.close(); });
  document.getElementById('btnGlossary').onclick = () => {
    const w = window.open('', 'tsulabGloss', 'width=520,height=760');
    if (!w) return;
    w.document.open();
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Glossary - Race the Wave</title><link rel="stylesheet" href="${new URL('css/style.css', location.href).href}"></head><body class="popwin"><h2 style="color:#841617">Glossary</h2>${Glossary.listHTML()}</body></html>`);
    w.document.close();
  };

  Glossary.attach(document);
  go(S.seed == null ? 0 : S.step);
})();
