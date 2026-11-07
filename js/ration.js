// Gullet Provisions · Ration Counter 6. Three customers at the counter, each with an order.
// Tap the bins to load a tray, tap a customer to serve it. Right tray: paid, plus a tip for speed.
// Wrong tray: a complaint. Too slow: they walk out (to the Sprawl, to eat what, exactly?).
// Members want Real Bread from the members' oven, which takes its time. "Calories are a privilege."
import { T13 } from './economy.js';
import { makePerson } from './people.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 80;
export const COOK_GRADES = [
  ['Tray Hand', 0], ['Brick Stacker', 100], ['Paste Pourer', 250], ['Counter Clerk', 450], ['Line Cook', 700], ['Senior Line Cook', 1000],
  ['Vat Captain', 1400], ['Sous-Chef of Sustenance', 1900], ['Head of Rations', 2500], ['Maître d’ (Members Only)', 3200],
  ['Chef de Cuisine (Protein)', 4000], ['Gastronome of the Gullet', 5000], ['The Mouth That Feeds', 6500],
];
// bins: id, label, colour, shape
const ITEMS = [
  { id: 'orig', label: 'ORIGINAL', sub: 'brick', c: '#8a8a80', s: 'brick' },
  { id: 'plus', label: 'ORIG. PLUS', sub: 'brick', c: '#b3a25a', s: 'brick' },
  { id: 'thu', label: 'THURSDAY', sub: 'brick (?)', c: '#7a4a6a', s: 'brick' },
  { id: 'paste', label: 'PASTE', sub: 'vat 3', c: '#7fb05a', s: 'blob' },
  { id: 'broth', label: 'BROTH', sub: 'recycled', c: '#8a5a32', s: 'cup' },
  { id: 'bread', label: 'REAL BREAD', sub: 'members', c: '#e0b878', s: 'loaf' },
];
const BY = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
const COMPLAINTS = ['This is Thursday. It\'s Tuesday.', 'I ordered paste. This is… paste-adjacent.', 'I\'m telling the Ministry.', 'Wrong tray. My debt is going up for THIS?', 'Is this a joke? Is the joke me?'];
const THANKS = ['Calories! Thank you!', 'Bless the vats.', 'Original Plus. Living large.', 'Same as yesterday. Perfect.', 'It\'s warm! Is it supposed to be warm?'];

export function createRation({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const ST = econ.state;
  ST.ration ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const R = ST.ration;
  const blocks = world.spine.blocks || [];
  const b6 = blocks[5] || { x0: -5190, x1: -2330 };
  const SITE = { x: (b6.x0 + b6.x1) / 2 - 300, y: 1550 };
  const PAD = { x: SITE.x, y: SITE.y - 160 };
  const gradeOf = (xp = R.xp) => { let i = 0; COOK_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (R.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 110;
    c.fillStyle = '#1c160d'; c.fillRect(x0, y0, 480, 240);
    c.strokeStyle = '#8c6d2f'; c.lineWidth = 4; c.strokeRect(x0, y0, 480, 240);
    for (let i = 0; i < 3; i++) { c.fillStyle = '#3a3a34'; c.beginPath(); c.arc(x0 + 90 + i * 150, y0 + 90, 38, 0, 7); c.fill(); c.fillStyle = ['#7fb05a', '#8a5a32', '#7a4a6a'][i]; c.beginPath(); c.arc(x0 + 90 + i * 150, y0 + 90, 30 + Math.sin(time / 500 + i) * 2, 0, 7); c.fill(); } // vats
    c.fillStyle = '#5a4528'; c.fillRect(x0 + 20, y0 + 150, 440, 18); // the counter
    for (let i = 0; i < 9; i++) { c.fillStyle = '#6b6457'; c.beginPath(); c.arc(x0 + 40 + i * 50, y0 + 196 + Math.sin(time / 500 + i) * 2, 10, 0, 7); c.fill(); } // the queue
    c.fillStyle = '#8c6d2f'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#0b0c0e'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('GULLET PROVISIONS · RATION COUNTER 6', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.7)';
    c.fillText('Calories are a privilege.', SITE.x, y0 + 256);
    c.strokeStyle = near ? '#e8c547' : 'rgba(140,109,47,0.9)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#c9a227'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'SERVE', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#8c6d2f'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'ration', type: 'freight', title: 'Ration Counter 6 · feed the line', sub: `${COOK_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Gullet Ration Counter 6' } }];

  function open() {
    const g = gradeOf(), nx = COOK_GRADES[g + 1];
    openModal(
      `<h2>RATION COUNTER 6</h2>
       <div class="sub">Gullet Provisions · “Calories are a privilege.”</div>
       <div class="explain"><b>${esc(COOK_GRADES[g][0])}</b> · ${R.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${R.best || 0} · shifts ${R.shifts || 0}</div>
       <div class="explain">Three customers at the counter, each with an order. <b>Tap the bins</b> to load the tray, then <b>tap the customer</b> to serve it (any order on the tray is fine).
         Right tray: paid by size, plus a tip if you're quick. Wrong tray: −5 and a complaint. Let the patience bar run out and they walk out (−8).
         <b>⭐ Members</b> want <b>Real Bread</b> from the members' oven, which needs a few seconds between loaves. Bricks come in three flavours: Original, Original Plus and Thursday (nobody knows what's in Thursday). ${SHIFT_S} seconds.<br/>
         <span class="sub">Keys: 1–6 bins · A / S / D serve · X bins the tray.</span></div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Open the counter (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="ration" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Close the shutter (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#ration');
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
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 2.8)))).amount : 0;
    if (paid) { R.last = Date.now(); R.xp += Math.max(0, res.score); R.shifts = (R.shifts || 0) + 1; }
    R.best = Math.max(R.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Ration Counter 6: ${res.served} served, ${res.walked} walked out, ${res.score} points. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(COOK_GRADES[after][0])}</b>, Gullet Provisions. Calories are a privilege; so is this.`, 'money');
    emit('ration', { score: res.score, served: res.served, wrong: res.wrong, walked: res.walked, members: res.members, paid, grade: after, perfect: res.served >= 10 && !res.wrong && !res.walked });
    openModal(
      `<h2>SHUTTER DOWN</h2>
       <div class="sub">Ration Counter 6 · ${esc(COOK_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         <tr><td>Trays served (${res.served})</td><td style="text-align:right;color:#d6f08a">+${res.base}</td></tr>
         <tr><td>Tips for speed</td><td style="text-align:right;color:#d6f08a">+${res.tips}</td></tr>
         ${res.members ? `<tr><td>⭐ Members served (${res.members})</td><td style="text-align:right;color:#d6f08a">+${res.members * 15}</td></tr>` : ''}
         ${res.wrong ? `<tr><td>Complaints (${res.wrong})</td><td style="text-align:right;color:#ff7a5c">−${res.wrong * 5}</td></tr>` : ''}
         ${res.walked ? `<tr><td>Walked out (${res.walked})</td><td style="text-align:right;color:#ff7a5c">−${res.walked * 8}</td></tr>` : ''}
         <tr><td><b>Total</b></td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       <br/><span class="sub">Every ration served has been recorded as a debt, as a gesture.</span>
       ${board ? `<br/>${board.line('ration')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Counter office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('ration'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => COOK_GRADES[gradeOf()][0] };
}

// ---------- the counter ----------
function shift(c, cv, grade, done) {
  const slots = [null, null, null];
  const tray = [];
  let t = 0, stopped = false, nextIn = 0.6, oven = 0;
  const res = { score: 0, base: 0, tips: 0, served: 0, wrong: 0, walked: 0, members: 0 };
  const pops = [];
  const SLOT_W = 200, SLOT_X = (i) => 20 + i * 205;
  const BIN_W = 100, BIN_X = (i) => 14 + i * 103, BIN_Y = 300;
  const TRASH = { x: 470, y: 222, w: 150, h: 44 };

  function customer() {
    const member = Math.random() < 0.14 + grade * 0.008;
    const p = makePerson(member ? ['vanta', 'ministry', 'gavel', 'assessor'][Math.floor(Math.random() * 4)] : ['sprawl', 'sprawl', 'kessler', 'lastmile', 'ashiron', 'cinder', 'mercy'][Math.floor(Math.random() * 7)]);
    const n = Math.min(4, 1 + Math.floor(Math.random() * (2 + Math.min(2, Math.floor(t / 25) + (grade > 5 ? 1 : 0)))));
    const pool = ITEMS.filter((i) => i.id !== 'bread');
    const order = Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)].id);
    if (member) order[0] = 'bread';
    const patience = Math.max(9, 17 - grade * 0.4 - t * 0.04) + n * 2;
    return { name: p.name.split(' ')[0], faction: p.faction, member, order, patience, left: patience, hue: Math.floor(Math.random() * 360), say: null, sayT: 0, leaving: 0 };
  }
  const sameTray = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

  function add(id) {
    if (stopped) return;
    if (tray.length >= 4) return pop(320, 214, 'Tray full', '#ffb347');
    if (id === 'bread') { if (oven > 0) return pop(BIN_X(5) + 50, BIN_Y - 6, 'Oven’s busy', '#ffb347'); oven = 3.2; }
    tray.push(id);
  }
  function serve(i) {
    const cu = slots[i];
    if (!cu || cu.leaving || !tray.length) return;
    if (sameTray(tray, cu.order)) {
      const base = cu.order.length * 6, tip = Math.round((cu.left / cu.patience) * 10);
      res.base += base; res.tips += tip; res.served++; res.score += base + tip;
      if (cu.member) { res.members++; res.score += 15; }
      cu.say = THANKS[Math.floor(Math.random() * THANKS.length)]; cu.sayT = 1.2; cu.leaving = 1.2; cu.happy = true;
      pop(SLOT_X(i) + SLOT_W / 2, 60, `+${base + tip + (cu.member ? 15 : 0)}`, '#d6f08a');
    } else {
      res.wrong++; res.score -= 5;
      cu.say = COMPLAINTS[Math.floor(Math.random() * COMPLAINTS.length)]; cu.sayT = 1.6;
      cu.left = Math.max(0, cu.left - 3);
      pop(SLOT_X(i) + SLOT_W / 2, 60, '−5 complaint', '#ff7a5c');
    }
    tray.length = 0;
  }
  const pop = (x, y, s, col) => pops.push({ x, y, s, col, t: 1.1 });

  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pd = (e) => {
    e.preventDefault();
    const p = pos(e);
    if (p.y >= BIN_Y) { const i = Math.floor((p.x - 14) / 103); if (i >= 0 && i < ITEMS.length) add(ITEMS[i].id); return; }
    if (p.x >= TRASH.x && p.x <= TRASH.x + TRASH.w && p.y >= TRASH.y && p.y <= TRASH.y + TRASH.h) { tray.length = 0; return; }
    if (p.y < 200) { const i = Math.floor((p.x - 20) / 205); if (i >= 0 && i < 3) serve(i); }
  };
  const kd = (e) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) { e.preventDefault(); add(ITEMS[n - 1].id); }
    const s = { a: 0, s: 1, d: 2 }[e.key];
    if (s != null) { e.preventDefault(); serve(s); }
    if (e.key === 'x' || e.key === 'Backspace') { e.preventDefault(); tray.length = 0; }
  };
  cv.style.touchAction = 'none';
  cv.__debug = { slots, tray }; // for tests
  cv.addEventListener('pointerdown', pd); window.addEventListener('keydown', kd);
  const stop = () => { stopped = true; window.removeEventListener('keydown', kd); };
  function end() { if (stopped) return; stop(); done(res); }

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    oven = Math.max(0, oven - dt);
    for (const p of pops) p.t -= dt;
    nextIn -= dt;
    if (nextIn <= 0 && t < SHIFT_S - 4) {
      const free = slots.findIndex((s) => !s);
      if (free >= 0) { slots[free] = customer(); nextIn = Math.max(1.4, 4.2 - t * 0.03 - grade * 0.08) * (0.7 + Math.random() * 0.6); }
      else nextIn = 0.5;
    }
    slots.forEach((cu, i) => {
      if (!cu) return;
      cu.sayT = Math.max(0, cu.sayT - dt);
      if (cu.leaving) { cu.leaving -= dt; if (cu.leaving <= 0) slots[i] = null; return; }
      cu.left -= dt * (cu.member ? 1.15 : 1);
      if (cu.left <= 0) { res.walked++; res.score -= 8; cu.say = cu.member ? 'I\'ll eat at the club.' : 'Forget it. I\'ll eat scrap.'; cu.sayT = 1.2; cu.leaving = 1.2; pop(SLOT_X(i) + SLOT_W / 2, 60, '−8 walked out', '#ff7a5c'); }
    });
    if (t >= SHIFT_S && slots.every((s) => !s || s.leaving)) return end();
    if (t >= SHIFT_S + 5) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#efe6cf', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function item(id, x, y, sz = 1) {
    const it = BY[id];
    c.fillStyle = it.c;
    if (it.s === 'brick') { c.fillRect(x - 13 * sz, y - 8 * sz, 26 * sz, 16 * sz); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.strokeRect(x - 13 * sz, y - 8 * sz, 26 * sz, 16 * sz); if (id === 'thu') { c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = `bold ${Math.round(10 * sz)}px monospace`; c.textAlign = 'center'; c.fillText('?', x, y + 4 * sz); } if (id === 'plus') { c.fillStyle = '#fff'; c.font = `bold ${Math.round(11 * sz)}px monospace`; c.textAlign = 'center'; c.fillText('+', x, y + 4 * sz); } }
    else if (it.s === 'blob') { c.beginPath(); c.ellipse(x, y, 13 * sz, 9 * sz, 0, 0, 7); c.fill(); }
    else if (it.s === 'cup') { c.fillRect(x - 9 * sz, y - 9 * sz, 18 * sz, 18 * sz); c.fillStyle = '#c98a4a'; c.fillRect(x - 9 * sz, y - 9 * sz, 18 * sz, 4 * sz); }
    else { c.beginPath(); c.ellipse(x, y, 15 * sz, 9 * sz, 0, 0, 7); c.fill(); c.strokeStyle = '#a07040'; c.lineWidth = 1.5; for (const d of [-6, 0, 6]) { c.beginPath(); c.moveTo(x + d * sz - 3, y - 5 * sz); c.lineTo(x + d * sz + 3, y + 1 * sz); c.stroke(); } }
  }

  function draw() {
    c.fillStyle = '#16110a'; c.fillRect(0, 0, W, H);
    txt(`RATION COUNTER 6 · ${Math.max(0, Math.ceil(SHIFT_S - t))}s`, 14, 18, 12, '#c9a227', 'left', true);
    txt(`served ${res.served} · score ${res.score}`, 626, 18, 11, 'rgba(230,220,196,0.8)', 'right');
    // customers
    slots.forEach((cu, i) => {
      const x = SLOT_X(i);
      c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(x, 26, SLOT_W, 170);
      if (!cu) { txt('next!', x + SLOT_W / 2, 110, 12, 'rgba(230,220,196,0.3)', 'center', true); return; }
      const a = cu.leaving ? Math.max(0, cu.leaving / 1.2) : 1;
      c.globalAlpha = a;
      const fx = x + 44, fy = 120;
      c.fillStyle = `hsl(${cu.hue},18%,${cu.member ? 42 : 30}%)`; c.fillRect(fx - 26, fy + 24, 52, 48);
      c.fillStyle = `hsl(${(cu.hue + 30) % 360},26%,60%)`; c.beginPath(); c.ellipse(fx, fy, 20, 24, 0, 0, 7); c.fill();
      c.fillStyle = '#111'; c.fillRect(fx - 9, fy - 5, 4, 3); c.fillRect(fx + 5, fy - 5, 4, 3);
      const mood = cu.happy ? 1 : cu.left / cu.patience;
      c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath();
      if (mood > 0.5) c.arc(fx, fy + 6, 7, 0.2 * Math.PI, 0.8 * Math.PI); else if (mood > 0.25) { c.moveTo(fx - 7, fy + 11); c.lineTo(fx + 7, fy + 11); } else c.arc(fx, fy + 16, 7, 1.2 * Math.PI, 1.8 * Math.PI);
      c.stroke();
      if (cu.member) txt('⭐', fx + 18, fy - 18, 14, '#e8c547', 'center');
      txt(cu.name, fx, 188, 10, cu.member ? '#e8c547' : '#efe6cf', 'center', true, 84);
      // order ticket
      c.fillStyle = '#efe6cf'; c.fillRect(x + 92, 36, 100, 112);
      txt(cu.member ? 'MEMBER ORDER' : 'ORDER', x + 142, 50, 9, '#5a4528', 'center', true);
      cu.order.forEach((id, k) => { item(id, x + 120 + (k % 2) * 46, 72 + Math.floor(k / 2) * 34, 0.9); });
      // patience
      c.fillStyle = '#333'; c.fillRect(x + 92, 156, 100, 8);
      c.fillStyle = mood > 0.5 ? '#7fd17f' : mood > 0.25 ? '#ffd166' : '#ff5a3a'; c.fillRect(x + 92, 156, 100 * Math.max(0, cu.left / cu.patience), 8);
      txt(['A', 'S', 'D'][i], x + 186, 186, 10, 'rgba(230,220,196,0.4)', 'right', true);
      if (cu.sayT > 0 && cu.say) { c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(x + 2, 28, SLOT_W - 4, 20); txt(cu.say, x + SLOT_W / 2, 42, 10, cu.happy ? '#d6f08a' : '#ffb347', 'center', false, SLOT_W - 10); }
      c.globalAlpha = 1;
    });
    // the tray
    c.fillStyle = '#5a4528'; c.fillRect(0, 204, W, 6);
    c.fillStyle = '#2b2b2b'; c.fillRect(150, 218, 300, 52); c.strokeStyle = '#777'; c.strokeRect(150, 218, 300, 52);
    txt('TRAY', 160, 232, 9, 'rgba(230,220,196,0.5)', 'left', true);
    tray.forEach((id, k) => item(id, 210 + k * 64, 248, 1.15));
    if (!tray.length) txt('tap the bins ↓ then a customer ↑', 300, 250, 11, 'rgba(230,220,196,0.45)', 'center');
    c.fillStyle = tray.length ? 'rgba(255,122,92,0.15)' : 'rgba(255,255,255,0.03)'; c.fillRect(TRASH.x, TRASH.y, TRASH.w, TRASH.h);
    c.strokeStyle = tray.length ? '#ff7a5c' : '#444'; c.strokeRect(TRASH.x, TRASH.y, TRASH.w, TRASH.h);
    txt('BIN THE TRAY (X)', TRASH.x + TRASH.w / 2, TRASH.y + 27, 11, tray.length ? '#efe6cf' : '#666', 'center', true);
    // bins
    ITEMS.forEach((it, i) => {
      const x = BIN_X(i);
      const busy = it.id === 'bread' && oven > 0;
      c.fillStyle = busy ? '#2a2216' : '#241d12'; c.fillRect(x, BIN_Y, BIN_W, 92);
      c.strokeStyle = busy ? '#5a4528' : '#8c6d2f'; c.strokeRect(x, BIN_Y, BIN_W, 92);
      item(it.id, x + BIN_W / 2, BIN_Y + 32, 1.3);
      txt(it.label, x + BIN_W / 2, BIN_Y + 66, 10, '#efe6cf', 'center', true, BIN_W - 6);
      txt(busy ? `oven ${oven.toFixed(1)}s` : it.sub, x + BIN_W / 2, BIN_Y + 80, 9, busy ? '#ffb347' : 'rgba(230,220,196,0.5)', 'center');
      txt(String(i + 1), x + 6, BIN_Y + 12, 9, 'rgba(230,220,196,0.35)', 'left', true);
      if (busy) { c.fillStyle = 'rgba(255,140,40,0.25)'; c.fillRect(x, BIN_Y + 92 - 92 * (oven / 3.2), BIN_W, 92 * (oven / 3.2)); }
    });
    for (const p of pops) if (p.t > 0) { c.globalAlpha = Math.min(1, p.t * 2); txt(p.s, p.x, p.y - (1.1 - p.t) * 18, 13, p.col, 'center', true); }
    c.globalAlpha = 1;
  }

  return { stop };
}
