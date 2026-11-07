// Last Mile Freight · Loading Dock 3. Pack the cargo hold before the conveyor dumps it into the void.
// Parcels ride a belt toward the end of the dock; anything not loaded falls off and is "subcontracted".
// When you depart (or the whistle goes), the hold is inspected and damage claims are deducted.
// Pays scrap for now; merit climbs 13 courier grades. "Every package arrives eventually."
import { T13 } from './economy.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400;
const COLS = 8, ROWS = 5, CELL = 44, GX = 18, GY = 58; // the hold (door on the right)
const BELT_Y = 336, BELT_H = 56;
const SHIFT_S = 80;
export const GRADES = [
  ['Probationary Courier', 0], ['Courier', 100], ['Senior Courier', 250], ['Dock Hand (Promoted Sideways)', 450],
  ['Load Planner', 700], ['Senior Load Planner', 1000], ['Tetris-Adjacent', 1400], ['Hold Whisperer', 1900],
  ['Dock Captain', 2500], ['Freight Philosopher', 3200], ['Logistics Mystic', 4000], ['Master of the Last Mile', 5000], ['Every Package Arrives', 6500],
];
const SHAPES = [
  [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 0], [1, 0], [2, 0], [3, 0]],
];
const CARGO = ['coolant cells', 'unmarked crates', 'ration bricks', 'reactor slag', 'a sealed casket', 'contraband prayer beads', 'recycled water', 'a goat (alive)', 'Bureau pamphlets', 'spare skiff numbers', 'smile pins', 'a Ministry stapler', 'air (metered)', 'somebody’s dentures'];
const TAGS = {
  FRAGILE: { c: '#e6dcc4', rule: 'nothing on 3+ sides, or it\'s crushed' },
  HAZMAT: { c: '#ff7a1f', rule: 'never touching PERISHABLE' },
  PERISHABLE: { c: '#7fd17f', rule: 'never touching HAZMAT' },
  PRIORITY: { c: '#4fc3f7', rule: 'within 2 columns of the door' },
};
const PALETTE = ['#8a6a3a', '#6b5a3a', '#7a5a46', '#5f6b45', '#6a5f52', '#7d6a4a'];

export function createDock({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const S = econ.state;
  S.dock ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const D = S.dock;
  const blocks = world.spine.blocks || [];
  const b8 = blocks[7] || { x0: 1730, x1: 4590 };
  const SITE = { x: (b8.x0 + b8.x1) / 2 - 300, y: 1500 };
  const PAD = { x: SITE.x, y: SITE.y - 150 };
  const gradeOf = (xp = D.xp) => { let i = 0; GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (D.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 260, y0 = SITE.y - 110;
    c.fillStyle = '#16191c'; c.fillRect(x0, y0, 520, 260);
    c.strokeStyle = '#4fc3f7'; c.globalAlpha = 0.6; c.lineWidth = 4; c.strokeRect(x0, y0, 520, 260); c.globalAlpha = 1;
    c.fillStyle = '#2a2d31'; c.fillRect(x0 + 20, y0 + 180, 480, 40); // the belt
    for (let i = 0; i < 12; i++) { const bx = x0 + 20 + ((i * 44 + time / 20) % 480); c.fillStyle = PALETTE[i % PALETTE.length]; c.fillRect(bx, y0 + 186, 26, 26); }
    c.fillStyle = '#20343f'; c.fillRect(x0 + 40, y0 + 50, 300, 110); // a hold, open
    c.strokeStyle = 'rgba(79,195,247,0.35)'; c.lineWidth = 1;
    for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(x0 + 40 + i * 37.5, y0 + 50); c.lineTo(x0 + 40 + i * 37.5, y0 + 160); c.stroke(); }
    c.fillStyle = '#4fc3f7'; c.fillRect(x0, y0, 520, 34);
    c.fillStyle = '#0b0c0e'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('LAST MILE FREIGHT · LOADING DOCK 3', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.7)';
    c.fillText('Every package arrives eventually.', SITE.x, y0 + 275);
    c.strokeStyle = near ? '#e8c547' : 'rgba(79,195,247,0.6)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#4fc3f7'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'LOAD', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#4fc3f7'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'dock', type: 'freight', title: 'Loading Dock 3 · pack the hold', sub: `${GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Last Mile Loading Dock 3' } }];

  function open() {
    const g = gradeOf(), nx = GRADES[g + 1];
    openModal(
      `<h2>LOADING DOCK 3</h2>
       <div class="sub">Last Mile Freight · “Every package arrives eventually.”</div>
       <div class="explain"><b>${esc(GRADES[g][0])}</b> · ${D.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${D.best || 0} · shifts ${D.shifts || 0}</div>
       <div class="explain">Parcels ride the belt toward the end of the dock. <b>Tap one to pick it up</b>, rotate it (↻ or R), and place it in the hold. Anything that reaches the end of the belt falls off and is <i>subcontracted</i> (−5).
         Hit <b>DEPART</b> when you're happy, or the whistle goes at ${SHIFT_S} s. Then the inspector arrives.<br/><br/>
         <b style="color:${TAGS.FRAGILE.c}">FRAGILE</b>: ${TAGS.FRAGILE.rule}. <b style="color:${TAGS.HAZMAT.c}">HAZMAT</b> and <b style="color:${TAGS.PERISHABLE.c}">PERISHABLE</b>: never touching each other. <b style="color:${TAGS.PRIORITY.c}">PRIORITY</b>: ${TAGS.PRIORITY.rule}.<br/>
         <span class="sub">PC: hover to aim, click to place, right-click or R to rotate. Phone: tap a spot to preview, tap again to place.</span></div>
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
      `<div class="mil-wrap"><canvas id="dock" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Walk off the job (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#dock');
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
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.total / 3)))).amount : 0;
    if (paid) { D.last = Date.now(); D.xp += Math.max(0, res.total); D.shifts = (D.shifts || 0) + 1; }
    D.best = Math.max(D.best || 0, res.total);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Dock 3: hold ${Math.round(res.fill * 100)}% full, ${res.total} points. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(GRADES[after][0])}</b>, Last Mile Freight. Your risk is still subcontracted.`, 'money');
    emit('dock', { total: res.total, fill: res.fill, lost: res.lost, claims: res.claims.length, paid, grade: after, perfect: res.fill >= 1 && !res.claims.length });
    const lines = res.lines.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right;color:${v < 0 ? '#ff7a5c' : '#d6f08a'}">${v > 0 ? '+' : ''}${v}</td></tr>`).join('');
    openModal(
      `<h2>INSPECTION REPORT</h2>
       <div class="sub">Loading Dock 3 · ${esc(GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>${lines}<tr><td><b>Total</b></td><td style="text-align:right"><b>${res.total}</b></td></tr></table>
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.total)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}<br/>
       <span class="sub">${res.claims.length ? 'Damage claims have been forwarded to you. Last Mile accepts no liability, and also none of yours.' : 'No claims. Suspicious. This has been noted.'}</span>
       ${board ? `<br/>${board.line('dock')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Dock office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('dock'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => GRADES[gradeOf()][0] };
}

// ---------- the shift ----------
const rot = (cells) => { const r = cells.map(([x, y]) => [-y, x]); const mx = Math.min(...r.map((p) => p[0])), my = Math.min(...r.map((p) => p[1])); return r.map(([x, y]) => [x - mx, y - my]); };
const dims = (cells) => [Math.max(...cells.map((p) => p[0])) + 1, Math.max(...cells.map((p) => p[1])) + 1];

function shift(c, cv, grade, done) {
  const hold = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const placed = [];
  const belt = [];
  let hand = null, ghost = null, t = 0, spawnIn = 0.4, stopped = false, nextId = 1, lostN = 0, msg = null, msgT = 0;
  const pace = Math.max(2.2, 3.4 - grade * 0.1); // seconds between parcels
  const speed = 46 + grade * 2; // px/s along the belt
  const tagChance = Math.min(0.65, 0.4 + grade * 0.02);

  const newParcel = () => {
    const cells = SHAPES[Math.floor(Math.random() * SHAPES.length)].map((p) => [...p]);
    const r = Math.random();
    const tag = r < tagChance ? ['FRAGILE', 'HAZMAT', 'PERISHABLE', 'PRIORITY'][Math.floor(Math.random() * 4)] : null;
    return { id: nextId++, cells, tag, name: CARGO[Math.floor(Math.random() * CARGO.length)], color: PALETTE[Math.floor(Math.random() * PALETTE.length)], x: -60 };
  };
  const BELT_CELL = 16;
  const beltW = (p) => dims(p.cells)[0] * BELT_CELL;

  function fits(p, gx, gy) {
    return p.cells.every(([x, y]) => { const cx = gx + x, cy = gy + y; return cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS && !hold[cy][cx]; });
  }
  function place(gx, gy) {
    if (!hand || !fits(hand, gx, gy)) return false;
    const p = { ...hand, gx, gy };
    for (const [x, y] of p.cells) hold[gy + y][gx + x] = p;
    placed.push(p); hand = null; ghost = null;
    return true;
  }
  const say = (s) => { msg = s; msgT = 1.6; };

  // input
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const cellAt = (p) => { if (!hand) return null; const [w, h] = dims(hand.cells); const gx = Math.round((p.x - GX) / CELL - w / 2), gy = Math.round((p.y - GY) / CELL - h / 2); return { gx, gy }; };
  const inHold = (p) => p.x >= GX - CELL && p.x <= GX + COLS * CELL + CELL && p.y >= GY - CELL && p.y <= GY + ROWS * CELL + CELL / 2;
  const BTN = { rot: { x: 412, y: 236, w: 100, h: 40 }, dump: { x: 522, y: 236, w: 100, h: 40 }, depart: { x: 412, y: 284, w: 210, h: 38 } };
  const inBtn = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const doRotate = () => { if (hand) { hand.cells = rot(hand.cells); if (ghost) ghost = { ...ghost }; } };
  const dump = () => { if (hand) { lostN++; say(`Left on the dock: ${hand.name}. Subcontracted.`); hand = null; ghost = null; } };
  const pd = (e) => {
    e.preventDefault();
    const p = pos(e);
    if (e.button === 2) return doRotate();
    if (inBtn(p, BTN.rot)) return doRotate();
    if (inBtn(p, BTN.dump)) return dump();
    if (inBtn(p, BTN.depart)) return end();
    if (p.y >= BELT_Y - 6) { // pick up from the belt
      const it = belt.find((b) => p.x >= b.x - 6 && p.x <= b.x + beltW(b) + 6);
      if (it) { belt.splice(belt.indexOf(it), 1); if (hand) belt.push({ ...hand, x: it.x }); hand = it; ghost = null; }
      return;
    }
    if (hand && inHold(p)) {
      const cpos = cellAt(p);
      if (e.pointerType === 'mouse') { if (!place(cpos.gx, cpos.gy)) say('Doesn’t fit there.'); return; }
      if (ghost && ghost.gx === cpos.gx && ghost.gy === cpos.gy) { if (!place(cpos.gx, cpos.gy)) say('Doesn’t fit there.'); }
      else ghost = cpos;
    }
  };
  const pm = (e) => { if (e.pointerType !== 'mouse' || !hand) return; const p = pos(e); ghost = inHold(p) ? cellAt(p) : null; };
  const ctx = (e) => e.preventDefault();
  const kd = (e) => { if (e.key === 'r' || e.key === 'R') { e.preventDefault(); doRotate(); } if (e.key === 'Enter') end(); };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); cv.addEventListener('contextmenu', ctx);
  window.addEventListener('keydown', kd);
  const stop = () => { stopped = true; window.removeEventListener('keydown', kd); };

  function end() {
    if (stopped) return;
    stop();
    lostN += belt.length + (hand ? 1 : 0);
    done(inspect());
  }

  function inspect() {
    const lines = [], claims = [];
    const used = placed.reduce((s, p) => s + p.cells.length, 0);
    const fill = used / (COLS * ROWS);
    lines.push([`Cargo loaded: ${placed.length} parcels, ${used}/${COLS * ROWS} spaces`, used * 3]);
    if (fill >= 0.9) lines.push([fill >= 1 ? 'Hold sealed full (bonus)' : 'Hold 90%+ full (bonus)', fill >= 1 ? 39 : 13]);
    const nb = (p) => { const s = new Set(); for (const [x, y] of p.cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const cx = p.gx + x + dx, cy = p.gy + y + dy; if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS && hold[cy][cx] && hold[cy][cx] !== p) s.add(hold[cy][cx]); } return s; };
    for (const p of placed) {
      if (p.tag === 'PRIORITY') {
        const near = p.cells.every(([x]) => p.gx + x >= COLS - 2);
        lines.push([`Priority: ${p.name}${near ? ' (by the door)' : ' (buried)'}`, near ? 8 : -4]);
      }
      if (p.tag === 'HAZMAT') for (const q of nb(p)) if (q.tag === 'PERISHABLE') { claims.push(1); lines.push([`Contamination claim: ${q.name} next to ${p.name}`, -15]); }
      if (p.tag === 'FRAGILE') {
        let worst = 0;
        for (const [x, y] of p.cells) {
          let n = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const cx = p.gx + x + dx, cy = p.gy + y + dy; if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS && hold[cy][cx] && hold[cy][cx] !== p) n++; }
          worst = Math.max(worst, n);
        }
        if (worst >= 3) { claims.push(1); lines.push([`Crush claim: ${p.name} (fragile)`, -10]); }
        else lines.push([`Fragile intact: ${p.name}`, 4]);
      }
    }
    if (lostN) lines.push([`Subcontracted (fell off the dock): ${lostN}`, -5 * lostN]);
    const total = lines.reduce((s, [, v]) => s + v, 0);
    return { lines, claims, fill, lost: lostN, total };
  }

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    msgT = Math.max(0, msgT - dt);
    spawnIn -= dt;
    if (spawnIn <= 0) { belt.push(newParcel()); spawnIn = pace * (0.8 + Math.random() * 0.4); }
    // the belt: parcels queue up rather than overlap
    belt.sort((a, b) => b.x - a.x);
    let limit = W + 40;
    for (const b of belt) { b.x = Math.min(b.x + speed * dt, limit - beltW(b) - 10); limit = b.x; }
    for (let i = belt.length - 1; i >= 0; i--) if (belt[i].x > W - 30) { say(`${belt[i].name} fell off the dock. Subcontracted.`); belt.splice(i, 1); lostN++; }
    if (t >= SHIFT_S) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function drawParcel(p, ox, oy, cs, alpha = 1, bad = false) {
    c.globalAlpha = alpha;
    for (const [x, y] of p.cells) {
      c.fillStyle = bad ? '#7a2a20' : p.color;
      c.fillRect(ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2);
      c.strokeStyle = p.tag ? TAGS[p.tag].c : 'rgba(0,0,0,0.5)'; c.lineWidth = p.tag ? 2 : 1;
      c.strokeRect(ox + x * cs + 1.5, oy + y * cs + 1.5, cs - 3, cs - 3);
      if (cs >= 30) { c.strokeStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.moveTo(ox + x * cs + cs / 2, oy + y * cs + 3); c.lineTo(ox + x * cs + cs / 2, oy + y * cs + cs - 3); c.stroke(); }
    }
    if (p.tag && cs >= 30) {
      const [x, y] = p.cells[0];
      c.fillStyle = TAGS[p.tag].c; c.font = 'bold 8px monospace'; c.textAlign = 'center';
      c.fillText(p.tag.slice(0, 5), ox + x * cs + cs / 2, oy + y * cs + cs / 2 + 3);
    }
    c.globalAlpha = 1;
  }

  function draw() {
    c.fillStyle = '#0d1012'; c.fillRect(0, 0, W, H);
    // header
    c.fillStyle = '#e8c547'; c.font = 'bold 13px monospace'; c.textAlign = 'left';
    c.fillText('HOLD · SKIFF-CLASS HAULER', GX, 22);
    c.fillStyle = 'rgba(230,220,196,0.7)'; c.font = '11px monospace';
    c.fillText(`whistle in ${Math.max(0, Math.ceil(SHIFT_S - t))}s · fell off: ${lostN}`, GX, 40);
    // the hold
    c.fillStyle = '#16232b'; c.fillRect(GX - 4, GY - 4, COLS * CELL + 8, ROWS * CELL + 8);
    c.fillStyle = 'rgba(79,195,247,0.08)'; c.fillRect(GX + (COLS - 2) * CELL, GY, CELL * 2, ROWS * CELL);
    c.strokeStyle = 'rgba(79,195,247,0.18)'; c.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) { c.beginPath(); c.moveTo(GX + x * CELL, GY); c.lineTo(GX + x * CELL, GY + ROWS * CELL); c.stroke(); }
    for (let y = 0; y <= ROWS; y++) { c.beginPath(); c.moveTo(GX, GY + y * CELL); c.lineTo(GX + COLS * CELL, GY + y * CELL); c.stroke(); }
    c.fillStyle = '#4fc3f7'; c.fillRect(GX + COLS * CELL + 4, GY, 6, ROWS * CELL);
    c.save(); c.translate(GX + COLS * CELL + 22, GY + ROWS * CELL / 2); c.rotate(-Math.PI / 2); c.fillStyle = '#4fc3f7'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText('DOOR · PRIORITY HERE', 0, 0); c.restore();
    for (const p of placed) drawParcel(p, GX + p.gx * CELL, GY + p.gy * CELL, CELL);
    if (hand && ghost) drawParcel(hand, GX + ghost.gx * CELL, GY + ghost.gy * CELL, CELL, 0.55, !fits(hand, ghost.gx, ghost.gy));
    // in hand
    c.fillStyle = '#16191c'; c.fillRect(404, 58, 226, 170);
    c.strokeStyle = 'rgba(232,197,71,0.4)'; c.strokeRect(404, 58, 226, 170);
    c.fillStyle = '#e8c547'; c.font = 'bold 11px monospace'; c.textAlign = 'left'; c.fillText('IN HAND', 412, 74);
    if (hand) {
      const [w, h] = dims(hand.cells), cs = Math.min(34, 120 / Math.max(w, h));
      drawParcel(hand, 517 - (w * cs) / 2, 150 - (h * cs) / 2, cs);
      c.fillStyle = '#efe6cf'; c.font = '11px monospace'; c.textAlign = 'center'; c.fillText(hand.name, 517, 96, 210);
      if (hand.tag) { c.fillStyle = TAGS[hand.tag].c; c.font = 'bold 10px monospace'; c.fillText(`${hand.tag}: ${TAGS[hand.tag].rule}`, 517, 216, 216); }
    } else { c.fillStyle = 'rgba(230,220,196,0.5)'; c.font = '11px monospace'; c.textAlign = 'center'; c.fillText('tap a parcel on the belt', 517, 146); }
    const btn = (b, label, on = true, col = '#e8c547') => { c.fillStyle = on ? 'rgba(232,197,71,0.12)' : 'rgba(255,255,255,0.03)'; c.fillRect(b.x, b.y, b.w, b.h); c.strokeStyle = on ? col : '#444'; c.strokeRect(b.x, b.y, b.w, b.h); c.fillStyle = on ? '#efe6cf' : '#666'; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 4); };
    btn(BTN.rot, '↻ ROTATE (R)', !!hand); btn(BTN.dump, 'LEAVE IT', !!hand, '#ff7a5c'); btn(BTN.depart, 'DEPART · INSPECTION', true, '#d6f08a');
    // the belt
    c.fillStyle = '#24272b'; c.fillRect(0, BELT_Y - 8, W, BELT_H);
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let x = -((t * speed) % 24); x < W; x += 24) { c.beginPath(); c.moveTo(x, BELT_Y - 8); c.lineTo(x, BELT_Y - 8 + BELT_H); c.stroke(); }
    c.fillStyle = '#000'; c.fillRect(W - 30, BELT_Y - 8, 30, BELT_H);
    c.fillStyle = '#ff3b1f'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillText('VOID', W - 15, BELT_Y + 22);
    for (const b of belt) drawParcel(b, b.x, BELT_Y, BELT_CELL);
    if (msgT > 0) { c.globalAlpha = Math.min(1, msgT * 2); c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, BELT_Y - 34, W, 22); c.fillStyle = '#ffb347'; c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.fillText(msg, W / 2, BELT_Y - 19); c.globalAlpha = 1; }
  }

  return { stop };
}
