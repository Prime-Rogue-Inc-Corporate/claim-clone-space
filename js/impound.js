// Null Sector Trust · Impound Yard 4. A gantry claw over a yard of stacked skiffs.
// Citations come in over the radio; find the cited skiff, dig it out from under the others,
// hook it and drop it in the impound bay. The load swings as you move: bump an insured skiff
// and Null Sector pays (well, you do). Impound the wrong skiff and an appeal is filed.
// "Compliance is safety."
import { T13 } from './economy.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 80;
const COLS = 7, CW = 66, SH = 36, FLOOR = 362, GANTRY = 40, CLAW_REST = 62;
const colX = (i) => 52 + i * 72;
const BAY = { x0: 546, x1: 632 };
export const TOW_GRADES = [
  ['Tow Trainee', 0], ['Hook Hand', 100], ['Clamp Operator', 250], ['Yard Clerk', 450], ['Towmaster', 700], ['Senior Towmaster', 1000],
  ['Impound Officer', 1400], ['Seizure Specialist', 1900], ['Compliance Sergeant', 2500], ['Yard Warden', 3200],
  ['Repossession Inspector', 4000], ['Deputy of Seizures', 5000], ['Compliance Is Safety', 6500],
];
const OFFENCES = ['parked on the Spine', 'expired air permit', 'unlicensed smiling', 'loitering in a heat zone', 'rent arrears (Tenure Heights)', 'skiff number unpaid', 'insufficient compliance', 'flight while Sprawl'];

export function createImpound({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const ST = econ.state;
  ST.impound ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const I = ST.impound;
  const blocks = world.spine.blocks || [];
  const b4 = blocks[3] || { x0: -10910, x1: -8050 };
  const SITE = { x: (b4.x0 + b4.x1) / 2 + 700, y: 2150 };
  const PAD = { x: SITE.x, y: SITE.y - 160 };
  const gradeOf = (xp = I.xp) => { let i = 0; TOW_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (I.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 110;
    c.fillStyle = '#14161a'; c.fillRect(x0, y0, 480, 240);
    c.strokeStyle = '#d43a2a'; c.globalAlpha = 0.6; c.lineWidth = 4; c.strokeRect(x0, y0, 480, 240); c.globalAlpha = 1;
    for (let i = 0; i < 7; i++) for (let j = 0; j < 1 + ((i * 5) % 3); j++) { c.fillStyle = (i + j) % 4 ? '#4a5058' : '#2f6db0'; c.fillRect(x0 + 30 + i * 62, y0 + 190 - j * 30, 50, 24); }
    c.fillStyle = '#5a5f66'; c.fillRect(x0 + 20, y0 + 50, 440, 8); // gantry
    const gx = x0 + 60 + ((Math.sin(time / 1500) + 1) / 2) * 360;
    c.strokeStyle = '#aaa'; c.lineWidth = 2; c.beginPath(); c.moveTo(gx, y0 + 58); c.lineTo(gx, y0 + 110); c.stroke();
    c.fillStyle = '#d6a43a'; c.fillRect(gx - 10, y0 + 108, 20, 8);
    c.fillStyle = '#d43a2a'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#0b0c0e'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('NULL SECTOR TRUST · IMPOUND YARD 4', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.7)';
    c.fillText('Compliance is safety.', SITE.x, y0 + 256);
    c.strokeStyle = near ? '#e8c547' : 'rgba(212,58,42,0.8)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#d43a2a'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'TOW', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#d43a2a'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'impound', type: 'race', title: 'Impound Yard 4 · run the tow claw', sub: `${TOW_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Null Sector Impound Yard 4' } }];

  function open() {
    const g = gradeOf(), nx = TOW_GRADES[g + 1];
    openModal(
      `<h2>IMPOUND YARD 4</h2>
       <div class="sub">Null Sector Trust · “Compliance is safety.”</div>
       <div class="explain"><b>${esc(TOW_GRADES[g][0])}</b> · ${I.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${I.best || 0} · shifts ${I.shifts || 0}</div>
       <div class="explain">You run the <b>gantry claw</b>. Citations come over the radio: find the <b style="color:#ff5a3a">cited</b> skiff, hook it, and drop it in the <b>IMPOUND BAY</b> (right). Only the top skiff of a stack can be hooked, so <b>dig cited skiffs out</b> by moving the ones on top to another stack.
         The load <b>swings</b> as you move: bump a stack and it's a dent, and <b style="color:#4f9fd0">insured</b> skiffs cost more. Impound the wrong skiff and an appeal is filed. ${SHIFT_S} seconds.<br/>
         <span class="sub">Drag (or ←/→) to move the claw · tap the CLAW button (or SPACE) to drop / release.</span></div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Take the controls (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="imp" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Leave the cab (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#imp');
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
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 2.2)))).amount : 0;
    if (paid) { I.last = Date.now(); I.xp += Math.max(0, res.score); I.shifts = (I.shifts || 0) + 1; }
    I.best = Math.max(I.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Impound Yard 4: ${res.seized} skiffs seized, ${res.dents} dents, ${res.score} points. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(TOW_GRADES[after][0])}</b>, Null Sector Trust. Compliance is safety. You are very safe.`, 'money');
    emit('impound', { score: res.score, seized: res.seized, wrong: res.wrong, dents: res.dents, insuredDents: res.insuredDents, paid, grade: after, clean: res.seized >= 4 && !res.dents && !res.wrong });
    openModal(
      `<h2>SHIFT OVER</h2>
       <div class="sub">Impound Yard 4 · ${esc(TOW_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         ${res.log.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right;color:${v < 0 ? '#ff7a5c' : '#d6f08a'}">${v > 0 ? '+' : ''}${v}</td></tr>`).join('')}
         <tr><td><b>Total</b></td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${res.wrong ? '<br/><span class="sub">Appeals have been filed. They will be heard in 13 to 130 business days.</span>' : ''}
       ${board ? `<br/>${board.line('impound')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Yard office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('impound'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => TOW_GRADES[gradeOf()][0] };
}

// ---------- the yard ----------
function shift(c, cv, grade, done) {
  let nextNo = 100 + Math.floor(Math.random() * 600);
  const mk = () => ({ no: nextNo++ % 999 || 1, insured: Math.random() < 0.28, cited: null, hue: Math.floor(Math.random() * 360) });
  const stacks = Array.from({ length: COLS }, () => Array.from({ length: 1 + Math.floor(Math.random() * 3) }, mk));
  const res = { score: 0, seized: 0, wrong: 0, dents: 0, insuredDents: 0, log: [] };
  const book = (k, v) => { res.score += v; const e = res.log.find((l) => l[0] === k); if (e) e[1] += v; else res.log.push([k, v]); };
  let t = 0, stopped = false, clawX = 300, aimX = 300, clawY = CLAW_REST, state = 'idle', held = null, theta = 0, omega = 0, lastVx = 0, dentCd = 0, citeIn = 1.2;
  const radio = [], pops = [];
  const SWING_L = FLOOR - 3 * SH - 6 - SH / 2 - (CLAW_REST + 14); // the load rides just above a 3-high stack; swinging dips its corners

  function cite() {
    const pool = stacks.flatMap((s, i) => s.map((k, j) => ({ k, i, j }))).filter((o) => !o.k.cited);
    if (!pool.length) return;
    const o = pool[Math.floor(Math.random() * pool.length)];
    o.k.cited = OFFENCES[Math.floor(Math.random() * OFFENCES.length)];
    radio.unshift({ s: `CITATION · skiff #${String(o.k.no).padStart(3, '0')} · ${o.k.cited}`, t: 6 });
    radio.length = Math.min(radio.length, 3);
  }
  const colAt = (x) => { let best = -1, bd = 1e9; for (let i = 0; i < COLS; i++) { const d = Math.abs(colX(i) - x); if (d < bd) { bd = d; best = i; } } return bd < CW * 0.55 ? best : -1; };
  const topY = (i) => FLOOR - stacks[i].length * SH;
  const pop = (x, y, s, col) => pops.push({ x, y, s, col, t: 1.3 });

  function claw() {
    if (stopped) return;
    if (state === 'idle' && !held) { state = 'down'; return; }
    if (state === 'idle' && held) {
      // release: into the bay, onto a stack, or (badly) onto the floor
      if (clawX >= BAY.x0 && clawX <= BAY.x1) {
        if (held.cited) { const gentle = Math.abs(theta) < 0.15; const v = 20 + (gentle ? 5 : 0); book(`Seized: #${String(held.no).padStart(3, '0')} (${held.cited})`, v); res.seized++; pop(clawX, 200, `SEIZED +${v}`, '#d6f08a'); }
        else { book(`Wrongful impound: #${String(held.no).padStart(3, '0')} (appeal filed)`, -10); res.wrong++; pop(clawX, 200, 'WRONG SKIFF −10', '#ff7a5c'); }
        held = null; return;
      }
      const i = colAt(clawX);
      if (i >= 0 && stacks[i].length < 3) { if (Math.abs(theta) > 0.25) dent(clawX, topY(i) - 10, stacks[i][stacks[i].length - 1] || held); stacks[i].push(held); held = null; return; }
      pop(clawX, 200, i >= 0 ? 'Stack full' : 'Not over a stack or the bay', '#ffb347');
    }
  }
  function dent(x, y, k) {
    if (dentCd > 0) return;
    dentCd = 0.6; res.dents++;
    if (k.insured) { res.insuredDents++; book('Dents to insured skiffs', -12); pop(x, y, 'DENT · INSURED −12', '#4f9fd0'); }
    else { book('Dents (uninsured, so it doesn\'t count much)', -3); pop(x, y, 'DENT −3', '#ffb347'); }
    omega *= -0.5;
  }

  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const BTN = { x: 8, y: 8, w: 108, h: 40 };
  const inBtn = (p) => p.x >= BTN.x && p.x <= BTN.x + BTN.w && p.y >= BTN.y && p.y <= BTN.y + BTN.h;
  const pd = (e) => { e.preventDefault(); const p = pos(e); if (inBtn(p)) return claw(); cv.setPointerCapture?.(e.pointerId); aimX = p.x; dragging = true; };
  let dragging = false;
  const pm = (e) => { if (dragging || e.pointerType === 'mouse') aimX = pos(e).x; };
  const pu = () => { dragging = false; };
  const keys = new Set();
  const kd = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); claw(); } if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) { e.preventDefault(); keys.add(e.key); } };
  const ku = (e) => keys.delete(e.key);
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const stop = () => { stopped = true; window.removeEventListener('pointerup', pu); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  function end() { if (stopped) return; stop(); if (!res.log.length) res.log.push(['Nothing seized. Compliance is concerned.', 0]); done(res); }
  cv.__debug = { stacks, get clawX() { return clawX; }, get state() { return state; }, get held() { return held; }, claw, setAim: (x) => { aimX = x; } };

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    dentCd = Math.max(0, dentCd - dt);
    citeIn -= dt;
    const cited = stacks.flat().filter((k) => k.cited).length;
    if (citeIn <= 0 && t < SHIFT_S - 6) { if (cited < 2 + (grade >= 5 ? 1 : 0)) cite(); citeIn = Math.max(4, 8 - grade * 0.25) + Math.random() * 3; }
    for (const r of radio) r.t -= dt;
    for (const p of pops) p.t -= dt;
    // gantry movement (only when the claw is up)
    if (keys.has('ArrowLeft') || keys.has('a')) aimX -= 300 * dt;
    if (keys.has('ArrowRight') || keys.has('d')) aimX += 300 * dt;
    aimX = Math.max(20, Math.min(W - 20, aimX));
    const prev = clawX;
    if (state === 'idle') { const dx = aimX - clawX; clawX += Math.sign(dx) * Math.min(Math.abs(dx), (190 - grade * 2) * dt); }
    const vx = (clawX - prev) / Math.max(dt, 1e-4), ax = (vx - lastVx) / Math.max(dt, 1e-4); lastVx = vx;
    // pendulum
    if (held) { omega += (-(9.8 / SWING_L) * 140 * Math.sin(theta) - (ax / SWING_L) * 0.9) * dt; omega *= Math.pow(0.55, dt); theta += omega * dt; theta = Math.max(-1.1, Math.min(1.1, theta)); }
    else { theta = 0; omega = 0; }
    // claw up / down
    if (state === 'down') {
      clawY += 280 * dt;
      const i = colAt(clawX);
      const stop = i >= 0 && stacks[i].length ? topY(i) - 2 : FLOOR - 4;
      if (clawY >= stop) { clawY = stop; if (i >= 0 && stacks[i].length && Math.abs(colX(i) - clawX) < CW * 0.4) { held = stacks[i].pop(); } else pop(clawX, clawY - 20, 'missed', 'rgba(230,220,196,0.7)'); state = 'up'; }
    } else if (state === 'up') { clawY -= 240 * dt; if (clawY <= CLAW_REST) { clawY = CLAW_REST; state = 'idle'; } }
    // the swinging load bumps stacks
    if (held && state === 'idle') {
      const hx = clawX + Math.sin(theta) * SWING_L, hy = clawY + 14 + Math.cos(theta) * SWING_L;
      for (let i = 0; i < COLS; i++) {
        if (!stacks[i].length) continue;
        const dip = hy + SH / 2 + Math.abs(Math.sin(theta * 0.6)) * CW / 2;
        if (Math.abs(colX(i) - hx) < CW * 0.95 && dip > topY(i) + 2) { dent(hx, topY(i) - 10, stacks[i][stacks[i].length - 1]); break; }
      }
    }
    if (t >= SHIFT_S) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#efe6cf', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function skiff(k, x, y, a = 0) {
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = k.insured ? '#3d6f96' : `hsl(${k.hue},10%,36%)`;
    c.beginPath(); c.moveTo(-CW / 2 + 4, SH / 2 - 4); c.lineTo(-CW / 2, -2); c.lineTo(-CW / 2 + 10, -SH / 2 + 6); c.lineTo(CW / 2 - 8, -SH / 2 + 6); c.lineTo(CW / 2, 2); c.lineTo(CW / 2 - 6, SH / 2 - 4); c.closePath(); c.fill();
    c.fillStyle = 'rgba(160,210,240,0.55)'; c.beginPath(); c.ellipse(6, -SH / 2 + 8, 10, 6, 0, Math.PI, 0); c.fill();
    txt(`#${String(k.no).padStart(3, '0')}`, -4, 7, 10, '#efe6cf', 'center', true);
    if (k.insured) { c.fillStyle = '#9fd0ff'; c.fillRect(CW / 2 - 18, -4, 9, 9); txt('I', CW / 2 - 13.5, 4, 8, '#123', 'center', true); }
    if (k.cited) { c.fillStyle = '#ff3b1f'; c.fillRect(-CW / 2 + 2, -SH / 2 - 2, 18, 12); txt('!', -CW / 2 + 11, -SH / 2 + 8, 10, '#fff', 'center', true); }
    c.restore();
  }

  function draw() {
    c.fillStyle = '#101216'; c.fillRect(0, 0, W, H);
    for (let k = 0; k < 5; k++) { c.fillStyle = 'rgba(212,58,42,0.05)'; c.fillRect(0, 70 + k * 60, W, 2); }
    // gantry
    c.fillStyle = '#5a5f66'; c.fillRect(0, GANTRY - 6, W, 10);
    c.fillStyle = '#3a3e44'; c.fillRect(clawX - 20, GANTRY - 10, 40, 16);
    c.strokeStyle = '#aaa'; c.lineWidth = 2; c.beginPath(); c.moveTo(clawX, GANTRY + 4); c.lineTo(clawX, clawY); c.stroke();
    c.fillStyle = '#d6a43a'; c.fillRect(clawX - 14, clawY, 28, 8);
    c.strokeStyle = '#d6a43a'; c.lineWidth = 3; c.beginPath(); c.moveTo(clawX - 12, clawY + 8); c.lineTo(clawX - 16, clawY + 18); c.moveTo(clawX + 12, clawY + 8); c.lineTo(clawX + 16, clawY + 18); c.stroke();
    // floor + bay
    c.fillStyle = '#23262b'; c.fillRect(0, FLOOR, W, H - FLOOR);
    c.fillStyle = 'rgba(212,58,42,0.18)'; c.fillRect(BAY.x0, 150, BAY.x1 - BAY.x0, FLOOR - 150);
    c.strokeStyle = '#d43a2a'; c.setLineDash([6, 4]); c.strokeRect(BAY.x0, 150, BAY.x1 - BAY.x0, FLOOR - 150); c.setLineDash([]);
    txt('IMPOUND', (BAY.x0 + BAY.x1) / 2, 170, 11, '#ff5a3a', 'center', true); txt('BAY', (BAY.x0 + BAY.x1) / 2, 184, 11, '#ff5a3a', 'center', true);
    // stacks
    stacks.forEach((s, i) => { s.forEach((k, j) => skiff(k, colX(i), FLOOR - j * SH - SH / 2)); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(colX(i) - CW / 2, FLOOR, CW, 3); });
    // held load
    if (held) {
      const hx = clawX + Math.sin(theta) * SWING_L, hy = clawY + 14 + Math.cos(theta) * SWING_L;
      c.strokeStyle = '#888'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(clawX, clawY + 14); c.lineTo(hx, hy - SH / 2); c.stroke();
      skiff(held, hx, hy, theta * 0.6);
    }
    // aim ghost
    if (state === 'idle' && Math.abs(aimX - clawX) > 4) { c.strokeStyle = 'rgba(214,240,138,0.3)'; c.beginPath(); c.moveTo(aimX, GANTRY + 6); c.lineTo(aimX, GANTRY + 26); c.stroke(); }
    // HUD
    c.fillStyle = state === 'idle' ? 'rgba(214,164,58,0.25)' : 'rgba(255,255,255,0.05)'; c.fillRect(BTN.x, BTN.y, BTN.w, BTN.h);
    c.strokeStyle = '#d6a43a'; c.strokeRect(BTN.x, BTN.y, BTN.w, BTN.h);
    txt(held ? 'RELEASE' : 'CLAW ↓', BTN.x + BTN.w / 2, BTN.y + 25, 13, '#efe6cf', 'center', true);
    txt(`IMPOUND YARD 4 · ${Math.max(0, Math.ceil(SHIFT_S - t))}s · seized ${res.seized} · score ${res.score}`, 628, 22, 11, 'rgba(230,220,196,0.8)', 'right');
    radio.forEach((r, k) => { if (r.t > 0 || k === 0) { c.globalAlpha = k === 0 ? 1 : Math.max(0.35, Math.min(1, r.t)); txt(r.s, 628, 40 + k * 14, 10, k === 0 ? '#ff5a3a' : 'rgba(255,90,58,0.7)', 'right', k === 0, 500); c.globalAlpha = 1; } });
    for (const p of pops) if (p.t > 0) { c.globalAlpha = Math.min(1, p.t * 2); txt(p.s, Math.max(70, Math.min(570, p.x)), p.y - (1.3 - p.t) * 18, 12, p.col, 'center', true); }
    c.globalAlpha = 1;
  }

  return { stop };
}
