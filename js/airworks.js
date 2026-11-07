// Cinder Collective · Airworks 5. Route metered air from the main to the customers' huts.
// Tap a pipe to rotate it. When the main pressurizes, air flows down whatever you've built;
// an open end vents air into the void (a leak, billed to you). Every hut reached is a metered
// customer. Tees split the flow, so you can feed more than one. "Breathe responsibly. Air is metered."
import { T13 } from './economy.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, COLS = 10, ROWS = 6, CELL = 50, GX = 34, GY = 56;
const N = 1, E = 2, S = 4, Wd = 8;
const DIRS = [[N, 0, -1, S], [E, 1, 0, Wd], [S, 0, 1, N], [Wd, -1, 0, E]];
const rot = (m) => ((m << 1) | (m >> 3)) & 15;
export const METER_GRADES = [
  ['Meter Maid', 0], ['Valve Tender', 100], ['Line Reader', 250], ['Pipe Fitter', 450], ['Pressure Clerk', 700],
  ['Senior Plumber of Air', 1000], ['Ductmaster', 1400], ['Flow Auditor', 1900], ['Regulator', 2500], ['Chief of Breath', 3200],
  ['Air Baron', 4000], ['Keeper of the Last Breath', 5000], ['Oxygen Laureate', 6500],
];
const HUTS = ['Row B, Lower Upper Squalor', 'the Halfway Halt', 'Barrel 9', 'Row F (the nice end)', 'Upper Lower Squalor, Hut 13', 'the Dentist (unlicensed)', 'Mrs. Okafor', 'Queue Sitters’ Union Hall', 'Pigeon Lofts'];

export function createAirworks({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const ST = econ.state;
  ST.airworks ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const A = ST.airworks;
  const blocks = world.spine.blocks || [];
  const b5 = blocks[4] || { x0: -8050, x1: -5190 };
  const SITE = { x: (b5.x0 + b5.x1) / 2 - 300, y: 1550 };
  const PAD = { x: SITE.x, y: SITE.y - 160 };
  const gradeOf = (xp = A.xp) => { let i = 0; METER_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (A.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 110;
    c.fillStyle = '#0f1a1b'; c.fillRect(x0, y0, 480, 240);
    c.strokeStyle = '#4fc3c8'; c.globalAlpha = 0.6; c.lineWidth = 4; c.strokeRect(x0, y0, 480, 240); c.globalAlpha = 1;
    c.strokeStyle = '#5f7a7b'; c.lineWidth = 12; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0 + 20, y0 + 120); c.lineTo(x0 + 140, y0 + 120); c.lineTo(x0 + 140, y0 + 60); c.lineTo(x0 + 300, y0 + 60); c.lineTo(x0 + 300, y0 + 180); c.lineTo(x0 + 460, y0 + 180); c.stroke();
    c.lineCap = 'butt';
    for (let k = 0; k < 6; k++) { const ph = (time / 900 + k / 6) % 1; c.fillStyle = 'rgba(79,195,200,0.8)'; c.beginPath(); c.arc(x0 + 20 + ph * 440, y0 + 120 + Math.sin(ph * 9) * 50, 4, 0, 7); c.fill(); }
    c.fillStyle = '#4fc3c8'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#0b0c0e'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('CINDER COLLECTIVE · AIRWORKS 5', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.7)';
    c.fillText('Breathe responsibly. Air is metered.', SITE.x, y0 + 256);
    c.strokeStyle = near ? '#e8c547' : 'rgba(79,195,200,0.7)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#4fc3c8'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'VALVE', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#4fc3c8'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'airworks', type: 'magnet', title: 'Airworks 5 · route the air', sub: `${METER_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Cinder Airworks 5' } }];

  function open() {
    const g = gradeOf(), nx = METER_GRADES[g + 1];
    openModal(
      `<h2>AIRWORKS 5</h2>
       <div class="sub">Cinder Collective · “Breathe responsibly. Air is metered.”</div>
       <div class="explain"><b>${esc(METER_GRADES[g][0])}</b> · ${A.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${A.best || 0} · shifts ${A.shifts || 0}</div>
       <div class="explain"><b>Tap a pipe to rotate it.</b> Build a line from the <b>MAIN</b> (left) to the customers' huts (right edge). When the main pressurizes, air flows through whatever you've built, a pipe at a time.
         An open end <b>vents into the void</b>: a leak, −10, and that line is dead. Every hut reached is a <b>metered customer</b> (+30). <b>Tees split</b> the flow, so one line can feed two huts. Pipes with air in them can't be turned.
         Hit <b>OPEN THE VALVE</b> early for a bonus. The shift ends when the air stops.</div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Clock in (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="air" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Walk off (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#air');
        const dpr = Math.min(3, Math.max(1, (cv.getBoundingClientRect().width / W) * (window.devicePixelRatio || 1)));
        cv.width = W * dpr; cv.height = H * dpr;
        const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const game = shift(c, cv, gradeOf(), (res) => finish(res, paid));
        el.querySelector('#quit').addEventListener('click', () => { game.stop(); open(); });
      }
    );
  }

  function finish(res, paid) {
    const before = gradeOf();
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 2.4)))).amount : 0;
    if (paid) { A.last = Date.now(); A.xp += Math.max(0, res.score); A.shifts = (A.shifts || 0) + 1; }
    A.best = Math.max(A.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Airworks 5: ${res.customers} hut${res.customers === 1 ? '' : 's'} on the meter, ${res.leaks} leak${res.leaks === 1 ? '' : 's'}, ${res.score} points. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(METER_GRADES[after][0])}</b>, Cinder Collective. Please continue to breathe responsibly.`, 'money');
    emit('airworks', { score: res.score, customers: res.customers, leaks: res.leaks, pipes: res.pipes, paid, grade: after, all: res.customers >= res.outlets });
    openModal(
      `<h2>${res.customers >= res.outlets ? 'EVERY HUT METERED' : 'PRESSURE DOWN'}</h2>
       <div class="sub">Airworks 5 · ${esc(METER_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         <tr><td>Pipe filled (${res.pipes} sections)</td><td style="text-align:right;color:#d6f08a">+${res.pipes * 2}</td></tr>
         ${res.billed.map((h) => `<tr><td>Customer metered: ${esc(h)}</td><td style="text-align:right;color:#d6f08a">+30</td></tr>`).join('')}
         ${res.early ? `<tr><td>Opened the valve early</td><td style="text-align:right;color:#d6f08a">+${res.early}</td></tr>` : ''}
         ${res.leaks ? `<tr><td>Leaks into the void (${res.leaks})</td><td style="text-align:right;color:#ff7a5c">−${res.leaks * 10}</td></tr>` : ''}
         <tr><td><b>Total</b></td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${res.leaks ? '<br/><span class="sub">The vented air has been billed to your account. Cinder thanks you for breathing responsibly.</span>' : ''}
       ${board ? `<br/>${board.line('airworks')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Airworks office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('airworks'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => METER_GRADES[gradeOf()][0] };
}

// ---------- the board ----------
function shift(c, cv, grade, done) {
  const BUILD_S = Math.max(14, 22 - grade * 0.6); // time before the main pressurizes
  let flowEvery = Math.max(0.42, 0.85 - grade * 0.02);
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  const piece = () => { const r = Math.random(); return r < 0.34 ? (E | Wd) : r < 0.74 ? (N | E) : r < 0.86 ? (N | E | S) : r < 0.93 ? 15 : 0; };
  for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) { let m = piece(); for (let k = Math.floor(Math.random() * 4); k > 0; k--) m = rot(m); grid[r][q] = { m, fill: 0, from: 0, rock: m === 0, cross: m === 15 }; }
  const srcRow = 1 + Math.floor(Math.random() * (ROWS - 2));
  const nOut = 2 + (grade >= 6 ? 1 : 0);
  const outRows = [];
  while (outRows.length < nOut) { const r = Math.floor(Math.random() * ROWS); if (!outRows.includes(r)) outRows.push(r); }
  const outlets = outRows.map((r, i) => ({ r, name: HUTS[Math.floor(Math.random() * HUTS.length)], fed: false, i }));
  // carve one guaranteed path to the first outlet (random walk, mostly eastward), then scramble its rotations
  {
    let r = srcRow, q = 0, from = Wd;
    var carved = [];
    const target = outlets[0].r;
    const seen = new Set();
    while (q < COLS) {
      seen.add(`${q},${r}`);
      let to;
      if (q === COLS - 1 && r === target) to = E;
      else if (q === COLS - 1) to = r < target ? S : N;
      else {
        const opts = [E, E, E];
        if (r > 0 && !seen.has(`${q},${r - 1}`) && from !== N) opts.push(N);
        if (r < ROWS - 1 && !seen.has(`${q},${r + 1}`) && from !== S) opts.push(S);
        to = opts[Math.floor(Math.random() * opts.length)];
        if ((to === N || to === S) && q === COLS - 1) to = E;
      }
      let m = from | to;
      carved.push({ q, r, need: m });
      const straight = m === (E | Wd) || m === (N | S);
      m = straight ? (E | Wd) : (N | E);
      for (let k = Math.floor(Math.random() * 4); k > 0; k--) m = rot(m);
      grid[r][q] = { m, fill: 0, from: 0, rock: false, cross: false };
      const d = DIRS.find(([b]) => b === to);
      q += d[1]; r += d[2]; from = d[3];
      if (q >= COLS) break;
      if (r < 0 || r >= ROWS) break;
    }
  }
  const res = { score: 0, pipes: 0, customers: 0, outlets: nOut, leaks: 0, billed: [], early: 0 };
  let t = 0, stopped = false, flowing = false, flowT = 0, fronts = [], ended = false, endT = 0;
  const puffs = [], pops = [];
  let flowAt = BUILD_S;

  function startFlow() {
    if (flowing) return;
    flowing = true;
    res.early = Math.max(0, Math.round(flowAt - t));
    fronts = [{ q: 0, r: srcRow, from: Wd }];
    flowT = 0;
  }
  const cellXY = (q, r) => [GX + q * CELL + CELL / 2, GY + r * CELL + CELL / 2];
  function leak(x, y, why) { res.leaks++; for (let k = 0; k < 24; k++) puffs.push({ x, y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, t: 1 }); pops.push({ x, y: y - 10, s: `LEAK −10${why ? ` · ${why}` : ''}`, c: '#ff7a5c', t: 1.4 }); }
  function step() {
    const next = [];
    for (const f of fronts) {
      const tile = grid[f.r][f.q];
      if (!(tile.m & f.from)) { const [x, y] = cellXY(f.q, f.r); leak(x - (f.from === Wd ? CELL / 2 : 0), y, 'vented'); continue; }
      if (tile.fill) continue; // merged into air that's already here
      tile.fill = 0.01; tile.from = f.from; res.pipes++;
      let exits = tile.m & ~f.from;
      if (tile.cross) { const opp = DIRS.find(([b]) => b === f.from)[3]; exits = opp; }
      for (const [b, dq, dr, back] of DIRS) {
        if (!(exits & b)) continue;
        const q = f.q + dq, r = f.r + dr;
        if (q >= COLS && b === E) {
          const o = outlets.find((o) => o.r === r);
          const [x, y] = cellXY(f.q, f.r);
          if (o && !o.fed) { o.fed = true; res.customers++; res.billed.push(o.name); pops.push({ x: x + 20, y: y - 12, s: `+30 · ${o.name} is breathing`, c: '#d6f08a', t: 1.8 }); }
          else if (!o) leak(x + CELL / 2, y, 'into the void');
          continue;
        }
        if (q < 0 || r < 0 || r >= ROWS || q >= COLS) { const [x, y] = cellXY(f.q, f.r); leak(x + dq * CELL / 2, y + dr * CELL / 2, 'into the void'); continue; }
        const n = grid[r][q];
        if (n.fill) { if (!(n.m & back)) { const [x, y] = cellXY(f.q, f.r); leak(x + dq * CELL / 2, y + dr * CELL / 2); } continue; }
        next.push({ q, r, from: back });
      }
    }
    fronts = next;
    if (!fronts.length) { ended = true; endT = 1.4; }
  }

  // input
  const pos = (e) => { const rc = cv.getBoundingClientRect(); return { x: ((e.clientX - rc.left) / rc.width) * W, y: ((e.clientY - rc.top) / rc.height) * H }; };
  const VALVE = { x: 556, y: 300, w: 76, h: 56 };
  const pd = (e) => {
    e.preventDefault();
    const p = pos(e);
    if (p.x >= VALVE.x && p.x <= VALVE.x + VALVE.w && p.y >= VALVE.y && p.y <= VALVE.y + VALVE.h) return startFlow();
    const q = Math.floor((p.x - GX) / CELL), r = Math.floor((p.y - GY) / CELL);
    if (q < 0 || r < 0 || q >= COLS || r >= ROWS) return;
    const tile = grid[r][q];
    if (tile.fill || tile.rock || tile.cross) return;
    tile.m = rot(tile.m); tile.spin = 0.12;
  };
  const kd = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); startFlow(); } };
  cv.style.touchAction = 'none';
  cv.__debug = { grid, carved, srcRow, outlets }; // for tests
  cv.addEventListener('pointerdown', pd); window.addEventListener('keydown', kd);
  const stop = () => { stopped = true; window.removeEventListener('keydown', kd); };
  function end() {
    if (stopped) return;
    stop();
    if (!res.customers) res.early = 0; // the early bonus only counts if somebody got air
    res.score = res.pipes * 2 + res.customers * 30 + res.early - res.leaks * 10;
    done(res);
  }

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (!flowing && t >= flowAt) startFlow();
    if (flowing && !ended) {
      flowT += dt;
      while (flowT >= flowEvery && !ended) { flowT -= flowEvery; step(); flowEvery = Math.max(0.3, flowEvery * 0.985); }
    }
    for (const row of grid) for (const tl of row) { if (tl.fill && tl.fill < 1) tl.fill = Math.min(1, tl.fill + dt / flowEvery); if (tl.spin) tl.spin = Math.max(0, tl.spin - dt); }
    for (const p of puffs) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
    for (const p of pops) p.t -= dt;
    if (ended) { endT -= dt; if (endT <= 0) return end(); }
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function pipeShape(cx, cy, m, col, w) {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'butt';
    for (const [b, dq, dr] of DIRS) if (m & b) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + dq * CELL / 2, cy + dr * CELL / 2); c.stroke(); }
    if (m) { c.fillStyle = col; c.beginPath(); c.arc(cx, cy, w / 2, 0, 7); c.fill(); }
  }
  function txt(s, x, y, size = 11, col = '#efe6cf', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }

  function draw() {
    c.fillStyle = '#0b1213'; c.fillRect(0, 0, W, H);
    txt('AIRWORKS 5 · DISTRIBUTION GRID', GX, 22, 12, '#4fc3c8', 'left', true);
    txt(flowing ? (ended ? 'PRESSURE DOWN' : `AIR FLOWING · ${res.pipes} sections · ${res.customers}/${nOut} huts`) : `MAIN PRESSURIZES IN ${Math.max(0, Math.ceil(flowAt - t))}s · tap pipes to turn them`, GX, 40, 11, flowing ? '#d6f08a' : '#ffd166');
    // grid
    for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) {
      const x = GX + q * CELL, y = GY + r * CELL, tl = grid[r][q];
      c.fillStyle = (q + r) % 2 ? '#12191a' : '#141d1e'; c.fillRect(x, y, CELL, CELL);
      c.strokeStyle = 'rgba(79,195,200,0.08)'; c.strokeRect(x, y, CELL, CELL);
      const [cx, cy] = cellXY(q, r);
      if (tl.rock) { c.fillStyle = '#3a3533'; c.beginPath(); c.arc(cx, cy, 16, 0, 7); c.fill(); c.fillStyle = '#4a4441'; c.beginPath(); c.arc(cx - 5, cy - 4, 7, 0, 7); c.fill(); continue; }
      const s = 1 - (tl.spin || 0) * 1.2;
      c.save(); c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy);
      pipeShape(cx, cy, tl.m, '#5f7a7b', 14);
      pipeShape(cx, cy, tl.m, '#2a3536', 8);
      if (tl.fill) { c.globalAlpha = Math.min(1, tl.fill); pipeShape(cx, cy, tl.m, '#4fc3c8', 8); c.globalAlpha = 1; }
      if (tl.cross) { c.strokeStyle = '#8aa'; c.lineWidth = 2; c.strokeRect(cx - 9, cy - 9, 18, 18); }
      c.restore();
    }
    // main (source)
    const [sx, sy] = cellXY(0, srcRow);
    c.fillStyle = flowing ? '#4fc3c8' : '#2f6f72'; c.fillRect(4, sy - 14, GX - 4, 28);
    txt('MAIN', 4, sy - 18, 9, '#4fc3c8', 'left', true);
    // outlets (huts)
    for (const o of outlets) {
      const [, oy] = cellXY(COLS - 1, o.r);
      const x = GX + COLS * CELL;
      c.fillStyle = o.fed ? '#d6f08a' : '#6b5a3a'; c.fillRect(x + 2, oy - 12, 16, 24);
      c.fillStyle = o.fed ? '#2a3a1a' : '#3a2f1e'; c.beginPath(); c.moveTo(x + 2, oy - 12); c.lineTo(x + 10, oy - 20); c.lineTo(x + 18, oy - 12); c.fill();
      if (o.fed) txt('✓', x + 10, oy + 5, 11, '#111', 'center', true);
    }
    // side panel
    txt('HUTS', 558, 64, 10, '#4fc3c8', 'left', true);
    outlets.forEach((o, i) => { txt(`${o.fed ? '✓' : '·'} ${o.name}`, 558, 82 + i * 30, 9, o.fed ? '#d6f08a' : 'rgba(230,220,196,0.7)', 'left', false, 76); txt(`row ${o.r + 1}`, 558, 94 + i * 30, 8, 'rgba(230,220,196,0.4)'); });
    txt(`leaks ${res.leaks}`, 558, 200, 11, res.leaks ? '#ff7a5c' : 'rgba(230,220,196,0.6)', 'left', true);
    txt(`score ${res.pipes * 2 + res.customers * 30 - res.leaks * 10}`, 558, 218, 11, '#e8c547', 'left', true);
    c.fillStyle = flowing ? 'rgba(255,255,255,0.05)' : 'rgba(79,195,200,0.25)'; c.fillRect(VALVE.x, VALVE.y, VALVE.w, VALVE.h);
    c.strokeStyle = flowing ? '#444' : '#4fc3c8'; c.strokeRect(VALVE.x, VALVE.y, VALVE.w, VALVE.h);
    txt(flowing ? 'OPEN' : 'OPEN THE', VALVE.x + VALVE.w / 2, VALVE.y + 22, 11, flowing ? '#666' : '#efe6cf', 'center', true);
    txt(flowing ? '' : `VALVE (+${Math.max(0, Math.round(flowAt - t))})`, VALVE.x + VALVE.w / 2, VALVE.y + 38, 10, '#d6f08a', 'center', true);
    // puffs + pops
    for (const p of puffs) if (p.t > 0) { c.globalAlpha = p.t * 0.6; c.fillStyle = '#cfe'; c.beginPath(); c.arc(p.x, p.y, 3 + (1 - p.t) * 5, 0, 7); c.fill(); }
    c.globalAlpha = 1;
    for (const p of pops) if (p.t > 0) { c.globalAlpha = Math.min(1, p.t * 2); txt(p.s, Math.min(Math.max(p.x, 90), 470), p.y - (1.8 - p.t) * 16, 11, p.c, 'center', true); }
    c.globalAlpha = 1;
  }

  return { stop };
}
