// The Non-Volunteer Volunteer Militia: Range 7. A first-person shooting gallery.
// Membership is voluntary and mandatory. Swear allegiance to one corporation's company, qualify
// (three stages of pop-up cutouts), and climb 13 ranks. Pays scrap for now; weekly fines come later.
import { T13 } from './economy.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, HORIZON = H * 0.34;
const MAG = 13, RELOAD_S = 1.3;
export const RANKS = [
  ['Conscript-Volunteer', 0], ['Volunteer, Second Class', 100], ['Volunteer, First Class', 250], ['Lance Volunteer', 450],
  ['Corporal of Enthusiasm', 700], ['Sergeant of Compliance', 1000], ['Staff Sergeant of Morale', 1400], ['Warrant Volunteer', 1900],
  ['Lieutenant (Unpaid)', 2500], ['Captain (Honorary)', 3200], ['Major (Voluntold)', 4000], ['Colonel of the Company', 5000], ['Commandant of Volunteering', 6500],
];
const GRADES = [['EXPERT', 0.85, 65], ['SHARPSHOOTER', 0.7, 39], ['MARKSMAN', 0.5, 26], ['UNQUALIFIED', -Infinity, 13]];
const HOSTILE = ['AGITATOR', 'LOITERER', 'UNLICENSED BREATHER', 'SCRAPPER INSURGENT', 'RATION HOARDER', 'UNION SYMPATHIZER?'];
const FRIENDLY = ['INSURED CIVILIAN', 'BUREAU CHEER OFFICER', 'ASSESSOR (ON DUTY)'];
// stages: [name, hostiles, friendlies, up-seconds, movers?]
const STAGES = [['STAGE 1 · STATIC', 8, 3, 2.4, false], ['STAGE 2 · MOVERS', 8, 3, 2.6, true], ['STAGE 3 · SNAP', 10, 4, 1.05, false]];

export function createMilitia({ world, econ, lore, log = () => {}, esc, openModal, closeModal, emit = () => {}, sprites = null, board = null }) {
  const S = econ.state;
  S.militia ||= { xp: 0, corp: null, last: 0, best: 0, quals: 0 };
  const M = S.militia;
  const corps = (lore?.organizations || []).filter((o) => o.type === 'corp');
  const blocks = world.spine.blocks || [];
  const b4 = blocks[3] || { x0: -10910, x1: -8050 };
  const RANGE = { x: (b4.x0 + b4.x1) / 2 - 500, y: 1500 };
  const PAD = { x: RANGE.x, y: RANGE.y - 150 };

  const rankOf = (xp = M.xp) => { let i = 0; RANKS.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (M.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const corpName = () => corps.find((c) => c.id === M.corp)?.name || 'no company';
  const week = () => { const d = new Date(); const j = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return `${d.getUTCFullYear()}-W${Math.ceil(((d - j) / 864e5 + j.getUTCDay() + 1) / 7)}`; };

  // ---------- world ----------
  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - RANGE.x) > 2600 || Math.abs(cam.y - RANGE.y) > 2600) return;
    const x0 = RANGE.x - 260, y0 = RANGE.y - 110;
    c.fillStyle = '#1a1c18'; c.fillRect(x0, y0, 520, 260);
    c.strokeStyle = '#5a6b3a'; c.lineWidth = 4; c.strokeRect(x0, y0, 520, 260);
    for (let i = 0; i < 7; i++) { // lanes
      const lx = x0 + 30 + i * 70;
      c.fillStyle = 'rgba(214,240,138,0.07)'; c.fillRect(lx, y0 + 40, 50, 200);
      c.fillStyle = i === 6 ? '#e8c547' : '#c9b48a'; c.fillRect(lx + 17, y0 + 205, 16, 26); // cutouts at the far end
    }
    c.fillStyle = '#5a6b3a'; c.fillRect(x0, y0, 520, 34);
    c.fillStyle = '#e6dcc4'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('NON-VOLUNTEER VOLUNTEER MILITIA · RANGE 7', RANGE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.7)';
    c.fillText('Membership is voluntary. Attendance is mandatory.', RANGE.x, y0 + 275);
    const n = near;
    c.strokeStyle = n ? '#e8c547' : 'rgba(214,240,138,0.45)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, n ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = n ? '#e8c547' : 'rgba(214,240,138,0.8)'; c.font = 'bold 12px monospace';
    c.fillText(n ? 'E' : 'QUALIFY', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#9fbf5a'; m.fillRect(tx(RANGE.x) - 3, ty(RANGE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = (at) => [{ id: 'militia', type: 'race', title: 'Militia qualification · Range 7', sub: `${RANKS[rankOf()][0]}${M.corp ? ` · ${corpName()}` : ' · swear allegiance first'} · ${left() ? `paid again in ${fmt(left())}` : 'paid run ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Militia Range 7' } }];

  // ---------- the lobby ----------
  function open() {
    if (!M.corp) return openOath();
    const r = rankOf(), nx = RANKS[r + 1];
    const thisWeek = M.week === week();
    openModal(
      `<h2>RANGE 7 · ${esc(corpName().toUpperCase())} COMPANY</h2>
       <div class="sub">Non-Volunteer Volunteer Militia · “Membership is voluntary and mandatory.”</div>
       <div class="explain"><b>${esc(RANKS[r][0])}</b> · ${M.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ' · top of the company'}<br/>
         This week's qualification: ${thisWeek ? '<b style="color:#d6f08a">done</b>' : '<b style="color:#ff7a5c">outstanding</b> <span class="sub">(absences will be invoiced, eventually)</span>'}<br/>
         Best score: ${M.best || 0} · qualifications: ${M.quals || 0}</div>
       <div class="explain"><b>Three stages.</b> Shoot the hostiles. Do <b>not</b> shoot insured civilians, Bureau staff, Assessors or the dog. Heads score more.
         ${MAG}-round magazine: <b>R</b> or the RELOAD box to reload. Your aim sways; it gets worse when you spray.<br/>
         <span class="sub">PC: aim with the mouse, click to fire. Phone: tap where you want the round to go.</span></div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Qualify (13–65 scrap)'}</button><button id="x">Dismissed</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function openOath() {
    openModal(
      `<h2>THE MILITIA OATH</h2>
       <div class="sub">Choose the corporation whose company you volunteer for. You volunteer either way.</div>
       <div class="explain">Every resident is a volunteer; every volunteer qualifies weekly; every absence is invoiced. Changing sides comes later (probably a 13-day cooldown and a fine).</div>
       <table>${corps.map((c) => `<tr class="click" data-c="${esc(c.id)}"><td style="width:10px;background:${esc(c.color || '#888')}"></td><td style="width:30px"><img src="assets/sprites/logo_${esc(c.id)}.png" width="26" height="26" alt="" onerror="this.remove()"/></td><td><b>${esc(c.name)}</b><div class="sub"><i>“${esc(c.motto)}”</i></div></td></tr>`).join('')}</table>
       <div class="buttons"><button id="x">Not today (it's mandatory)</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelectorAll('[data-c]').forEach((tr) => tr.addEventListener('click', () => {
          M.corp = tr.dataset.c; econ.save();
          log(`You swore allegiance to the <b>${esc(corpName())}</b> company of the Non-Volunteer Volunteer Militia. Voluntarily.`);
          emit('militia-oath', { corp: M.corp });
          open();
        }));
      }
    );
  }

  // ---------- the gallery ----------
  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="mil" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Cease fire (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#mil');
        const dpr = Math.min(3, Math.max(1, (cv.getBoundingClientRect().width / W) * (window.devicePixelRatio || 1))); // crisp at any size
        cv.width = W * dpr; cv.height = H * dpr;
        const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const game = gallery(c, cv, (res) => finish(res, paid));
        el.querySelector('#quit').addEventListener('click', () => { game.stop(); open(); });
      }
    );
  }

  function finish(res, paid) {
    const pct = res.max ? Math.max(0, res.score) / res.max : 0;
    const [grade, , payout] = GRADES.find(([, t]) => pct >= t);
    const before = rankOf();
    let pay = 0;
    if (paid) {
      pay = econ.reward(payout).amount;
      M.last = Date.now();
      M.xp += Math.max(0, res.score);
      M.week = week();
      M.quals = (M.quals || 0) + 1;
    }
    M.best = Math.max(M.best || 0, res.score);
    econ.save();
    const after = rankOf();
    if (paid) log(`Range 7: <b>${grade}</b>, ${res.score} points. +${pay} scrap, +${Math.max(0, res.score)} merit.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(RANKS[after][0])}</b>, ${esc(corpName())} company. Your enthusiasm has been noted.`, 'money');
    emit('militia', { grade, score: res.score, pct, paid, rank: after, friendly: res.friendly, wilco: res.wilco, hits: res.hits, shots: res.shots });
    if (res.wilco) emit('shot-wilco', {});
    openModal(
      `<h2>${grade}</h2>
       <div class="sub">Range 7 · ${esc(corpName())} company</div>
       <div class="explain" style="font-size:14px">Score <b>${res.score}</b> of ${res.max} (${Math.round(pct * 100)}%) · accuracy ${res.shots ? Math.round((res.hits / res.shots) * 100) : 0}% (${res.hits}/${res.shots})<br/>
       Hostiles down: ${res.down}/${res.hostiles} · heads: ${res.heads}${res.friendly ? ` · <b style="color:#ff7a5c">friendlies hit: ${res.friendly}</b>` : ''}${res.wilco ? ' · <b style="color:#ff7a5c">YOU SHOT THE DOG.</b>' : ''}<br/>
       ${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit · ${esc(RANKS[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${board ? `<br/>${board.line('militia')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="lobby">Range desk</button><button id="x">Dismissed</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('militia'));
        el.querySelector('#lobby').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, rank: () => RANKS[rankOf()][0] };
}

// ---------- gallery engine ----------
function gallery(c, cv, done) {
  const P = (z) => ({ y: HORIZON + (H - 70 - HORIZON) * z, s: 0.32 + 0.68 * z }); // z: 0 far, 1 near
  const laneX = (u, z) => W / 2 + (u - 0.5) * (W * 0.3 + W * 0.7 * z);
  let stage = -1, stageT = 0, banner = 0, queue = [], live = [], spawnIn = 0;
  let mag = MAG, reloading = 0, sway = 0, kick = 0, flash = 0, t = 0, stopped = false;
  const aim = { x: W / 2, y: H / 2 };
  const res = { score: 0, max: 0, shots: 0, hits: 0, heads: 0, down: 0, hostiles: 0, friendly: 0, wilco: false };
  const holes = [], pops = [];
  STAGES.forEach(([, h]) => { res.hostiles += h; res.max += h * 25; });

  function nextStage() {
    stage++; banner = 1.6; stageT = 0; live = [];
    if (stage >= STAGES.length) return;
    const [, nh, nf, , movers] = STAGES[stage];
    queue = [];
    for (let i = 0; i < nh; i++) queue.push({ hostile: true, label: HOSTILE[Math.floor(Math.random() * HOSTILE.length)] });
    for (let i = 0; i < nf; i++) queue.push({ hostile: false, label: FRIENDLY[Math.floor(Math.random() * FRIENDLY.length)] });
    if (stage === 2) queue.push({ hostile: false, wilco: true, label: 'WILCO' });
    queue.sort(() => Math.random() - 0.5);
    queue.forEach((q) => { q.mover = movers && Math.random() < 0.8; });
    spawnIn = 0.6;
  }
  nextStage();

  function spawn() {
    const q = queue.shift();
    const [, , , up] = STAGES[stage];
    const z = 0.15 + Math.random() * 0.75;
    live.push({ ...q, u: 0.12 + Math.random() * 0.76, z, rise: 0, up: up * (0.85 + Math.random() * 0.3), state: 'rise', vu: q.mover ? (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.12) : 0, hit: false });
  }

  // geometry of a cutout on screen
  function shape(o) {
    const { y, s } = P(o.z);
    const x = laneX(o.u, o.z);
    const k = s * 1.45, h = (o.wilco ? 70 : 120) * k * o.rise, w = (o.wilco ? 110 : 54) * k;
    return { x, base: y, w, h, k, headR: o.wilco ? 0 : 15 * k, headY: y - h + 15 * k * o.rise };
  }

  function shoot(px, py) {
    if (stopped || banner > 0.4 || stage >= STAGES.length) return;
    if (reloading > 0) return;
    if (mag <= 0) { reloading = RELOAD_S; return; }
    mag--; res.shots++; flash = 0.06;
    const sx = Math.sin(t * 1.7) * (6 + sway * 22) + Math.sin(t * 4.3) * (2 + sway * 6);
    const sy = Math.cos(t * 1.3) * (5 + sway * 18) - kick * 26;
    const hx = px + sx, hy = py + sy;
    sway = Math.min(1, sway + 0.22); kick = Math.min(1, kick + 0.5);
    // nearest (largest z) cutout under the shot
    const order = [...live].filter((o) => !o.hit && o.rise > 0.6).sort((a, b) => b.z - a.z);
    for (const o of order) {
      const g = shape(o);
      const inHead = g.headR && Math.hypot(hx - g.x, hy - g.headY) < g.headR;
      const inBody = Math.abs(hx - g.x) < g.w / 2 && hy < g.base && hy > g.base - g.h + (g.headR ? g.headR * 2 : 0);
      if (!inHead && !inBody) continue;
      o.hit = true; o.state = 'fall'; res.hits++;
      if (o.hostile) {
        const pts = inHead ? 25 : 10;
        res.score += pts; res.down++; if (inHead) res.heads++;
        pops.push({ x: hx, y: hy - 10, s: `+${pts}${inHead ? ' HEAD' : ''}`, c: '#d6f08a', t: 0.8 });
      } else if (o.wilco) {
        res.score -= 100; res.wilco = true; res.friendly++;
        pops.push({ x: hx, y: hy - 10, s: '−100 THE DOG?!', c: '#ff3b1f', t: 1.4 });
      } else {
        res.score -= 30; res.friendly++;
        pops.push({ x: hx, y: hy - 10, s: '−30 INSURED', c: '#ff7a5c', t: 1 });
      }
      holes.push({ o, dx: hx - g.x, dy: hy - g.base });
      return;
    }
    holes.push({ x: hx, y: hy, wall: true, t: 4 });
  }

  // input
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const inReload = (p) => p.x > W - 130 && p.y > H - 58;
  const pd = (e) => {
    e.preventDefault();
    const p = pos(e);
    if (inReload(p)) { if (mag < MAG && !reloading) reloading = RELOAD_S; return; }
    aim.x = p.x; aim.y = p.y; shoot(p.x, p.y);
  };
  const pm = (e) => { if (e.pointerType === 'mouse') { const p = pos(e); aim.x = p.x; aim.y = p.y; } };
  const kd = (e) => {
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (mag < MAG && !reloading) reloading = RELOAD_S; }
    if (e.key === ' ') { e.preventDefault(); shoot(aim.x, aim.y); }
  };
  cv.style.touchAction = 'none'; cv.style.cursor = 'none';
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm);
  window.addEventListener('keydown', kd);
  const stop = () => { stopped = true; window.removeEventListener('keydown', kd); };

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    update(dt); draw();
    if (stage >= STAGES.length && banner <= 0) { stop(); return done(res); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function update(dt) {
    sway = Math.max(0, sway - dt * 0.45); kick = Math.max(0, kick - dt * 3.5); flash = Math.max(0, flash - dt);
    for (const p of pops) p.t -= dt;
    for (const h of holes) if (h.wall) h.t -= dt;
    if (reloading > 0) { reloading -= dt; if (reloading <= 0) { reloading = 0; mag = MAG; } }
    if (banner > 0) { banner -= dt; return; }
    if (stage >= STAGES.length) return;
    stageT += dt;
    spawnIn -= dt;
    const maxLive = stage === 2 ? 3 : 2;
    if (spawnIn <= 0 && queue.length && live.filter((o) => o.state !== 'gone').length < maxLive) { spawn(); spawnIn = stage === 2 ? 0.45 : 0.75; }
    for (const o of live) {
      if (o.state === 'rise') { o.rise = Math.min(1, o.rise + dt * 6); if (o.rise >= 1) o.state = 'up'; }
      else if (o.state === 'up') { o.up -= dt; o.u += o.vu * dt; if (o.u < 0.06 || o.u > 0.94) o.vu *= -1; if (o.up <= 0) o.state = 'fall'; }
      else if (o.state === 'fall') { o.rise = Math.max(0, o.rise - dt * (o.hit ? 3 : 5)); if (o.rise <= 0) o.state = 'gone'; }
    }
    live = live.filter((o) => o.state !== 'gone');
    if (!queue.length && !live.length) nextStage();
  }

  // ---------- drawing ----------
  function draw() {
    // back wall + floor
    const g = c.createLinearGradient(0, 0, 0, HORIZON);
    g.addColorStop(0, '#0d0f0c'); g.addColorStop(1, '#262b20');
    c.fillStyle = g; c.fillRect(0, 0, W, HORIZON);
    c.fillStyle = '#5a6b3a'; c.fillRect(0, HORIZON - 14, W, 6);
    c.fillStyle = 'rgba(230,220,196,0.35)'; c.font = 'bold 12px monospace'; c.textAlign = 'center';
    c.fillText('RANGE 7 · VOLUNTEERS FIRE AT WILL · WILL IS MANDATORY', W / 2, HORIZON - 24);
    for (let i = 0; i < 5; i++) { const lx = W * (0.1 + i * 0.2); c.fillStyle = `rgba(255,230,160,${0.08 + 0.04 * Math.sin(t * 3 + i)})`; c.beginPath(); c.moveTo(lx - 6, 0); c.lineTo(lx + 6, 0); c.lineTo(lx + 60, HORIZON); c.lineTo(lx - 60, HORIZON); c.fill(); }
    const fg = c.createLinearGradient(0, HORIZON, 0, H);
    fg.addColorStop(0, '#1c1a14'); fg.addColorStop(1, '#3a3020');
    c.fillStyle = fg; c.fillRect(0, HORIZON, W, H - HORIZON);
    c.strokeStyle = 'rgba(232,197,71,0.16)'; c.lineWidth = 1;
    for (let i = 0; i <= 8; i++) { const u = i / 8; c.beginPath(); c.moveTo(laneX(u, 0), HORIZON); c.lineTo(laneX(u, 1.25), H); c.stroke(); }
    for (let z = 0.1; z < 1.2; z += 0.18) { const y = P(z).y; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    // wall holes
    for (const h of holes) if (h.wall && h.t > 0) { c.fillStyle = `rgba(0,0,0,${Math.min(0.8, h.t)})`; c.beginPath(); c.arc(h.x, h.y, 2.5, 0, 7); c.fill(); }
    // cutouts far → near
    for (const o of [...live].sort((a, b) => a.z - b.z)) drawCutout(o);
    // counter (sandbags)
    c.fillStyle = '#4a4232'; c.fillRect(0, H - 46, W, 46);
    for (let x = -20; x < W; x += 52) { c.fillStyle = '#6b5f45'; c.beginPath(); c.ellipse(x + 26, H - 44, 28, 12, 0, 0, 7); c.fill(); }
    // rifle (points at the aim)
    const gx = W * 0.66, gy = H + 10, ang = Math.atan2(aim.y - gy, aim.x - gx);
    c.save(); c.translate(gx, gy + kick * 10); c.rotate(ang);
    c.fillStyle = '#16181a'; c.fillRect(0, -9, 150, 18); c.fillStyle = '#2b2f33'; c.fillRect(110, -5, 70, 10); c.fillStyle = '#3d2f22'; c.fillRect(-40, -12, 60, 24);
    if (flash) { c.fillStyle = '#ffd166'; c.beginPath(); c.moveTo(182, 0); c.lineTo(214, -12); c.lineTo(206, 0); c.lineTo(214, 12); c.fill(); }
    c.restore();
    // pops
    for (const p of pops) if (p.t > 0) { c.globalAlpha = Math.min(1, p.t * 2); c.fillStyle = p.c; c.font = 'bold 14px monospace'; c.textAlign = 'center'; c.fillText(p.s, p.x, p.y - (1 - p.t) * 20); c.globalAlpha = 1; }
    // crosshair (with sway)
    const sx = Math.sin(t * 1.7) * (6 + sway * 22) + Math.sin(t * 4.3) * (2 + sway * 6), sy = Math.cos(t * 1.3) * (5 + sway * 18) - kick * 26;
    const cx = aim.x + sx, cy = aim.y + sy;
    c.strokeStyle = reloading ? 'rgba(255,122,92,0.8)' : '#d6f08a'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, 12, 0, 7); c.moveTo(cx - 20, cy); c.lineTo(cx - 6, cy); c.moveTo(cx + 6, cy); c.lineTo(cx + 20, cy); c.moveTo(cx, cy - 20); c.lineTo(cx, cy - 6); c.moveTo(cx, cy + 6); c.lineTo(cx, cy + 20); c.stroke();
    // HUD
    c.textAlign = 'left'; c.font = 'bold 13px monospace'; c.fillStyle = '#e8c547';
    c.fillText(`SCORE ${res.score}`, 10, 20);
    c.fillStyle = 'rgba(230,220,196,0.7)'; c.font = '11px monospace';
    c.fillText(`${STAGES[Math.min(stage, STAGES.length - 1)][0]} · ${queue.length + live.length} left`, 10, 36);
    for (let i = 0; i < MAG; i++) { c.fillStyle = i < mag ? '#e8c547' : '#3a3a3a'; c.fillRect(10 + i * 9, H - 30, 6, 16); }
    c.fillStyle = reloading ? '#ff7a5c' : mag ? 'rgba(230,220,196,0.12)' : 'rgba(255,122,92,0.35)';
    c.fillRect(W - 128, H - 56, 120, 48);
    c.strokeStyle = '#e8c547'; c.strokeRect(W - 128, H - 56, 120, 48);
    c.fillStyle = '#efe6cf'; c.textAlign = 'center'; c.font = 'bold 13px monospace';
    c.fillText(reloading ? 'RELOADING…' : mag ? 'RELOAD (R)' : 'EMPTY · RELOAD', W - 68, H - 27);
    if (banner > 0) {
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, H / 2 - 40, W, 70);
      c.fillStyle = '#e8c547'; c.font = 'bold 26px monospace'; c.textAlign = 'center';
      c.fillText(stage < STAGES.length ? STAGES[stage][0] : 'CEASE FIRE', W / 2, H / 2 + 4);
      c.font = '12px monospace'; c.fillStyle = 'rgba(230,220,196,0.8)';
      c.fillText(stage === 2 ? 'Fast pop-ups. Mind the dog.' : stage === 1 ? 'They move. So should you.' : stage < STAGES.length ? 'Hostiles only. Heads score more.' : 'Report to the range desk.', W / 2, H / 2 + 22);
    }
  }

  function drawCutout(o) {
    if (o.rise <= 0) return;
    const gg = shape(o);
    const { x, base, w, h, k } = gg;
    c.save();
    // post
    c.fillStyle = '#2b2620'; c.fillRect(x - 3 * k, base - 6 * k, 6 * k, 10 * k);
    if (o.wilco) {
      c.fillStyle = '#7a5230';
      c.beginPath(); c.ellipse(x, base - h * 0.45, w * 0.42, h * 0.32, 0, 0, 7); c.fill(); // body
      c.beginPath(); c.ellipse(x + w * 0.42, base - h * 0.8, w * 0.17, h * 0.2, 0, 0, 7); c.fill(); // head
      c.fillRect(x - w * 0.32, base - h * 0.25, 8 * k, h * 0.25); c.fillRect(x + w * 0.22, base - h * 0.25, 8 * k, h * 0.25); // legs
      c.beginPath(); c.moveTo(x - w * 0.4, base - h * 0.55); c.lineTo(x - w * 0.55, base - h * 0.85); c.lineWidth = 5 * k; c.strokeStyle = '#7a5230'; c.stroke(); // tail
      c.fillStyle = '#1d2a36'; c.fillRect(x - w * 0.2, base - h * 0.62, w * 0.36, h * 0.24); // vest
      c.fillStyle = '#efe6cf'; c.font = `bold ${Math.max(7, 10 * k)}px monospace`; c.textAlign = 'center';
      c.fillText('WILCO', x - w * 0.02, base - h * 0.46);
    } else {
      const top = base - h, hr = gg.headR;
      c.fillStyle = o.hostile ? '#c9b48a' : '#b9c6cf';
      c.beginPath(); c.arc(x, top + hr * o.rise, hr * o.rise, 0, 7); c.fill(); // head
      c.beginPath(); // shoulders + torso
      c.moveTo(x - w / 2, base); c.lineTo(x - w / 2, top + hr * 2.6); c.quadraticCurveTo(x - w / 2, top + hr * 2.05, x - w * 0.2, top + hr * 2.05);
      c.lineTo(x + w * 0.2, top + hr * 2.05); c.quadraticCurveTo(x + w / 2, top + hr * 2.05, x + w / 2, top + hr * 2.6); c.lineTo(x + w / 2, base); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.5; c.stroke();
      if (o.hostile) {
        c.strokeStyle = 'rgba(120,20,10,0.75)'; c.lineWidth = 1.2;
        for (const r of [0.34, 0.22, 0.1]) { c.beginPath(); c.arc(x, base - h * 0.42, w * r, 0, 7); c.stroke(); }
        c.fillStyle = '#b3261e'; c.fillRect(x - w / 2, top + hr * 3, w * 0.22, 6 * k); // armband
      } else {
        c.fillStyle = '#2f6db0'; c.fillRect(x - w / 2, base - h * 0.5, w, 12 * k);
        c.fillStyle = '#fff'; c.font = `bold ${Math.max(6, 8 * k)}px monospace`; c.textAlign = 'center';
        c.fillText('NO SHOOT', x, base - h * 0.5 + 9 * k);
      }
      c.fillStyle = 'rgba(20,18,14,0.85)'; c.font = `bold ${Math.max(6, 7.5 * k)}px monospace`; c.textAlign = 'center';
      if (o.rise > 0.9) c.fillText(o.label, x, base - 8 * k, w * 1.6);
    }
    // holes in this cutout
    for (const hl of holes) if (hl.o === o) { c.fillStyle = '#111'; c.beginPath(); c.arc(x + hl.dx, base + hl.dy * o.rise, 2.5, 0, 7); c.fill(); }
    c.restore();
  }

  return { stop };
}
