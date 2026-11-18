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
      const ctr = h('div', 'controls'); p.append(ctr);
      const W = 760, H = 250, L = 60, R = 20, Tp = 14, B = 44, DMAX = 6000, VMAX = 900;
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
      const X = d => L + d / DMAX * (W - L - R), Y = v => H - B - v / VMAX * (H - B - Tp);
      for (let d = 0; d <= DMAX; d += 1000) { svg('line', { x1: X(d), x2: X(d), y1: Y(0), y2: Y(VMAX), stroke: '#e3e5e8' }, s); txt(s, X(d), H - B + 16, d.toLocaleString('en-US'), { 'font-size': 11, 'text-anchor': 'middle', fill: SLATE }); }
      for (let v = 0; v <= VMAX; v += 150) { svg('line', { x1: X(0), x2: X(DMAX), y1: Y(v), y2: Y(v), stroke: '#e3e5e8' }, s); txt(s, L - 6, Y(v) + 4, v, { 'font-size': 11, 'text-anchor': 'end', fill: SLATE }); }
      txt(s, X(DMAX / 2), H - 6, 'Water depth (m)', { 'font-size': 12, 'text-anchor': 'middle', fill: SLATE });
      const yl = txt(s, 14, Y(VMAX / 2), 'Speed (km/h)', { 'font-size': 12, 'text-anchor': 'middle', fill: SLATE }); yl.setAttribute('transform', `rotate(-90 14 ${Y(VMAX / 2)})`);
      let d0 = ''; for (let d = 0; d <= DMAX; d += 50) d0 += (d ? 'L' : 'M') + X(d).toFixed(1) + ' ' + Y(TSU.speedKMH(d)).toFixed(1);
      svg('path', { d: d0, fill: 'none', stroke: CP, 'stroke-width': 3 }, s);
      const ov = svg('g', {}, s);
      const W2 = 760, H2 = 150, L2 = 200;
      const s2 = svg('svg', { viewBox: `0 0 ${W2} ${H2}`, class: 'fig' }, p);
      const X2 = v => L2 + v / 1000 * (W2 - L2 - 30);
      for (let v = 0; v <= 1000; v += 200) { svg('line', { x1: X2(v), x2: X2(v), y1: 6, y2: H2 - 24, stroke: '#e3e5e8' }, s2); txt(s2, X2(v), H2 - 8, v + ' km/h', { 'font-size': 10.5, 'text-anchor': 'middle', fill: SLATE }); }
      const bars = svg('g', {}, s2);
      const ro = h('div', 'readout');
      const draw = d => {
        while (ov.firstChild) ov.removeChild(ov.firstChild);
        const v = TSU.speedKMH(d);
        svg('line', { x1: X(d), x2: X(d), y1: Y(0), y2: Y(v), stroke: '#333', 'stroke-dasharray': '4 3' }, ov);
        svg('line', { x1: X(0), x2: X(d), y1: Y(v), y2: Y(v), stroke: '#333', 'stroke-dasharray': '4 3' }, ov);
        svg('circle', { cx: X(d), cy: Y(v), r: 6, fill: RED }, ov);
        while (bars.firstChild) bars.removeChild(bars.firstChild);
        [['Tsunami at this depth', v, CP], ['Passenger jet (cruising)', 900, SLATE], ['Car on a highway', 110, '#0f8b8d'], ['Person sprinting', 25, '#c48a00']].forEach(([n, sp, col], k) => {
          const y = 8 + k * 28;
          txt(bars, L2 - 8, y + 15, n, { 'font-size': 12, 'text-anchor': 'end', fill: col, 'font-weight': 700 });
          svg('rect', { x: X2(0), y, width: Math.max(1, X2(sp) - X2(0)), height: 20, fill: col, rx: 3, opacity: 0.85 }, bars);
        });
        ro.innerHTML = `At <strong>${Math.round(d).toLocaleString('en-US')} m</strong> deep, a tsunami travels <strong>${Math.round(v).toLocaleString('en-US')} km/h</strong> (${TSU.speedMS(d).toFixed(0)} m/s).`;
      };
      const sl = slider('Water depth:', 10, 6000, 10, S.answers.t1d ?? 4000, 'm', v => { S.answers.t1d = v; save(); draw(v); });
      sl.input.style.width = '320px';
      ctr.append(sl.wrap, ro); draw(S.answers.t1d ?? 4000);
    },
    content(c) {
      c.innerHTML = `<h2>How fast is a tsunami?</h2>
      <div class="poptext">
      <p>A ${T('tsunami', 'tsunami')} is not a wind wave. When an earthquake lifts the seafloor, the whole column of water above it is lifted too, from the bottom of the ocean to the top, and so the wave carries a huge amount of water. Its ${T('wavelength', 'wavelength')} can be 100 km or more, much longer than the ocean is deep.</p>
      <p>For a wave like that - a ${T('shallow-water-wave', 'shallow-water wave')} - the speed depends only on the water depth: speed = √(g × depth), where g is gravity, 9.81 m/s². Move the depth slider and watch the speed change, and compare it with things we know.</p>
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
      const ctr = h('div', 'controls'); p.append(ctr);
      const W = 760, H = 330, L = 50, R = 20, SEA = 120, ZMAX = 4200;
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
      const X = x => L + x / 300 * (W - L - R), Z = d => SEA + d / ZMAX * (H - SEA - 20);
      // water and seafloor
      let floor = `M${X(0)},${Z(4000)}`; for (let x = 0; x <= 300; x += 2) floor += ` L${X(x).toFixed(1)},${Z(depthAt(x)).toFixed(1)}`;
      svg('rect', { x: X(0), y: SEA, width: X(300) - X(0), height: H - SEA, fill: '#cfe6f5' }, s);
      svg('path', { d: floor + ` L${X(300)},${H} L${X(0)},${H} Z`, fill: '#a8916b' }, s);
      svg('rect', { x: X(300) - 2, y: SEA - 40, width: R + 4, height: H, fill: '#a8916b' }, s);
      txt(s, X(60), Z(4000) - 10, 'deep ocean, 4,000 m', { 'font-size': 12, fill: '#2c5d85' });
      txt(s, X(272), SEA + 40, 'shelf', { 'font-size': 12, fill: '#2c5d85', 'text-anchor': 'middle' });
      txt(s, W - 6, 34, 'coast', { 'font-size': 12, 'text-anchor': 'end', 'font-weight': 700 });
      for (let x = 0; x <= 300; x += 50) txt(s, X(x), H - 4, x + ' km', { 'font-size': 10.5, 'text-anchor': 'middle', fill: '#fff' });
      txt(s, L - 6, Z(0) + 4, '0 m', { 'font-size': 10.5, 'text-anchor': 'end', fill: SLATE }); txt(s, L - 6, Z(4000) + 4, '4,000', { 'font-size': 10.5, 'text-anchor': 'end', fill: SLATE });
      const g = svg('g', {}, s);
      const ro = h('div', 'readout');
      let pos = S.answers.t2x ?? 20, a0 = S.answers.t2a ?? 0.5;
      const draw = () => {
        while (g.firstChild) g.removeChild(g.firstChild);
        const d = depthAt(pos), a = TSU.greens(a0, 4000, d), v = TSU.speedKMH(d);
        const halfLen = Math.max(4, v / 3.6 * 900 / 1000 / 2);   // half a wavelength for a 15-minute wave, km
        const amp = Math.min(SEA - 10, a * 14);                  // drawn height: 14 px per meter (exaggerated)
        let path = `M${X(Math.max(0, pos - halfLen))},${SEA}`;
        for (let k = 0; k <= 40; k++) { const xx = pos - halfLen + 2 * halfLen * k / 40; if (xx < 0 || xx > 300) continue; path += ` L${X(xx).toFixed(1)},${(SEA - amp * Math.sin(Math.PI * k / 40)).toFixed(1)}`; }
        svg('path', { d: path, fill: 'none', stroke: CP, 'stroke-width': 3 }, g);
        svg('line', { x1: X(pos), x2: X(pos), y1: SEA - amp - 6, y2: Z(d), stroke: '#333', 'stroke-dasharray': '3 3' }, g);
        const lb = txt(g, X(pos) + (pos > 220 ? -8 : 8), SEA - amp - 10, `${a.toFixed(1)} m tall`, { 'font-size': 13, 'font-weight': 700, fill: CP, 'text-anchor': pos > 220 ? 'end' : 'start' });
        lb.setAttribute('paint-order', 'stroke'); lb.setAttribute('stroke', '#fff'); lb.setAttribute('stroke-width', 3);
        ro.innerHTML = `Depth <strong>${Math.round(d).toLocaleString('en-US')} m</strong> - speed <strong>${Math.round(v)} km/h</strong> - wave height <strong>${a.toFixed(1)} m</strong> - wavelength about <strong>${Math.round(halfLen * 2)} km</strong>`;
      };
      const s1 = slider('Wave position:', 0, 298, 1, pos, 'km', v => { pos = v; S.answers.t2x = v; save(); draw(); });
      const s2 = slider('Height in the deep ocean:', 0.2, 2, 0.1, a0, 'm', v => { a0 = v; S.answers.t2a = v; save(); draw(); });
      s1.input.style.width = '260px';
      ctr.append(s1.wrap, s2.wrap); p.append(ro); draw();
      txt(s, X(0) + 4, 14, 'Wave height is drawn about 15 times taller than true scale.', { 'font-size': 10.5, fill: SLATE });
    },
    content(c) {
      c.innerHTML = `<h2>The wave grows near shore</h2>
      <div class="poptext">
      <p>Out in the deep ocean a tsunami is fast, long and low. As it reaches the continental shelf, the front of the wave slows down while the back is still moving fast, and so the wave bunches up. The same energy gets squeezed into less water, and the wave grows taller. This is called ${T('shoaling', 'shoaling')}.</p>
      <p>Move the wave from the deep ocean toward the coast and watch the speed, the wavelength and the height. The heights follow a simple rule called ${T('greens-law', 'Green\'s law')}. Real coastlines with bays and river mouths can make the wave even taller, and on land it can run up much higher than its height at the shore (the ${T('run-up', 'run-up')}).</p>
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
      const ctr = h('div', 'controls'); p.append(ctr);
      const W = 760, H = 270, L = 190, R = 30;
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
      const g = svg('g', {}, s);
      const ro = h('div', 'readout');
      const rS = TSU.ROUTES.seaside, rJ = TSU.ROUTES.japan;
      const hS = TSU.travelHours(rS), hJ = TSU.travelHours(rJ);
      const draw = tMin => {
        while (g.firstChild) g.removeChild(g.firstChild);
        [[`To Seaside, Oregon`, rS, hS, 30, '0 km', `${rS.km} km`], [`To northeast Japan`, rJ, hJ, 150, '0 km', `${rJ.km.toLocaleString('en-US')} km`]].forEach(([n, r, hrs, y, a, b]) => {
          txt(g, L - 10, y + 22, n, { 'font-size': 13, 'font-weight': 700, 'text-anchor': 'end' });
          txt(g, L - 10, y + 40, `avg. depth ${r.depth.toLocaleString('en-US')} m`, { 'font-size': 11, 'text-anchor': 'end', fill: SLATE });
          svg('rect', { x: L, y: y + 10, width: W - L - R, height: 26, fill: '#cfe6f5', rx: 4 }, g);
          const frac = Math.min(1, tMin / 60 / hrs);
          svg('rect', { x: L, y: y + 10, width: (W - L - R) * frac, height: 26, fill: CP, rx: 4 }, g);
          txt(g, L, y + 52, a, { 'font-size': 10.5, fill: SLATE }); txt(g, W - R, y + 52, b, { 'font-size': 10.5, fill: SLATE, 'text-anchor': 'end' });
          txt(g, W - R, y + 6, frac >= 1 ? 'arrived' : `${Math.round(frac * 100)}% of the way`, { 'font-size': 11.5, 'font-weight': 700, 'text-anchor': 'end', fill: frac >= 1 ? RED : SLATE });
        });
        const hh = Math.floor(tMin / 60), mm = Math.round(tMin % 60);
        ro.innerHTML = `Time since the earthquake: <strong>${hh} h ${mm} min</strong>`;
      };
      const sl = slider('Time after the earthquake:', 0, 720, 1, S.answers.t3t ?? 0, 'min', v => { S.answers.t3t = v; save(); draw(v); });
      sl.input.style.width = '360px';
      ctr.append(sl.wrap); p.append(ro); draw(S.answers.t3t ?? 0);
      txt(s, 10, H - 8, 'Simple model: each trip uses one average depth. Real waves speed up and slow down over the changing seafloor.', { 'font-size': 10.5, fill: SLATE });
    },
    content(c) {
      const hS = TSU.travelHours(TSU.ROUTES.seaside) * 60, hJ = TSU.travelHours(TSU.ROUTES.japan);
      c.innerHTML = `<h2>Near and far - the 1700 Cascadia tsunami</h2>
      <div class="poptext">
      <p>At about 9 p.m. on January 26, 1700, a ${T('megathrust', 'megathrust')} earthquake ruptured the ${T('cascadia', 'Cascadia subduction zone')}. The coast dropped, and a tsunami hit Oregon and Washington. Hours later, villages in Japan recorded a tsunami with no earthquake felt there - an ${T('orphan-tsunami', 'orphan tsunami')}. Those Japanese records are how scientists know the date.</p>
      <p>Move the time slider and watch the same tsunami make two trips: about ${TSU.ROUTES.seaside.km} km to the Oregon coast, mostly over the shallower continental shelf and slope, and about ${TSU.ROUTES.japan.km.toLocaleString('en-US')} km across the deep North Pacific to Japan.</p>
      <p>The difference matters for warnings. For a distant tsunami, ${T('dart', 'DART buoys')} and ${T('warning-center', 'tsunami warning centers')} have hours to measure the wave and warn the coast. For a Cascadia tsunami, the waves can arrive in 15 to 30 minutes, and Oregon's evacuation planners note that the shaking itself may last 3 to 5 minutes. On the Cascadia coast, the earthquake is the warning.</p>
      ${hint('Slide until the Seaside bar says "arrived", then read the time. Do the same for Japan.')}
      </div>`;
      const q1 = h('div', 'q');
      q1.innerHTML = `<div class="prompt">In this model, how many minutes after the earthquake does the tsunami reach Seaside?</div>
        <input type="number" step="1" value="${S.answers.t3s ?? ''}" aria-label="Minutes"> minutes <div class="fb"></div>`;
      q1.querySelector('input').addEventListener('input', e => { S.answers.t3s = e.target.value === '' ? null : +e.target.value; save(); });
      q1.check = () => {
        const v = S.answers.t3s, ok = v != null && Math.abs(v - hS) <= 2;
        q1.className = 'q ' + (ok ? 'good' : 'bad');
        q1.querySelector('.fb').innerHTML = v == null ? 'Enter a number.' : ok ? `Right, about ${Math.round(hS)} minutes.` : 'Move the slider slowly until the Seaside bar first says "arrived".';
        return ok;
      };
      const q2 = h('div', 'q');
      q2.innerHTML = `<div class="prompt">About how many hours does it take to reach Japan?</div>
        <input type="number" step="0.1" value="${S.answers.t3j ?? ''}" aria-label="Hours"> hours <div class="fb"></div>`;
      q2.querySelector('input').addEventListener('input', e => { S.answers.t3j = e.target.value === '' ? null : +e.target.value; save(); });
      q2.check = () => {
        const v = S.answers.t3j, ok = v != null && Math.abs(v - hJ) <= 0.5;
        q2.className = 'q ' + (ok ? 'good' : 'bad');
        q2.querySelector('.fb').innerHTML = v == null ? 'Enter a number.' : ok ? `Right, about ${hJ.toFixed(0)} hours. An earthquake at 9 p.m. on January 26 in Oregon is the afternoon of January 27 in Japan, and so the wave arrived there around midnight - just when the Japanese records say it did.` : 'Slide until the Japan bar says "arrived" and convert the time to hours.';
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
      const ctr = h('div', 'controls'); p.append(ctr);
      const W = 760, H = 230, L = 210, R = 30;
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
      const g = svg('g', {}, s);
      const T0 = TSU.TONGA, hP = T0.km / T0.pressureKMH, hT = T0.km / TSU.speedKMH(T0.depth);
      const ro = h('div', 'readout');
      const draw = tMin => {
        while (g.firstChild) g.removeChild(g.firstChild);
        [['Air pressure wave', 'pushes a meteotsunami', hP, '#7b3fbf', 30], ['Classic tsunami', 'water pushed by the eruption', hT, CP, 110]].forEach(([n, sub, hrs, col, y]) => {
          txt(g, L - 10, y + 22, n, { 'font-size': 13, 'font-weight': 700, 'text-anchor': 'end', fill: col });
          txt(g, L - 10, y + 38, sub, { 'font-size': 11, 'text-anchor': 'end', fill: SLATE });
          svg('rect', { x: L, y: y + 10, width: W - L - R, height: 26, fill: '#eee', rx: 4 }, g);
          const frac = Math.min(1, tMin / 60 / hrs);
          svg('rect', { x: L, y: y + 10, width: (W - L - R) * frac, height: 26, fill: col, rx: 4 }, g);
          txt(g, W - R, y + 6, frac >= 1 ? `arrived after ${hrs.toFixed(1)} h` : `${Math.round(frac * 100)}%`, { 'font-size': 11.5, 'font-weight': 700, 'text-anchor': 'end', fill: frac >= 1 ? RED : SLATE });
        });
        txt(g, L, 190, 'Tonga', { 'font-size': 11, fill: SLATE }); txt(g, W - R, 190, `Japan, about ${T0.km.toLocaleString('en-US')} km`, { 'font-size': 11, fill: SLATE, 'text-anchor': 'end' });
        ro.innerHTML = `Time since the eruption: <strong>${Math.floor(tMin / 60)} h ${Math.round(tMin % 60)} min</strong>`;
      };
      const sl = slider('Time after the eruption:', 0, 720, 1, S.answers.t4t ?? 0, 'min', v => { S.answers.t4t = v; save(); draw(v); });
      sl.input.style.width = '360px';
      ctr.append(sl.wrap); p.append(ro); draw(S.answers.t4t ?? 0);
      txt(s, 10, H - 8, `Model: pressure wave at about 700 mph (1,130 km/h); tsunami over an average depth of ${T0.depth.toLocaleString('en-US')} m.`, { 'font-size': 10.5, fill: SLATE });
    },
    content(c) {
      const T0 = TSU.TONGA, diff = T0.km / TSU.speedKMH(T0.depth) - T0.km / T0.pressureKMH;
      c.innerHTML = `<h2>Tsunamis from volcanoes</h2>
      <div class="poptext">
      <p>Volcanoes make tsunamis too, when an island collapses into a ${T('caldera', 'caldera')}, when ${T('pyroclastic-flow', 'pyroclastic flows')} pour into the sea, or when an underwater explosion pushes the water. The deadliest was <strong>Krakatau in 1883</strong>: of about 36,000 people who died, more than 34,000 were killed by tsunamis.</p>
      <p>In January 2022, the underwater volcano <strong>Hunga Tonga-Hunga Haʻapai</strong> exploded and surprised scientists. Its blast sent an air pressure wave around the planet, and the wave pushed the ocean along with it - a ${T('meteotsunami', 'meteotsunami')}. The USGS reported that the first waves to reach Japan were not a classic tsunami at all. They had been pushed across the Pacific at about 700 mph by the pressure wave.</p>
      <p>Move the time slider to race the two.</p>
      ${hint('Slide until each bar says "arrived" and read off both times.')}
      </div>`;
      const q1 = h('div', 'q');
      q1.innerHTML = `<div class="prompt">In this model, how many hours earlier does the pressure-driven wave reach Japan than the classic tsunami?</div>
        <input type="number" step="0.1" value="${S.answers.t4d ?? ''}" aria-label="Hours"> hours <div class="fb"></div>`;
      q1.querySelector('input').addEventListener('input', e => { S.answers.t4d = e.target.value === '' ? null : +e.target.value; save(); });
      q1.check = () => {
        const v = S.answers.t4d, ok = v != null && Math.abs(v - diff) <= 0.4;
        q1.className = 'q ' + (ok ? 'good' : 'bad');
        q1.querySelector('.fb').innerHTML = v == null ? 'Enter a number.' : ok ? `Right, about ${diff.toFixed(1)} hours earlier.` : 'Read the arrival time of each bar and subtract.';
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
      const ctr = h('div', 'controls'); p.append(ctr);
      const W = 760, H = 250, L = 230, R = 30, EMIN = -3, EMAX = 9;
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
      const X = e => L + (e - EMIN) / (EMAX - EMIN) * (W - L - R);
      const TICK = { '-2': '0.01', '0': '1', '2': '100', '4': '10,000', '6': '1 million', '8': '100 million' };
      for (let e = EMIN; e <= EMAX; e++) { svg('line', { x1: X(e), x2: X(e), y1: 10, y2: H - 40, stroke: '#e3e5e8' }, s); if (TICK[e]) txt(s, X(e), H - 24, TICK[e], { 'font-size': 10.5, 'text-anchor': 'middle', fill: SLATE }); }
      txt(s, (X(EMIN) + X(EMAX)) / 2, H - 6, 'Energy (megatons of TNT, each grid line is 10 times more)', { 'font-size': 12, 'text-anchor': 'middle', fill: SLATE });
      const g = svg('g', {}, s);
      const ro = h('div', 'readout');
      let dKm = S.answers.t5d ?? 0.1, v = S.answers.t5v ?? 20;
      const chic = TSU.impactMt(14, 12);
      const draw = () => {
        while (g.firstChild) g.removeChild(g.firstChild);
        const E = TSU.impactMt(dKm, v);
        [['Hiroshima bomb (1945)', 0.015, '#9e9e9e'], ['Your asteroid', E, CP], ['Chicxulub-size asteroid (66 million years ago)', chic, RED]].forEach(([n, en, col], k) => {
          const y = 20 + k * 60;
          txt(g, L - 10, y + 20, n.split(' (')[0], { 'font-size': 12.5, 'text-anchor': 'end', fill: col, 'font-weight': 700 });
          if (n.includes('(')) txt(g, L - 10, y + 36, '(' + n.split(' (')[1], { 'font-size': 11, 'text-anchor': 'end', fill: SLATE });
          const x1 = X(Math.max(EMIN, Math.min(EMAX, Math.log10(en))));
          svg('rect', { x: X(EMIN), y: y + 4, width: Math.max(2, x1 - X(EMIN)), height: 28, fill: col, rx: 4 }, g);
        });
        const fm = x => x >= 1 ? Math.round(x).toLocaleString('en-US') : x.toPrecision(2);
        ro.innerHTML = `A <strong>${dKm >= 1 ? dKm.toFixed(1) + ' km' : Math.round(dKm * 1000) + ' m'}</strong> stony asteroid at <strong>${v} km/s</strong> carries about <strong>${fm(E)} megatons</strong> - about ${fm(E / 0.015)} Hiroshima bombs.`;
      };
      const logD = Math.log10(dKm);
      const s1 = slider('Diameter:', -2, 1.3, 0.01, logD, '', x => { dKm = Math.pow(10, x); S.answers.t5d = dKm; save(); draw(); });
      s1.out.hidden = true;
      const s2 = slider('Speed:', 11, 30, 1, v, 'km/s', x => { v = x; S.answers.t5v = x; save(); draw(); });
      ctr.append(s1.wrap, s2.wrap); p.append(ro); draw();
    },
    content(c) {
      c.innerHTML = `<h2>Tsunamis from asteroids</h2>
      <div class="poptext">
      <p>Most of the Earth is ocean, and so most asteroids that reach the surface would hit water. A large impact punches a crater in the ocean and throws out a ring of waves. The energy comes from the asteroid's ${T('kinetic-energy', 'kinetic energy')}: half its mass times its speed squared.</p>
      <p>Move the sliders to change the size and speed of a stony asteroid. The bars use a ${T('logarithmic', 'logarithmic')} scale in ${T('megaton', 'megatons')} of TNT, and the Hiroshima bomb is there for scale. The red bar is an asteroid the size of the one that made the Chicxulub crater in Mexico 66 million years ago. A 2022 study by Range and others modeled its tsunami and found an initial wave more than a mile high, with up to 30,000 times the energy of the 2004 Indian Ocean tsunami.</p>
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
  let route6 = 'high';
  def({
    tab: '6. Your turn',
    panel(p) {
      const sc = SC;
      p.append(h('p', 'panel-title', 'Your evacuation timeline - a Cascadia earthquake near your beach town'));
      const ctr = h('div', 'controls'); const seg = h('div', 'seg');
      [['high', `High ground (${sc.high.toLocaleString('en-US')} m away)`], ['tower', `Vertical evacuation tower (${sc.tower} m away)`]].forEach(([k, l]) => {
        const b = h('button', route6 === k ? 'on' : '', l); b.type = 'button'; b.onclick = () => { route6 = k; renderPanel(); }; seg.append(b);
      });
      ctr.append(h('span', '', 'Route:'), seg); p.append(ctr);
      const W = 760, H = 190, L = 30, R = 30, TMAX = 45;
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fig' }, p);
      const X = t => L + t / TMAX * (W - L - R);
      for (let t = 0; t <= TMAX; t += 5) { svg('line', { x1: X(t), x2: X(t), y1: 30, y2: H - 40, stroke: '#e3e5e8' }, s); txt(s, X(t), H - 24, t, { 'font-size': 11, 'text-anchor': 'middle', fill: SLATE }); }
      txt(s, (X(0) + X(TMAX)) / 2, H - 6, 'Minutes after the shaking starts', { 'font-size': 12, 'text-anchor': 'middle', fill: SLATE });
      const walk = route6 === 'high' ? sc.walkHigh : sc.walkTower;
      svg('rect', { x: X(0), y: 60, width: X(4) - X(0), height: 34, fill: '#8e44ad', rx: 3 }, s);
      txt(s, X(0), 54, 'shaking', { 'font-size': 11, fill: '#8e44ad', 'font-weight': 700 });
      svg('rect', { x: X(4), y: 60, width: X(sc.delay) - X(4), height: 34, fill: '#c48a00', rx: 3 }, s);
      txt(s, X(4) + 4, 54, 'shock, grab family, go', { 'font-size': 11, fill: '#c48a00', 'font-weight': 700 });
      const end = sc.delay + walk;
      svg('rect', { x: X(sc.delay), y: 60, width: Math.max(2, X(Math.min(TMAX, end)) - X(sc.delay)), height: 34, fill: '#0f8b8d', rx: 3 }, s);
      txt(s, (X(sc.delay) + X(Math.min(TMAX, end))) / 2, 112, `walking ${walk.toFixed(1)} min`, { 'font-size': 12, 'text-anchor': 'middle', fill: '#0f8b8d', 'font-weight': 700 });
      svg('line', { x1: X(sc.arrival), x2: X(sc.arrival), y1: 24, y2: H - 40, stroke: CP, 'stroke-width': 3 }, s);
      txt(s, X(sc.arrival) + 4, 22, `tsunami arrives (${sc.arrival} min)`, { 'font-size': 12, fill: CP, 'font-weight': 700 });
      const ok = end <= sc.arrival;
      txt(s, X(Math.min(TMAX, end)) + 6, 82, ok ? 'safe' : 'too late', { 'font-size': 13, 'font-weight': 700, fill: ok ? '#1d7a46' : RED });
      const info = h('div', 'mcard');
      info.innerHTML = `<div class="mcard-head">Your situation</div>
        <table class="data" style="width:100%"><tr><th>You are</th><td style="text-align:left">${sc.person.who}, at about ${sc.person.speed} m/s</td></tr>
        <tr><th>Tsunami arrives</th><td style="text-align:left">${sc.arrival} minutes after the shaking starts</td></tr>
        <tr><th>Before you can leave</th><td style="text-align:left">${sc.delay} minutes (shaking, shock, gathering family)</td></tr>
        <tr><th>High ground</th><td style="text-align:left">${sc.high.toLocaleString('en-US')} m walk</td></tr>
        <tr><th>Evacuation tower</th><td style="text-align:left">${sc.tower} m walk</td></tr></table>`;
      p.append(info);
    },
    content(c) {
      const sc = SC;
      c.innerHTML = `<h2>Your turn - can you get out?</h2>
      <div class="poptext">
      <p>Here's your own scenario: a Cascadia earthquake has just started while you're in a low-lying beach town. The numbers in the panel are yours alone. Oregon's evacuation planners assume about 10 minutes pass before people start moving - several minutes of shaking, then shock, finding family and getting out the door.</p>
      <p>Your town has two choices: walk to natural high ground, or climb a ${T('vertical-evacuation', 'vertical evacuation structure')} - a tower or building strong and tall enough to stand above the tsunami. Switch between the two routes in the panel to see your timeline.</p>
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
    const css = new URL('css/style.css?v=v1', location.href).href;
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
