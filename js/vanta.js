// Vantablack Holdings · Science Centre EVA Chamber. "We hold. You hold on."
// Eleven years of testing whether EVA is survivable; the results are always 'promising'.
// Zero-g: drag back and release to push off from an air pocket, coast in a straight line, and reach the next
// pocket before your 2.9 seconds of exposure run out. Tap mid-flight for a small thruster puff toward the tap.
// Black out and you're dragged back to the last pocket. Reach the airlock to finish the test; the next test is harder.
import { T13 } from './economy.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 75, EXPOSE_S = 2.9;
const ROOM = { x0: 14, y0: 40, x1: 626, y1: 388 };
const POCKET_R = 30, MAX_V = 300, PUFF_V = 75;
export const ASSOCIATE_GRADES = [
  ['Volunteer', 0], ['Test Subject', 100], ['Repeat Subject', 250], ['Tethered Associate', 450], ['Untethered Associate', 700], ['Junior Associate', 1000],
  ['Associate', 1400], ['Senior Associate', 1900], ['VP of Holding On', 2500], ['Partner (Probationary)', 3200],
  ['Partner', 4000], ['Managing Partner', 5000], ['Unseen Executive', 6500],
];
const FINDINGS = ['Results: promising.', 'Results: very promising.', 'Results: promising (subject unavailable for comment).', 'Results: promising. Further funding required.', 'Results: inconclusive, which is promising.'];

export function createVanta({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const ST = econ.state;
  ST.vanta ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const V = ST.vanta;
  const blocks = world.spine.blocks || [];
  const b1 = blocks[0] || { x0: -20450, x1: -17530 };
  const SITE = { x: (b1.x0 + b1.x1) / 2 - 300, y: -1550 };
  const PAD = { x: SITE.x, y: SITE.y + 160 };
  const gradeOf = (xp = V.xp) => { let i = 0; ASSOCIATE_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (V.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 130;
    c.fillStyle = '#050507'; c.fillRect(x0, y0, 480, 240); // a very black building
    c.strokeStyle = '#1a1a22'; c.lineWidth = 2; c.strokeRect(x0 + 1, y0 + 1, 478, 238);
    // the chamber window: a tiny figure drifting
    c.fillStyle = '#0d1220'; c.fillRect(x0 + 140, y0 + 60, 200, 120);
    const fx = x0 + 240 + Math.sin(time / 1300) * 70, fy = y0 + 120 + Math.cos(time / 1700) * 30;
    c.fillStyle = '#e8e4d8'; c.beginPath(); c.arc(fx, fy, 6, 0, 7); c.fill();
    c.fillStyle = '#4fc3f7'; c.fillRect(fx - 3, fy - 2, 6, 3);
    for (let i = 0; i < 3; i++) { c.strokeStyle = 'rgba(79,195,247,0.35)'; c.beginPath(); c.arc(x0 + 175 + i * 65, y0 + 120 + (i % 2 ? -25 : 25), 14, 0, 7); c.stroke(); }
    c.fillStyle = '#888'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('VANTABLACK HOLDINGS · SCIENCE CENTRE', SITE.x, y0 + 30);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.6)';
    c.fillText('We hold. You hold on. · EVA testing, year eleven', SITE.x, y0 + 222);
    c.strokeStyle = near ? '#e8c547' : 'rgba(180,180,200,0.8)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#bbb'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'EVA', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#bbb'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'vanta', type: 'race', title: 'EVA Chamber · 2.9 seconds', sub: `${ASSOCIATE_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Vantablack Science Centre' } }];

  function open() {
    const g = gradeOf(), nx = ASSOCIATE_GRADES[g + 1];
    openModal(
      `<h2>EVA CHAMBER</h2>
       <div class="sub">Vantablack Holdings · Science Centre · “We hold. You hold on.”</div>
       <div class="explain"><b>${esc(ASSOCIATE_GRADES[g][0])}</b> · ${V.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${V.best || 0} · tests ${V.shifts || 0}</div>
       <div class="explain">Year eleven of testing whether EVA is survivable. You are the test.
         The chamber is zero-g. Air pockets are safe; between them you are <b>exposed</b>, and you can survive <b>${EXPOSE_S} seconds</b>.<br/>
         <b>Drag back and release</b> to push off from a pocket (like a slingshot); you coast in a straight line until you hit something. In flight, <b>tap</b> to fire a small thruster puff toward the tap (3 per leg, fewer as you rank up). Walls bounce you.<br/>
         New pocket <b>+8</b> · sample <b>+5</b> · airlock <b>+25</b> and a faster next test · blackout <b>−10</b> (dragged back) · debris knocks you about <b>−3</b>. ${SHIFT_S} seconds.</div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Volunteer (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="vanta" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Abort the test (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#vanta');
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
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 5)))).amount : 0;
    if (paid) { V.last = Date.now(); V.xp += Math.max(0, res.score); V.shifts = (V.shifts || 0) + 1; }
    V.best = Math.max(V.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`EVA Chamber: ${res.tests} tests passed, ${res.blackouts} blackouts. ${FINDINGS[res.tests % FINDINGS.length]} +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(ASSOCIATE_GRADES[after][0])}</b>, Vantablack Holdings. Nobody has seen you since.`, 'money');
    emit('vanta', { score: res.score, tests: res.tests, pockets: res.pockets, samples: res.samples, blackouts: res.blackouts, hits: res.hits, paid, grade: after, clean: res.tests >= 2 && !res.blackouts });
    openModal(
      `<h2>${res.blackouts >= 3 ? 'RESULTS: PROMISING' : res.tests ? 'TEST CONCLUDED' : 'SUBJECT RETRIEVED'}</h2>
       <div class="sub">EVA Chamber · ${esc(ASSOCIATE_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         <tr><td>Air pockets reached · ${res.pockets}</td><td style="text-align:right;color:#d6f08a">+${res.pockets * 8}</td></tr>
         ${res.samples ? `<tr><td>Samples collected · ${res.samples}</td><td style="text-align:right;color:#d6f08a">+${res.samples * 5}</td></tr>` : ''}
         <tr><td>Tests passed (airlock) · ${res.tests}</td><td style="text-align:right;color:#d6f08a">+${res.tests * 25}</td></tr>
         ${res.blackouts ? `<tr><td>Blackouts · ${res.blackouts}</td><td style="text-align:right;color:#ff7a5c">−${res.blackouts * 10}</td></tr>` : ''}
         ${res.hits ? `<tr><td>Hit by debris · ${res.hits}</td><td style="text-align:right;color:#ff7a5c">−${res.hits * 3}</td></tr>` : ''}
         <tr><td><b>Total</b> · longest exposure ${res.longest.toFixed(2)} s</td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       <br/><span class="sub">${esc(FINDINGS[(res.tests + res.blackouts) % FINDINGS.length])} Vantablack thanks you for holding on.</span>
       ${board ? `<br/>${board.line('vanta')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Science Centre</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('vanta'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => ASSOCIATE_GRADES[gradeOf()][0] };
}

// ---------- the chamber ----------
function makeTest(grade, n) {
  const level = grade + n * 1.5;
  const pockets = [{ x: 50, y: 120 + Math.random() * 180, start: true }];
  const count = Math.min(7, 4 + Math.floor(level / 3));
  let guard = 0;
  while (pockets.length < count && guard++ < 400) {
    const p = pockets[pockets.length - 1];
    const step = 120 + Math.random() * (60 + Math.min(80, level * 8));
    const a = (Math.random() - 0.5) * 2.2;
    const x = p.x + Math.cos(a) * step, y = p.y + Math.sin(a) * step;
    if (x > 560 || y < ROOM.y0 + 40 || y > ROOM.y1 - 40) continue;
    if (pockets.some((q) => Math.hypot(q.x - x, q.y - y) < 100)) continue;
    pockets.push({ x, y });
  }
  const last = pockets[pockets.length - 1];
  const exit = { x: 596, y: Math.max(ROOM.y0 + 50, Math.min(ROOM.y1 - 50, last.y + (Math.random() - 0.5) * 120)), r: 26 };
  const drift = level >= 4 ? Math.min(22, (level - 3) * 4) : 0;
  pockets.forEach((p, i) => { p.r = POCKET_R; p.visited = !!p.start; if (!p.start && drift) { p.ox = p.x; p.oy = p.y; p.ph = Math.random() * 7; p.amp = drift; } });
  // samples: off the obvious line, worth a detour
  const samples = [];
  for (let i = 1; i < pockets.length && samples.length < 3; i++) {
    const a = pockets[i - 1], b = pockets[i];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = -(b.y - a.y), ny = b.x - a.x, L = Math.hypot(nx, ny) || 1, off = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 30);
    const sx = mx + (nx / L) * off, sy = my + (ny / L) * off;
    if (sy > ROOM.y0 + 15 && sy < ROOM.y1 - 15) samples.push({ x: sx, y: sy, got: false });
  }
  const debris = [];
  const nd = Math.min(5, Math.floor(level / 2));
  for (let i = 0; i < nd; i++) debris.push({ x: 150 + Math.random() * 380, y: ROOM.y0 + 30 + Math.random() * (ROOM.y1 - ROOM.y0 - 60), vx: (Math.random() - 0.5) * (40 + level * 5), vy: (Math.random() - 0.5) * (40 + level * 5), r: 8 + Math.random() * 7, rot: Math.random() * 7 });
  return { pockets, exit, samples, debris };
}

function shift(c, cv, grade, done) {
  const res = { score: 0, tests: 0, pockets: 0, samples: 0, blackouts: 0, hits: 0, longest: 0 };
  const puffMax = Math.max(1, 3 - Math.floor(grade / 5));
  let t = 0, stopped = false, test = makeTest(grade, 0), home = test.pockets[0];
  const me = { x: home.x, y: home.y, vx: 0, vy: 0, in: home, exposed: 0, puffs: puffMax, spin: 0, hitCool: 0 };
  let aim = null, fade = 0, blackout = 0, trail = [];
  const pops = [];

  function launch(vx, vy) {
    if (!me.in || blackout > 0) return;
    const sp = Math.hypot(vx, vy); if (sp < 25) return;
    const k = Math.min(1, MAX_V / sp);
    me.vx = vx * k; me.vy = vy * k; home = me.in; me.in = null; me.exposed = 0; me.puffs = puffMax; trail = [];
  }
  function puff(x, y) {
    if (me.in || me.puffs <= 0 || blackout > 0) return;
    const dx = x - me.x, dy = y - me.y, L = Math.hypot(dx, dy) || 1;
    me.vx += (dx / L) * PUFF_V; me.vy += (dy / L) * PUFF_V;
    const sp = Math.hypot(me.vx, me.vy); if (sp > MAX_V) { me.vx *= MAX_V / sp; me.vy *= MAX_V / sp; }
    me.puffs--;
    pops.push({ x: me.x - (dx / L) * 14, y: me.y - (dy / L) * 14, s: '·', col: '#cfe8ff', t: 0.35, puff: true });
  }
  function nextTest() {
    test = makeTest(grade, res.tests); home = test.pockets[0];
    Object.assign(me, { x: home.x, y: home.y, vx: 0, vy: 0, in: home, exposed: 0, puffs: puffMax });
    fade = 0.5;
  }

  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pd = (e) => {
    e.preventDefault(); cv.setPointerCapture?.(e.pointerId);
    const p = pos(e);
    if (me.in) aim = { x0: p.x, y0: p.y, x: p.x, y: p.y }; else puff(p.x, p.y);
  };
  const pm = (e) => { if (!aim) return; const p = pos(e); aim.x = p.x; aim.y = p.y; };
  const pu = () => { if (!aim) return; const a = aim; aim = null; launch((a.x0 - a.x) * 3.2, (a.y0 - a.y) * 3.2); };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
  const stop = () => { stopped = true; window.removeEventListener('pointerup', pu); };
  function end() { if (stopped) return; stop(); done(res); }
  cv.__debug = { me, get test() { return test; }, launch, puff, get blackout() { return blackout; } };

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.033, (now - last) / 1000); last = now; t += dt;
    fade = Math.max(0, fade - dt); me.hitCool = Math.max(0, me.hitCool - dt);
    for (const p of pops) p.t -= dt;
    // drifting pockets
    for (const p of test.pockets) if (p.amp) { p.x = p.ox + Math.sin(t * 0.7 + p.ph) * p.amp; p.y = p.oy + Math.cos(t * 0.53 + p.ph) * p.amp * 0.7; }
    for (const d of test.debris) {
      d.x += d.vx * dt; d.y += d.vy * dt; d.rot += dt * 1.5;
      if (d.x < ROOM.x0 + d.r || d.x > ROOM.x1 - d.r) { d.vx *= -1; d.x = Math.max(ROOM.x0 + d.r, Math.min(ROOM.x1 - d.r, d.x)); }
      if (d.y < ROOM.y0 + d.r || d.y > ROOM.y1 - d.r) { d.vy *= -1; d.y = Math.max(ROOM.y0 + d.r, Math.min(ROOM.y1 - d.r, d.y)); }
    }
    if (blackout > 0) {
      blackout -= dt;
      // dragged back to the last pocket on the tether
      me.x += (home.x - me.x) * Math.min(1, dt * 4); me.y += (home.y - me.y) * Math.min(1, dt * 4);
      if (blackout <= 0) Object.assign(me, { x: home.x, y: home.y, vx: 0, vy: 0, in: home, exposed: 0, puffs: puffMax });
    } else if (me.in) {
      // held in the pocket: settle to its centre (it may be drifting)
      me.x += (me.in.x - me.x) * Math.min(1, dt * 6); me.y += (me.in.y - me.y) * Math.min(1, dt * 6); me.vx = me.vy = 0;
      me.spin *= 0.9;
    } else {
      me.x += me.vx * dt; me.y += me.vy * dt; me.spin += dt * 2;
      me.exposed += dt; res.longest = Math.max(res.longest, me.exposed);
      if (t % 0.03 < dt) { trail.push({ x: me.x, y: me.y }); if (trail.length > 40) trail.shift(); }
      // padded walls
      if (me.x < ROOM.x0 + 9) { me.x = ROOM.x0 + 9; me.vx = Math.abs(me.vx) * 0.6; }
      if (me.x > ROOM.x1 - 9) { me.x = ROOM.x1 - 9; me.vx = -Math.abs(me.vx) * 0.6; }
      if (me.y < ROOM.y0 + 9) { me.y = ROOM.y0 + 9; me.vy = Math.abs(me.vy) * 0.6; }
      if (me.y > ROOM.y1 - 9) { me.y = ROOM.y1 - 9; me.vy = -Math.abs(me.vy) * 0.6; }
      for (const s of test.samples) if (!s.got && Math.hypot(s.x - me.x, s.y - me.y) < 16) { s.got = true; res.samples++; res.score += 5; pops.push({ x: s.x, y: s.y - 12, s: '+5 sample', col: '#d6f08a', t: 1 }); }
      for (const d of test.debris) if (me.hitCool <= 0 && Math.hypot(d.x - me.x, d.y - me.y) < d.r + 9) {
        me.hitCool = 0.6; res.hits++; res.score -= 3;
        const a = Math.atan2(me.y - d.y, me.x - d.x), sp = Math.max(90, Math.hypot(me.vx, me.vy) * 0.8);
        me.vx = Math.cos(a) * sp + d.vx * 0.5; me.vy = Math.sin(a) * sp + d.vy * 0.5;
        pops.push({ x: me.x, y: me.y - 14, s: 'CLANG −3', col: '#ff9a5c', t: 0.9 });
      }
      if (Math.hypot(test.exit.x - me.x, test.exit.y - me.y) < test.exit.r + 4) {
        res.tests++; res.score += 25;
        pops.push({ x: 320, y: 200, s: `AIRLOCK +25 · ${FINDINGS[res.tests % FINDINGS.length]}`, col: '#d6f08a', t: 1.6 });
        nextTest();
      } else {
        const p = test.pockets.find((q) => q !== home && Math.hypot(q.x - me.x, q.y - me.y) < q.r);
        if (p || (Math.hypot(home.x - me.x, home.y - me.y) < home.r && me.exposed > 0.5)) {
          const into = p || home;
          me.in = into; me.vx = me.vy = 0; me.exposed = 0;
          if (!into.visited) { into.visited = true; res.pockets++; res.score += 8; pops.push({ x: into.x, y: into.y - into.r - 6, s: '+8 air', col: '#4fc3f7', t: 1 }); }
          home = into;
        } else if (me.exposed >= EXPOSE_S) {
          res.blackouts++; res.score -= 10; blackout = 0.9; me.in = null; me.vx = me.vy = 0;
          pops.push({ x: me.x, y: me.y - 16, s: 'BLACKOUT −10', col: '#ff5a3a', t: 1.2 });
        }
      }
    }
    if (t >= SHIFT_S) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#d8d8e0', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function draw() {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    // chamber
    c.fillStyle = '#070912'; c.fillRect(ROOM.x0, ROOM.y0, ROOM.x1 - ROOM.x0, ROOM.y1 - ROOM.y0);
    c.strokeStyle = '#2a2d3a'; c.lineWidth = 6; c.strokeRect(ROOM.x0 - 3, ROOM.y0 - 3, ROOM.x1 - ROOM.x0 + 6, ROOM.y1 - ROOM.y0 + 6);
    c.fillStyle = 'rgba(255,255,255,0.025)'; for (let x = ROOM.x0; x < ROOM.x1; x += 40) c.fillRect(x, ROOM.y0, 1, ROOM.y1 - ROOM.y0);
    // pockets
    for (const p of test.pockets) {
      const g = c.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.r);
      g.addColorStop(0, 'rgba(79,195,247,0.22)'); g.addColorStop(1, 'rgba(79,195,247,0.04)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
      c.strokeStyle = p.visited ? 'rgba(79,195,247,0.45)' : '#4fc3f7'; c.lineWidth = p.visited ? 1.5 : 2.5; c.setLineDash(p.visited ? [4, 4] : []);
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.stroke(); c.setLineDash([]);
      if (!p.visited) txt('AIR', p.x, p.y + 4, 9, '#4fc3f7', 'center', true);
    }
    // airlock
    const ex = test.exit;
    c.fillStyle = '#1a2a1a'; c.beginPath(); c.arc(ex.x, ex.y, ex.r, 0, 7); c.fill();
    c.strokeStyle = '#d6f08a'; c.lineWidth = 3; c.beginPath(); c.arc(ex.x, ex.y, ex.r, 0, 7); c.stroke();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 0.6; c.beginPath(); c.moveTo(ex.x, ex.y); c.lineTo(ex.x + Math.cos(a) * ex.r, ex.y + Math.sin(a) * ex.r); c.stroke(); }
    txt('AIRLOCK', ex.x, ex.y - ex.r - 6, 9, '#d6f08a', 'center', true);
    // samples
    for (const s of test.samples) if (!s.got) { c.save(); c.translate(s.x, s.y); c.rotate(t * 2); c.fillStyle = '#d6f08a'; c.fillRect(-5, -5, 10, 10); c.restore(); }
    // debris
    for (const d of test.debris) { c.save(); c.translate(d.x, d.y); c.rotate(d.rot); c.fillStyle = '#5a5248'; c.beginPath(); c.moveTo(-d.r, -d.r * 0.4); c.lineTo(-d.r * 0.2, -d.r); c.lineTo(d.r, -d.r * 0.3); c.lineTo(d.r * 0.6, d.r); c.lineTo(-d.r * 0.7, d.r * 0.6); c.closePath(); c.fill(); c.restore(); }
    // trail
    c.fillStyle = 'rgba(232,228,216,0.25)'; for (const p of trail) c.fillRect(p.x - 1, p.y - 1, 2, 2);
    // aim preview
    if (aim && me.in) {
      const vx = (aim.x0 - aim.x) * 3.2, vy = (aim.y0 - aim.y) * 3.2, sp = Math.hypot(vx, vy);
      if (sp > 25) {
        const k = Math.min(1, MAX_V / sp), ux = vx * k, uy = vy * k;
        c.strokeStyle = 'rgba(214,240,138,0.8)'; c.setLineDash([5, 6]); c.lineWidth = 2;
        c.beginPath(); c.moveTo(me.x, me.y); c.lineTo(me.x + ux * 0.55, me.y + uy * 0.55); c.stroke(); c.setLineDash([]);
        txt(`${Math.round(Math.min(sp, MAX_V) / MAX_V * 100)}%`, me.x + ux * 0.55, me.y + uy * 0.55 - 8, 10, '#d6f08a', 'center', true);
      }
    }
    // the suit
    const exposedFrac = me.in ? 0 : Math.min(1, me.exposed / EXPOSE_S);
    c.save(); c.translate(me.x, me.y); c.rotate(me.spin);
    c.fillStyle = '#e8e4d8'; c.fillRect(-6, -2, 12, 14); // body
    c.fillRect(-10, 0, 4, 9); c.fillRect(6, 0, 4, 9); // arms
    c.beginPath(); c.arc(0, -6, 7, 0, 7); c.fill(); // helmet
    c.fillStyle = exposedFrac > 0.66 ? '#ff5a3a' : '#4fc3f7'; c.fillRect(-4, -9, 8, 5); // visor
    c.restore();
    if (!me.in && blackout <= 0) {
      c.strokeStyle = exposedFrac > 0.66 ? '#ff5a3a' : exposedFrac > 0.4 ? '#ffd166' : '#d6f08a'; c.lineWidth = 3;
      c.beginPath(); c.arc(me.x, me.y, 17, -Math.PI / 2, -Math.PI / 2 + (1 - exposedFrac) * Math.PI * 2); c.stroke();
      for (let i = 0; i < me.puffs; i++) { c.fillStyle = '#cfe8ff'; c.fillRect(me.x - 8 + i * 6, me.y + 20, 4, 4); }
    }
    for (const p of pops) if (p.t > 0) {
      c.globalAlpha = Math.min(1, p.t * 2);
      if (p.puff) { c.fillStyle = '#cfe8ff'; c.beginPath(); c.arc(p.x, p.y, 6 + (0.35 - p.t) * 20, 0, 7); c.fill(); }
      else txt(p.s, Math.max(70, Math.min(570, p.x)), p.y - (1.2 - p.t) * 14, 12, p.col, 'center', true, 560);
    }
    c.globalAlpha = 1;
    // vignette as exposure climbs, black when out
    if (exposedFrac > 0.5 || blackout > 0) {
      const a = blackout > 0 ? 0.85 : (exposedFrac - 0.5) * 1.2;
      const g = c.createRadialGradient(me.x, me.y, 30, me.x, me.y, 380);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (fade > 0) { c.fillStyle = `rgba(0,0,0,${fade * 2})`; c.fillRect(0, 0, W, H); }
    // HUD
    txt('EVA CHAMBER', 14, 26, 14, '#bbb', 'left', true);
    txt(`test ${res.tests + 1} · score ${res.score}`, 150, 26, 11, '#9a9aa8');
    txt(me.in ? 'IN AIR · drag back & release' : blackout > 0 ? 'BLACKED OUT · retrieving' : `EXPOSED ${me.exposed.toFixed(2)} / ${EXPOSE_S}s · tap to puff`, 360, 26, 11, me.in ? '#4fc3f7' : '#ff9a8a', 'left', true, 210);
    txt(`${Math.max(0, Math.ceil(SHIFT_S - t))}s`, 626, 26, 14, t > SHIFT_S - 10 ? '#ff7a5c' : '#bbb', 'right', true);
  }

  return { stop };
}
