// Ash & Iron · Foundry Line 3. Pour molten iron from the ladle into moulds riding the conveyor.
// Drag (or move the mouse) to aim the ladle, hold to pour. The stream takes a moment to fall,
// so lead the mould. Fill to the line: short pours pay little, overflow spills and burns.
// The belt keeps time with the hymn: at the chorus it speeds up. "Production is prayer."
import { T13 } from './economy.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 75;
const BELT_Y = 300, LADLE_Y = 64, FALL = 330; // px/s
export const CASTER_GRADES = [
  ['Ash Sweeper', 0], ['Bellows Boy', 100], ['Ladle Hand', 250], ['Pourer', 450], ['Caster', 700], ['Senior Caster', 1000],
  ['Hymn Leader', 1400], ['Crucible Keeper', 1900], ['Furnace Deacon', 2500], ['Master of the Melt', 3200],
  ['Iron Bishop', 4000], ['Smog Cardinal', 5000], ['Production Is Prayer', 6500],
];
const MOULDS = {
  ingot: { w: 54, h: 26, cap: 28, pay: 12, label: 'INGOT' },
  gear: { w: 70, h: 36, cap: 44, pay: 18, label: 'GEAR' },
  bell: { w: 92, h: 52, cap: 72, pay: 30, label: 'BELL' },
  foreman: { w: 64, h: 70, cap: 60, pay: 45, label: 'THE FOREMAN', bust: true },
};
const HYMN = ['Pour, pour, the holy pour', 'Ash to ash and iron more', 'Quota met is quota blessed', 'Smog our breath and steel our rest'];

export function createFoundry({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const ST = econ.state;
  ST.foundry ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const F = ST.foundry;
  const blocks = world.spine.blocks || [];
  const b3 = blocks[2] || { x0: -13770, x1: -10910 };
  const SITE = { x: (b3.x0 + b3.x1) / 2 - 300, y: 1550 };
  const PAD = { x: SITE.x, y: SITE.y - 160 };
  const gradeOf = (xp = F.xp) => { let i = 0; CASTER_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (F.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 110;
    c.fillStyle = '#1d1410'; c.fillRect(x0, y0, 480, 240);
    c.strokeStyle = '#ff7a1f'; c.globalAlpha = 0.6; c.lineWidth = 4; c.strokeRect(x0, y0, 480, 240); c.globalAlpha = 1;
    // furnace glow + chimneys
    const g = 0.5 + 0.3 * Math.sin(time / 300);
    c.fillStyle = `rgba(255,120,30,${g})`; c.beginPath(); c.arc(x0 + 90, y0 + 110, 46, 0, 7); c.fill();
    c.fillStyle = '#2b211b'; c.fillRect(x0 + 60, y0 + 60, 60, 20); c.fillRect(x0 + 330, y0 - 30, 22, 80); c.fillRect(x0 + 380, y0 - 50, 22, 100);
    for (let k = 0; k < 5; k++) { c.fillStyle = 'rgba(90,85,80,0.35)'; c.beginPath(); c.arc(x0 + 341 + Math.sin(time / 700 + k) * 8, y0 - 40 - ((time / 30 + k * 20) % 100), 10 + k * 2, 0, 7); c.fill(); }
    c.fillStyle = '#3a2f25'; c.fillRect(x0 + 150, y0 + 170, 310, 16);
    for (let i = 0; i < 6; i++) { const mx = x0 + 150 + ((i * 52 + time / 25) % 310); c.fillStyle = i % 2 ? '#ff7a1f' : '#555'; c.fillRect(mx, y0 + 158, 30, 12); }
    c.fillStyle = '#ff7a1f'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#0b0c0e'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('ASH & IRON · FOUNDRY LINE 3', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.7)';
    c.fillText('Production is prayer.', SITE.x, y0 + 256);
    c.strokeStyle = near ? '#e8c547' : 'rgba(255,122,31,0.8)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#ff7a1f'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'POUR', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#ff7a1f'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'foundry', type: 'freight', title: 'Foundry Line 3 · pour the iron', sub: `${CASTER_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Ash & Iron Foundry Line 3' } }];

  function open() {
    const g = gradeOf(), nx = CASTER_GRADES[g + 1];
    openModal(
      `<h2>FOUNDRY LINE 3</h2>
       <div class="sub">Ash & Iron · “Production is prayer.”</div>
       <div class="explain"><b>${esc(CASTER_GRADES[g][0])}</b> · ${F.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${F.best || 0} · shifts ${F.shifts || 0}</div>
       <div class="explain"><b>Move the ladle</b> (drag, or the mouse) and <b>hold to pour</b> (touch, click, or SPACE). Moulds ride the belt; the iron takes a moment to fall, so <b>lead them</b>.
         Fill each mould <b>to the line</b> (the band near the top): a full cast pays; a short pour pays a little; a blank costs you; overflow spills and burns the belt.
         The ladle refills when you're not pouring. The belt keeps time with the hymn and <b>speeds up at the chorus</b>. Occasionally a mould of <b>the Foreman</b> comes down the line: get him right. ${SHIFT_S} seconds.</div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Take the ladle (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="foundry" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Leave the line (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#foundry');
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
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 3)))).amount : 0;
    if (paid) { F.last = Date.now(); F.xp += Math.max(0, res.score); F.shifts = (F.shifts || 0) + 1; }
    F.best = Math.max(F.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Foundry Line 3: ${res.full} full casts, ${res.blank} blanks, ${res.score} points. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(CASTER_GRADES[after][0])}</b>, Ash & Iron. Production is prayer, and you have been heard.`, 'money');
    emit('foundry', { score: res.score, full: res.full, short: res.short, blank: res.blank, spilled: Math.round(res.spill), foremen: res.foremen, paid, grade: after, perfect: res.full >= 8 && !res.blank && res.spill < 10 });
    openModal(
      `<h2>END OF SHIFT</h2>
       <div class="sub">Foundry Line 3 · ${esc(CASTER_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         <tr><td>Full casts (${res.full})</td><td style="text-align:right;color:#d6f08a">+${res.fullPts}</td></tr>
         ${res.foremen ? `<tr><td>Busts of the Foreman, cast true (${res.foremen})</td><td style="text-align:right;color:#d6f08a">incl.</td></tr>` : ''}
         ${res.short ? `<tr><td>Short pours (${res.short})</td><td style="text-align:right;color:#d6f08a">+${res.short * 4}</td></tr>` : ''}
         ${res.blank ? `<tr><td>Blanks (${res.blank}): the Foreman noticed</td><td style="text-align:right;color:#ff7a5c">−${res.blank * 3}</td></tr>` : ''}
         ${res.spill >= 1 ? `<tr><td>Iron spilled on the belt</td><td style="text-align:right;color:#ff7a5c">−${Math.round(res.spill / 4)}</td></tr>` : ''}
         <tr><td><b>Total</b></td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       <br/><span class="sub">${res.foremenBad ? 'A bust of the Foreman was cast badly. This has been noted, by the Foreman.' : 'Quota met is quota blessed.'}</span>
       ${board ? `<br/>${board.line('foundry')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Foundry office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('foundry'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => CASTER_GRADES[gradeOf()][0] };
}

// ---------- the line ----------
function shift(c, cv, grade, done) {
  const moulds = [], drops = [], splats = [], pops = [];
  let t = 0, stopped = false, ladleX = W / 2, aimX = W / 2, pouring = false, metal = 100, nextIn = 0.4, beltX = 0;
  const res = { score: 0, full: 0, fullPts: 0, short: 0, blank: 0, spill: 0, foremen: 0, foremenBad: 0 };
  const baseSpeed = 62 + grade * 2.5;
  const speedAt = () => baseSpeed * (Math.floor(t / 10) % 4 === 3 ? 1.55 : 1); // the chorus: every 4th verse
  const verse = () => HYMN[Math.floor(t / 10) % 4];

  function spawn() {
    const r = Math.random();
    const type = r < 0.06 + grade * 0.004 ? 'foreman' : r < 0.42 ? 'ingot' : r < 0.78 ? 'gear' : 'bell';
    const M = MOULDS[type];
    moulds.push({ type, x: -M.w - 4, fill: 0, done: false });
  }
  function judge(m) {
    const M = MOULDS[m.type], f = m.fill / M.cap;
    let s;
    if (f < 0.05) { res.blank++; res.score -= 3; s = ['BLANK −3', '#ff7a5c']; if (m.type === 'foreman') res.foremenBad++; }
    else if (f < 0.82) { res.short++; res.score += 4; s = ['SHORT +4', '#ffd166']; if (m.type === 'foreman') res.foremenBad++; }
    else { res.full++; const p = M.pay + (f <= 1.04 ? 5 : 0); res.fullPts += p; res.score += p; if (m.type === 'foreman') res.foremen++; s = [f <= 1.04 ? `TRUE CAST +${p}` : `FULL +${p}`, '#d6f08a']; }
    pops.push({ x: Math.min(W - 60, m.x + M.w / 2), y: BELT_Y - M.h - 20, s: s[0], col: s[1], t: 1.1 });
  }

  // input: ladle follows the pointer; holding pours
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pd = (e) => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); const p = pos(e); aimX = p.x; pouring = p.y < BELT_Y + 32; }; // the strip under the belt moves the ladle without pouring
  const pm = (e) => { aimX = pos(e).x; };
  const pu = () => { pouring = false; };
  const keys = new Set();
  const kd = (e) => { if ([' ', 'ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) { e.preventDefault(); keys.add(e.key); if (e.key === ' ') pouring = true; } };
  const ku = (e) => { keys.delete(e.key); if (e.key === ' ') pouring = false; };
  cv.style.touchAction = 'none'; cv.style.cursor = 'none';
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const stop = () => { stopped = true; window.removeEventListener('pointerup', pu); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  function end() {
    if (stopped) return;
    stop();
    res.score -= Math.round(res.spill / 4);
    done(res);
  }
  cv.__debug = { moulds, get ladleX() { return ladleX; } };

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (keys.has('ArrowLeft') || keys.has('a')) aimX -= 380 * dt;
    if (keys.has('ArrowRight') || keys.has('d')) aimX += 380 * dt;
    aimX = Math.max(30, Math.min(W - 30, aimX));
    ladleX += (aimX - ladleX) * Math.min(1, dt * 9);
    const sp = speedAt();
    beltX = (beltX + sp * dt) % 40;
    // pour
    if (pouring && metal > 0) {
      const n = 46 * dt;
      metal = Math.max(0, metal - n * 0.7);
      drops.push({ x: ladleX + 20 + (Math.random() - 0.5) * 4, y: LADLE_Y + 16, amt: n });
    } else if (!pouring) metal = Math.min(100, metal + 42 * dt);
    // falling iron
    for (const d of drops) d.y += FALL * dt;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      const m = moulds.find((m) => !m.done && d.x >= m.x + 4 && d.x <= m.x + MOULDS[m.type].w - 4);
      const top = m ? BELT_Y - MOULDS[m.type].h : BELT_Y - 4;
      if (d.y >= top) {
        if (m) { m.fill += d.amt; const over = m.fill - MOULDS[m.type].cap * 1.06; if (over > 0) { res.spill += Math.min(d.amt, over); m.fill = MOULDS[m.type].cap * 1.06; splats.push({ x: d.x + (Math.random() - 0.5) * 20, t: 3 }); } }
        else { res.spill += d.amt; splats.push({ x: d.x, t: 3 }); }
        drops.splice(i, 1);
      }
    }
    for (const s of splats) { s.t -= dt; s.x += sp * dt; }
    for (let i = splats.length - 1; i >= 0; i--) if (splats[i].t <= 0 || splats[i].x > W) splats.splice(i, 1);
    // the belt
    nextIn -= dt;
    if (nextIn <= 0 && t < SHIFT_S - 3) { spawn(); nextIn = (1.9 + Math.random() * 1.0) * (70 / sp); }
    for (const m of moulds) { m.x += sp * dt; if (!m.done && m.x > W - 70) { m.done = true; judge(m); } }
    for (let i = moulds.length - 1; i >= 0; i--) if (moulds[i].x > W + 10) moulds.splice(i, 1);
    for (const p of pops) p.t -= dt;
    if (t >= SHIFT_S && moulds.every((m) => m.done)) return end();
    if (t >= SHIFT_S + 8) return end();
    draw(sp);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#efe6cf', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function draw(sp) {
    // smoggy foundry
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1d15'); g.addColorStop(1, '#120c09');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(255,110,30,${0.05 + 0.03 * Math.sin(t * 2 + k)})`; c.beginPath(); c.arc(80 + k * 100, 130, 70, 0, 7); c.fill(); }
    // hymn
    const chorus = Math.floor(t / 10) % 4 === 3;
    txt(`FOUNDRY LINE 3 · ${Math.max(0, Math.ceil(SHIFT_S - t))}s · score ${res.score - Math.round(res.spill / 4)}`, 12, 18, 12, '#ff7a1f', 'left', true);
    txt(`♪ ${verse()}${chorus ? ' (CHORUS · faster)' : ''}`, 628, 18, 11, chorus ? '#ffd166' : 'rgba(230,220,196,0.6)', 'right', chorus);
    // overhead rail + ladle
    c.fillStyle = '#3a2f25'; c.fillRect(0, 34, W, 8);
    c.strokeStyle = '#555'; c.lineWidth = 2; c.beginPath(); c.moveTo(ladleX, 42); c.lineTo(ladleX, LADLE_Y - 14); c.stroke();
    c.save(); c.translate(ladleX, LADLE_Y); c.rotate(pouring && metal > 0 ? 0.5 : 0);
    c.fillStyle = '#4a3d33'; c.beginPath(); c.moveTo(-26, -14); c.lineTo(26, -14); c.lineTo(20, 16); c.lineTo(-20, 16); c.closePath(); c.fill();
    c.fillStyle = `rgba(255,${120 + Math.round(metal)},40,1)`; c.fillRect(-22, -12, 44 * (metal / 100), 6);
    c.restore();
    txt(`ladle ${Math.round(metal)}%`, ladleX, LADLE_Y + 34, 9, metal < 20 ? '#ff7a5c' : 'rgba(230,220,196,0.6)', 'center');
    // aim guide: where iron poured now will land (it falls straight)
    c.strokeStyle = 'rgba(255,160,60,0.18)'; c.setLineDash([4, 6]); c.beginPath(); c.moveTo(ladleX + 20, LADLE_Y + 16); c.lineTo(ladleX + 20, BELT_Y); c.stroke(); c.setLineDash([]);
    // falling iron
    for (const d of drops) { c.fillStyle = '#ffb347'; c.fillRect(d.x - 2.5, d.y - 6, 5, 12); c.fillStyle = 'rgba(255,220,120,0.6)'; c.fillRect(d.x - 1, d.y - 6, 2, 12); }
    // belt
    c.fillStyle = '#2b2520'; c.fillRect(0, BELT_Y, W, 30);
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let x = -40 + beltX; x < W; x += 40) { c.beginPath(); c.moveTo(x, BELT_Y); c.lineTo(x, BELT_Y + 30); c.stroke(); }
    for (const s of splats) { c.fillStyle = `rgba(255,${80 + s.t * 40},20,${Math.min(1, s.t)})`; c.beginPath(); c.ellipse(s.x, BELT_Y + 2, 7, 3, 0, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(W - 70, BELT_Y - 90, 70, 120);
    txt('INSPECT', W - 35, BELT_Y + 46, 9, 'rgba(230,220,196,0.5)', 'center', true);
    // moulds
    for (const m of moulds) {
      const M = MOULDS[m.type], x = m.x, y = BELT_Y - M.h;
      c.fillStyle = '#3d3a37'; c.fillRect(x, y, M.w, M.h);
      c.fillStyle = '#1a1816'; c.fillRect(x + 4, y + 4, M.w - 8, M.h - 6);
      const f = Math.min(1.06, m.fill / M.cap), ih = (M.h - 6) * Math.min(1, f);
      c.fillStyle = m.done ? '#7a5a40' : '#ff8a2a'; c.fillRect(x + 4, y + 4 + (M.h - 6) - ih, M.w - 8, ih);
      // the fill line band
      const lineY = y + 4 + (M.h - 6) * (1 - 0.82);
      c.strokeStyle = '#d6f08a'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x + 2, lineY); c.lineTo(x + M.w - 2, lineY); c.stroke(); c.setLineDash([]);
      if (M.bust) { c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.arc(x + M.w / 2, y + 22, 13, 0, 7); c.fill(); c.fillRect(x + M.w / 2 - 20, y + 36, 40, 24); }
      txt(M.label, x + M.w / 2, y - 6, 9, M.bust ? '#e8c547' : 'rgba(230,220,196,0.6)', 'center', true);
    }
    for (const p of pops) if (p.t > 0) { c.globalAlpha = Math.min(1, p.t * 2); txt(p.s, p.x, p.y - (1.1 - p.t) * 20, 13, p.col, 'center', true); }
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(0, BELT_Y + 34, W, H - BELT_Y - 34);
    txt('↔ drag here to move the ladle without pouring · hold above the belt to pour · lead the mould', W / 2, H - 16, 10, 'rgba(230,220,196,0.45)', 'center', false, W - 20);
  }

  return { stop };
}
