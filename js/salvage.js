// Kessler Mining Co. · Salvage Yard 9. Cut a derelict hull apart along its seams.
// Drag the torch along a seam to cut it. A panel comes free when every seam around it is open
// (edges on the outside of the hull, or next to a panel already gone, count as open), then drifts
// into the net. Don't cut the fuel lines. Don't overheat the torch. Somebody may still be home.
// "Everything is ore eventually."
import { T13 } from './economy.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 75;
const GC = 6, GR = 4, CELL = 72, OX = 40, OY = 52;
export const CUTTER_GRADES = [
  ['Debris Intern', 0], ['Scrap Cutter', 100], ['Seam Splitter', 250], ['Torch Hand', 450], ['Hull Butcher', 700],
  ['Salvage Foreman', 1000], ['Deep-Shaft Cutter', 1400], ['Wreck Whisperer', 1900], ['Ore Prophet', 2500],
  ['Cascade Engineer', 3200], ['Orbital Undertaker', 4000], ['Debris Baron', 5000], ['Everything Is Ore', 6500],
];
const TYPES = {
  plating: { ore: 5, c: '#6f7378', label: '' },
  wiring: { ore: 10, c: '#7a5a32', label: 'Cu' },
  alloy: { ore: 25, c: '#5f7f8f', label: 'Ir' },
  occupied: { ore: 8, c: '#4f5a4a', label: '' },
};

export function createSalvage({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const S = econ.state;
  S.salvage ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const V = S.salvage;
  const SITE = { x: -1250, y: 1950 };
  const PAD = { x: SITE.x, y: SITE.y - 160 };
  const gradeOf = (xp = V.xp) => { let i = 0; CUTTER_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (V.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    // a gutted freighter in a cradle
    c.save(); c.translate(SITE.x, SITE.y + 10); c.rotate(-0.08);
    c.fillStyle = '#3a3d42'; c.fillRect(-230, -70, 460, 140);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) if ((i * 7 + j * 3) % 5) { c.fillStyle = (i + j) % 3 ? '#55595f' : '#5f7f8f'; c.fillRect(-220 + i * 74, -60 + j * 64, 68, 56); }
    c.fillStyle = 'rgba(255,140,40,0.85)'; c.beginPath(); c.arc(-60 + Math.sin(time / 300) * 30, -4, 4 + Math.random() * 3, 0, 7); c.fill(); // somebody's cutting
    c.restore();
    c.strokeStyle = '#c9a227'; c.globalAlpha = 0.5; c.lineWidth = 3; c.strokeRect(SITE.x - 260, SITE.y - 100, 520, 230); c.globalAlpha = 1;
    c.fillStyle = '#e8c547'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('KESSLER MINING CO. · SALVAGE YARD 9', SITE.x, SITE.y - 112);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.7)';
    c.fillText('Everything is ore eventually.', SITE.x, SITE.y + 150);
    c.strokeStyle = near ? '#e8c547' : 'rgba(201,162,39,0.7)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#e8c547'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'CUT', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#c9a227'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'salvage', type: 'drop', title: 'Salvage Yard 9 · cut a derelict apart', sub: `${CUTTER_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Kessler Salvage Yard 9' } }];

  function open() {
    const g = gradeOf(), nx = CUTTER_GRADES[g + 1];
    openModal(
      `<h2>SALVAGE YARD 9</h2>
       <div class="sub">Kessler Mining Co. · “Everything is ore eventually.”</div>
       <div class="explain"><b>${esc(CUTTER_GRADES[g][0])}</b> · ${V.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${V.best || 0} ore · shifts ${V.shifts || 0}</div>
       <div class="explain"><b>Drag the torch along a seam</b> to cut it. A panel floats free into the net once every seam around it is open: start from the outside and work in.
         <b>Cu</b> wiring and <b>Ir</b> alloy pay more than plating. <b style="color:#ff5a3a">Red dashed seams are fuel lines</b>: cut one and the panels either side go up with it.
         The torch <b>overheats</b> if you never let go. Portholes with a face mean <b>somebody's home</b>; Kessler classifies them as ore, the Assessor classifies them as liability. ${SHIFT_S} seconds.</div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Light the torch (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="salv" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Abandon the wreck (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#salv');
        const dpr = Math.min(3, Math.max(1, (cv.getBoundingClientRect().width / W) * (window.devicePixelRatio || 1))); // crisp at any size
        cv.width = W * dpr; cv.height = H * dpr;
        const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const game = shift(c, cv, gradeOf(), (res) => finish(res, paid));
        el.querySelector('#quit').addEventListener('click', () => { game.stop(); open(); });
      }
    );
  }

  function finish(res, paid) {
    const before = gradeOf();
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 2.6)))).amount : 0;
    if (paid) { V.last = Date.now(); V.xp += Math.max(0, res.score); V.shifts = (V.shifts || 0) + 1; }
    V.best = Math.max(V.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Salvage Yard 9: ${res.freed} panels freed, ${res.score} ore. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(CUTTER_GRADES[after][0])}</b>, Kessler Mining Co. Everything is ore eventually, including your career.`, 'money');
    emit('salvage', { score: res.score, freed: res.freed, total: res.total, cleared: res.cleared, booms: res.booms, occupants: res.occupants, paid, grade: after });
    openModal(
      `<h2>${res.cleared ? 'WRECK STRIPPED' : 'SHIFT OVER'}</h2>
       <div class="sub">Salvage Yard 9 · ${esc(CUTTER_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         <tr><td>Panels freed</td><td style="text-align:right">${res.freed}/${res.total}</td></tr>
         <tr><td>Ore in the net</td><td style="text-align:right;color:#d6f08a">+${res.ore}</td></tr>
         ${res.cleared ? `<tr><td>Wreck stripped bonus (time left)</td><td style="text-align:right;color:#d6f08a">+${res.timeBonus}</td></tr>` : ''}
         ${res.booms ? `<tr><td>Fuel lines cut (${res.booms})</td><td style="text-align:right;color:#ff7a5c">−${res.booms * 10}</td></tr>` : ''}
         ${res.occupants ? `<tr><td>Occupied compartments salvaged (${res.occupants})</td><td style="text-align:right;color:#ff7a5c">−${res.occupants * 15}</td></tr>` : ''}
         <tr><td><b>Total</b></td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${res.occupants ? '<br/><span class="sub">The occupants have been reclassified as ore. Kessler thanks them for their contribution.</span>' : ''}
       ${board ? `<br/>${board.line('salvage')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Yard office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('salvage'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => CUTTER_GRADES[gradeOf()][0] };
}

// ---------- the wreck ----------
function shift(c, cv, grade, done) {
  // jittered lattice → panels
  const V = [];
  for (let j = 0; j <= GR; j++) for (let i = 0; i <= GC; i++) {
    const edge = i === 0 || j === 0 || i === GC || j === GR;
    V.push({ x: OX + i * CELL + (edge ? 0 : (Math.random() - 0.5) * 22), y: OY + j * CELL + (edge ? 0 : (Math.random() - 0.5) * 22) });
  }
  const vid = (i, j) => j * (GC + 1) + i;
  const edges = new Map();
  const ekey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const getEdge = (a, b) => { const k = ekey(a, b); if (!edges.has(k)) edges.set(k, { a, b, panels: [], cut: 0, done: false, fuel: false }); return edges.get(k); };
  const panels = [];
  for (let j = 0; j < GR; j++) for (let i = 0; i < GC; i++) {
    const r = Math.random();
    const type = r < 0.1 + grade * 0.004 ? 'alloy' : r < 0.36 ? 'wiring' : r < 0.36 + Math.min(0.12, 0.06 + grade * 0.004) ? 'occupied' : 'plating';
    const vs = [vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)];
    const p = { i, j, vs, type, state: 'on', es: [], fx: 0, fy: 0, vx: 0, vy: 0, rot: 0, vr: 0, t: 0 };
    for (let k = 0; k < 4; k++) { const e = getEdge(vs[k], vs[(k + 1) % 4]); e.panels.push(p); p.es.push(e); }
    panels.push(p);
  }
  const inner = [...edges.values()].filter((e) => e.panels.length === 2);
  const nFuel = Math.min(9, 4 + Math.floor(grade / 3));
  for (let k = 0; k < nFuel; k++) inner[Math.floor(Math.random() * inner.length)].fuel = true;
  const len = (e) => Math.hypot(V[e.b].x - V[e.a].x, V[e.b].y - V[e.a].y);
  const isOpen = (e, p) => e.done || e.panels.length === 1 || e.panels.some((q) => q !== p && q.state !== 'on');

  const res = { ore: 0, freed: 0, total: panels.length, booms: 0, occupants: 0, cleared: false, timeBonus: 0, score: 0 };
  let t = 0, stopped = false, heat = 0, locked = 0, down = false, lastP = null, cutting = false, shake = 0;
  const sparks = [], pops = [];
  const NET = { x: 520, y: 300, w: 104, h: 80 };

  function freeCheck() {
    for (const p of panels) {
      if (p.state !== 'on') continue;
      if (p.es.every((e) => isOpen(e, p))) {
        p.state = 'free'; res.freed++;
        const cx = p.vs.reduce((s, v) => s + V[v].x, 0) / 4, cy = p.vs.reduce((s, v) => s + V[v].y, 0) / 4;
        p.fx = cx; p.fy = cy; p.vx = (NET.x + NET.w / 2 - cx) * 0.9; p.vy = (NET.y + NET.h / 2 - cy) * 0.9; p.vr = (Math.random() - 0.5) * 3;
        const ore = TYPES[p.type].ore; res.ore += ore;
        if (p.type === 'occupied') res.occupants++;
        pops.push({ x: cx, y: cy, s: p.type === 'occupied' ? `+${ore} ore · somebody was home` : `+${ore}`, c: p.type === 'occupied' ? '#ff7a5c' : '#d6f08a', t: 1.2 });
      }
    }
  }
  function boom(e) {
    res.booms++; shake = 0.5;
    const mx = (V[e.a].x + V[e.b].x) / 2, my = (V[e.a].y + V[e.b].y) / 2;
    for (let k = 0; k < 40; k++) sparks.push({ x: mx, y: my, vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.5) * 420, t: 0.8, c: Math.random() < 0.5 ? '#ff5a1f' : '#ffd166' });
    for (const p of e.panels) if (p.state === 'on') { p.state = 'burnt'; p.t = 0; }
    pops.push({ x: mx, y: my, s: 'FUEL LINE −10', c: '#ff3b1f', t: 1.3 });
    freeCheck();
  }

  // cutting: pointer movement near and along a seam advances it
  function cutAlong(p0, p1) {
    const mx = p1.x - p0.x, my = p1.y - p0.y, ml = Math.hypot(mx, my);
    if (ml < 0.5) return false;
    let any = false;
    for (const e of edges.values()) {
      if (e.done || e.panels.length === 1 || e.panels.every((q) => q.state !== 'on')) continue;
      const ax = V[e.a].x, ay = V[e.a].y, bx = V[e.b].x, by = V[e.b].y, L = len(e);
      const ux = (bx - ax) / L, uy = (by - ay) / L;
      const d = (q) => { const t2 = Math.max(0, Math.min(L, (q.x - ax) * ux + (q.y - ay) * uy)); return Math.hypot(ax + ux * t2 - q.x, ay + uy * t2 - q.y); };
      if (d(p0) > 13 || d(p1) > 13) continue;
      const along = Math.abs(mx * ux + my * uy);
      if (along / ml < 0.55) continue; // you have to follow the seam
      e.cut += along; any = true;
      if (e.cut >= L * 0.85) { e.done = true; if (e.fuel) boom(e); else freeCheck(); }
    }
    return any;
  }

  const pos = (ev) => { const r = cv.getBoundingClientRect(); return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H }; };
  const pd = (ev) => { ev.preventDefault(); cv.setPointerCapture?.(ev.pointerId); down = true; lastP = pos(ev); };
  const pm = (ev) => {
    const p = pos(ev);
    if (down && lastP && locked <= 0) {
      cutting = cutAlong(lastP, p);
      if (cutting) {
        heat += Math.hypot(p.x - lastP.x, p.y - lastP.y) * 0.0021;
        for (let k = 0; k < 2; k++) sparks.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, t: 0.4, c: '#ffb347' });
        if (heat >= 1) { heat = 1; locked = 1.6; pops.push({ x: p.x, y: p.y - 14, s: 'TORCH OVERHEATED', c: '#ff7a5c', t: 1.2 }); }
      }
    }
    lastP = p;
  };
  const pu = () => { down = false; cutting = false; };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
  const stop = () => { stopped = true; window.removeEventListener('pointerup', pu); };
  function end() {
    if (stopped) return;
    stop();
    res.cleared = panels.every((p) => p.state !== 'on');
    if (res.cleared) res.timeBonus = Math.round(Math.max(0, SHIFT_S - t));
    res.score = res.ore + res.timeBonus - res.booms * 10 - res.occupants * 15;
    done(res);
  }

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (locked > 0) { locked -= dt; heat = Math.max(0, heat - dt * 0.6); }
    else if (!cutting) heat = Math.max(0, heat - dt * 0.45);
    shake = Math.max(0, shake - dt);
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt; s.t -= dt; }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t <= 0) sparks.splice(i, 1);
    for (const p of pops) p.t -= dt;
    for (const p of panels) {
      if (p.state === 'free') { p.t += dt; p.fx += p.vx * dt * 0.9; p.fy += p.vy * dt * 0.9; p.vx *= Math.pow(0.4, dt); p.vy *= Math.pow(0.4, dt); p.rot += p.vr * dt; if (p.t > 1.6) p.state = 'netted'; }
      if (p.state === 'burnt') p.t += dt;
    }
    if (t >= SHIFT_S || (panels.every((p) => p.state !== 'on') && panels.every((p) => p.state !== 'free'))) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function poly(p, ox = 0, oy = 0, rot = 0, cx = 0, cy = 0) {
    c.beginPath();
    p.vs.forEach((v, k) => {
      let x = V[v].x - cx, y = V[v].y - cy;
      if (rot) { const cs = Math.cos(rot), sn = Math.sin(rot); [x, y] = [x * cs - y * sn, x * sn + y * cs]; }
      x += cx + ox; y += cy + oy;
      k ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.closePath();
  }
  function panelArt(p, x, y) {
    const T = TYPES[p.type];
    c.fillStyle = T.c; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (const [dx, dy] of [[-24, -24], [24, -24], [-24, 24], [24, 24]]) { c.beginPath(); c.arc(x + dx, y + dy, 2, 0, 7); c.fill(); } // rivets
    if (p.type === 'wiring') { c.strokeStyle = '#c87533'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 20, y - 6); c.bezierCurveTo(x - 5, y - 20, x + 5, y + 20, x + 20, y + 4); c.stroke(); }
    if (p.type === 'alloy') { c.fillStyle = `rgba(160,220,255,${0.25 + 0.15 * Math.sin(t * 4 + p.i)})`; c.fillRect(x - 14, y - 14, 28, 28); }
    if (p.type === 'occupied') { c.fillStyle = '#1d2a2e'; c.beginPath(); c.arc(x, y, 15, 0, 7); c.fill(); c.strokeStyle = '#9aa'; c.lineWidth = 3; c.stroke(); c.fillStyle = '#d9b99b'; c.beginPath(); c.arc(x, y + 2, 7, 0, 7); c.fill(); c.fillStyle = '#111'; c.fillRect(x - 4, y, 2, 2); c.fillRect(x + 2, y, 2, 2); }
    if (T.label) { c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.fillText(T.label, x, y + 26); }
  }

  function draw() {
    const sx = shake ? (Math.random() - 0.5) * 10 * shake : 0, sy = shake ? (Math.random() - 0.5) * 10 * shake : 0;
    c.save(); c.translate(sx, sy);
    c.fillStyle = '#07080a'; c.fillRect(-10, -10, W + 20, H + 20);
    for (let k = 0; k < 40; k++) { c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect((k * 97) % W, (k * 53) % H, 1, 1); }
    // hull frame
    c.strokeStyle = '#2a2d31'; c.lineWidth = 10; c.strokeRect(OX - 5, OY - 5, GC * CELL + 10, GR * CELL + 10);
    for (const p of panels) {
      if (p.state === 'on') { const cx = p.vs.reduce((s, v) => s + V[v].x, 0) / 4, cy = p.vs.reduce((s, v) => s + V[v].y, 0) / 4; poly(p); panelArt(p, cx, cy); }
      if (p.state === 'burnt' && p.t < 1.2) { poly(p); c.fillStyle = `rgba(255,${Math.round(120 - p.t * 100)},20,${1 - p.t / 1.2})`; c.fill(); }
    }
    // seams
    for (const e of edges.values()) {
      const a = V[e.a], b = V[e.b];
      const live = e.panels.some((q) => q.state === 'on');
      if (!live || e.panels.length === 1) continue;
      if (e.done) { c.strokeStyle = '#000'; c.lineWidth = 4; c.setLineDash([]); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); continue; }
      c.lineWidth = e.fuel ? 3 : 2; c.strokeStyle = e.fuel ? '#ff5a3a' : 'rgba(210,210,200,0.55)'; c.setLineDash(e.fuel ? [6, 5] : []);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]);
      if (e.cut > 0) { const f = Math.min(1, e.cut / (len(e) * 0.85)); c.strokeStyle = '#ffb347'; c.lineWidth = 4; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f); c.stroke(); }
    }
    // the net
    c.strokeStyle = 'rgba(201,162,39,0.6)'; c.lineWidth = 2; c.strokeRect(NET.x, NET.y, NET.w, NET.h);
    for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(NET.x + (k * NET.w) / 5, NET.y); c.lineTo(NET.x + (k * NET.w) / 5, NET.y + NET.h); c.stroke(); }
    c.fillStyle = '#e8c547'; c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.fillText(`NET · ${res.ore} ore`, NET.x + NET.w / 2, NET.y - 6);
    // drifting panels
    for (const p of panels) if (p.state === 'free') {
      const cx = p.vs.reduce((s, v) => s + V[v].x, 0) / 4, cy = p.vs.reduce((s, v) => s + V[v].y, 0) / 4;
      c.save(); c.globalAlpha = Math.max(0, 1 - p.t / 1.6); const sc = 1 - p.t * 0.35;
      c.translate(p.fx, p.fy); c.rotate(p.rot); c.scale(sc, sc); c.translate(-cx, -cy); poly(p); panelArt(p, cx, cy); c.restore();
    }
    for (const s of sparks) { c.fillStyle = s.c; c.globalAlpha = Math.min(1, s.t * 3); c.fillRect(s.x, s.y, 2, 2); }
    c.globalAlpha = 1;
    // torch
    if (down && lastP) { c.fillStyle = locked > 0 ? 'rgba(255,90,58,0.5)' : cutting ? '#fff3c4' : 'rgba(255,200,120,0.6)'; c.beginPath(); c.arc(lastP.x, lastP.y, cutting ? 5 + Math.random() * 3 : 4, 0, 7); c.fill(); }
    for (const p of pops) if (p.t > 0) { c.globalAlpha = Math.min(1, p.t * 2); c.fillStyle = p.c; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText(p.s, p.x, p.y - (1.2 - p.t) * 22); }
    c.globalAlpha = 1;
    // HUD
    c.textAlign = 'left'; c.fillStyle = '#e8c547'; c.font = 'bold 12px monospace';
    c.fillText(`DERELICT · ${Math.max(0, Math.ceil(SHIFT_S - t))}s · freed ${res.freed}/${res.total}`, OX, 30);
    c.fillStyle = 'rgba(230,220,196,0.7)'; c.font = '10px monospace'; c.fillText('drag along a seam to cut · red dashes = fuel', OX, 44);
    c.fillStyle = '#222'; c.fillRect(520, 60, 104, 14); c.fillStyle = heat > 0.8 ? '#ff3b1f' : heat > 0.5 ? '#ffb347' : '#d6f08a'; c.fillRect(520, 60, 104 * heat, 14);
    c.strokeStyle = '#555'; c.strokeRect(520, 60, 104, 14); c.fillStyle = '#efe6cf'; c.font = 'bold 10px monospace'; c.fillText(locked > 0 ? 'COOLING…' : 'TORCH HEAT', 524, 54);
    c.fillStyle = 'rgba(230,220,196,0.6)'; c.font = '10px monospace';
    [['plating', 'plating 5'], ['wiring', 'Cu wiring 10'], ['alloy', 'Ir alloy 25'], ['occupied', 'occupied −15']].forEach(([k, s], i) => { c.fillStyle = TYPES[k].c; c.fillRect(520, 96 + i * 20, 12, 12); c.fillStyle = 'rgba(230,220,196,0.75)'; c.fillText(s, 538, 106 + i * 20); });
    c.restore();
  }

  return { stop };
}
