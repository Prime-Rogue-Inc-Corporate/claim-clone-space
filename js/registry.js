// Registry of Skiffs & Souls · Intake Hall 12. Sort the souls.
// Intake forms arrive faster and faster. Read each one, apply the rulebook, send it to the right tray:
// a number for the newly arrived, housing for the living, auction for the silent, the morgue for the dead,
// and the shredder for anything that cannot exist. "You are a number. Congratulations."
import { T13 } from './economy.js';
import { makePerson } from './people.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 70, QUEUE_MAX = 6;
export const REGISTRAR_GRADES = [
  ['Intake Temp', 0], ['Stamp Holder', 100], ['Soul Counter', 250], ['Number Clerk', 450], ['Senior Number Clerk', 700], ['Dormancy Officer', 1000],
  ['Deputy Registrar', 1400], ['Registrar', 1900], ['Senior Registrar', 2500], ['Keeper of Numbers', 3200],
  ['Registrar-General', 4000], ['Custodian of Souls', 5000], ['Skiff #001', 6500],
];
const TRAYS = [
  ['number', 'NUMBER', 'new arrival', '#4fc3f7'],
  ['housing', 'HOUSING', 'living, active', '#2bbf6a'],
  ['auction', 'AUCTION', '13+ days silent', '#e8c547'],
  ['morgue', 'MORGUE', 'certified dead', '#9a9aa6'],
  ['shred', 'SHRED', 'cannot exist', '#ff5a3a'],
];
const TRAY = { y: 318, h: 74, w: 122, gap: 4, x0: 8 };
const FACTIONS = ['sprawl', 'sprawl', 'kessler', 'lastmile', 'gullet', 'cinder', 'ashiron', 'null', 'mercy', 'gavel'];
const DOCTORS = ['Dr. Vell', 'Dr. Okonkwo-Marsh', 'Dr. Ashby', 'Dr. Thirteen', 'Dr. Prell'];
const CAUSES = ['Spine Run, lap 3', 'a Thursday ration', 'bought out (emotionally)', 'scooter, no helmet', 'void exposure', 'Foundry Line 3', 'billing complications'];

export function createRegistry({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const ST = econ.state;
  ST.registry ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const R = ST.registry;
  const blocks = world.spine.blocks || [];
  const b12 = blocks[11] || { x0: 11950, x1: 14870 };
  const SITE = { x: (b12.x0 + b12.x1) / 2 - 300, y: 1550 };
  const PAD = { x: SITE.x, y: SITE.y - 160 };
  const gradeOf = (xp = R.xp) => { let i = 0; REGISTRAR_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (R.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 110;
    c.fillStyle = '#c9c6bc'; c.fillRect(x0, y0, 480, 240);
    // the queue: a long line of souls on a conveyor
    c.fillStyle = '#4a4a50'; c.fillRect(x0 + 20, y0 + 150, 440, 22);
    for (let i = 0; i < 11; i++) {
      const x = x0 + 30 + ((i * 40 + time / 40) % 430);
      c.fillStyle = '#efe6cf'; c.fillRect(x, y0 + 140, 26, 18);
      c.fillStyle = '#7a6a50'; c.fillRect(x + 3, y0 + 144, 14, 2); c.fillRect(x + 3, y0 + 149, 18, 2);
    }
    TRAYS.forEach(([, , , col], i) => { c.fillStyle = col; c.fillRect(x0 + 40 + i * 84, y0 + 60, 60, 40); });
    c.fillStyle = '#1d2230'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#4fc3f7'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('REGISTRY OF SKIFFS & SOULS · INTAKE 12', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.8)';
    c.fillText('You are a number. Congratulations.', SITE.x, y0 + 256);
    c.strokeStyle = near ? '#e8c547' : 'rgba(79,195,247,0.9)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#4fc3f7'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'INTAKE', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#4fc3f7'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'registry', type: 'race', title: 'Intake 12 · sort the souls', sub: `${REGISTRAR_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Registry Intake 12' } }];

  function open() {
    const g = gradeOf(), nx = REGISTRAR_GRADES[g + 1];
    openModal(
      `<h2>INTAKE 12</h2>
       <div class="sub">Registry of Skiffs & Souls · “You are a number. Congratulations.”</div>
       <div class="explain"><b>${esc(REGISTRAR_GRADES[g][0])}</b> · ${R.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${R.best || 0} · shifts ${R.shifts || 0}</div>
       <div class="explain">Intake forms arrive, faster and faster. Read the top one and send it to a tray (tap the tray, or keys <b>1–5</b>). The rulebook stays on screen; check it top to bottom, first match wins:
         <br/>1. Skiff <b>#000</b>, or a death certificate <b>signed by the deceased</b> → <b>SHRED</b>
         <br/>2. Genuine Mercy death certificate → <b>MORGUE</b>
         <br/>3. Last seen <b>13 days or more</b> → <b>AUCTION</b> (the number goes to Gavel & Rope)
         <br/>4. No skiff number yet → <b>NUMBER</b>
         <br/>5. Everyone else → <b>HOUSING</b>
         <br/>Right <b>+6</b> (streaks pay more) · wrong <b>−5</b> · ${QUEUE_MAX} forms waiting and the next is lost in the paperwork <b>−8</b>. ${SHIFT_S} seconds.</div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Open intake (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="registry" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Close the window (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#registry');
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
    if (paid) { R.last = Date.now(); R.xp += Math.max(0, res.score); R.shifts = (R.shifts || 0) + 1; }
    R.best = Math.max(R.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Intake 12: ${res.processed} souls processed, ${res.wrong} misfiled, ${res.lost} lost in the paperwork. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(REGISTRAR_GRADES[after][0])}</b>, Registry of Skiffs & Souls. You are a slightly better number.`, 'money');
    emit('registry', { score: res.score, processed: res.processed, wrong: res.wrong, lost: res.lost, buried: res.buried, paid, grade: after, clean: res.processed >= 20 && !res.wrong && !res.lost });
    openModal(
      `<h2>${res.buried ? 'THE MORGUE HAS QUESTIONS' : 'WINDOW CLOSED'}</h2>
       <div class="sub">Intake 12 · ${esc(REGISTRAR_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         ${TRAYS.map(([id, label]) => `<tr><td>${label} · ${res.by[id] || 0}</td><td></td></tr>`).join('')}
         <tr><td>Filed correctly (${res.right}, best streak ${res.bestStreak})</td><td style="text-align:right;color:#d6f08a">+${res.rightPts}</td></tr>
         ${res.wrong ? `<tr><td>Misfiled (${res.wrong})</td><td style="text-align:right;color:#ff7a5c">−${res.wrong * 5}</td></tr>` : ''}
         ${res.lost ? `<tr><td>Lost in the paperwork (${res.lost})</td><td style="text-align:right;color:#ff7a5c">−${res.lost * 8}</td></tr>` : ''}
         <tr><td><b>Total</b></td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       ${res.mistakes.length ? `<div class="explain sub">Misfiled: ${res.mistakes.slice(0, 4).map(esc).join(' · ')}</div>` : ''}
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${res.buried ? `<br/><span class="sub">${res.buried} living soul${res.buried > 1 ? 's were' : ' was'} filed as dead. Mercy Unlimited has been informed and is very interested.</span>` : ''}
       ${board ? `<br/>${board.line('registry')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Intake office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('registry'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => REGISTRAR_GRADES[gradeOf()][0] };
}

// ---------- the forms ----------
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const num = () => `#${String(1 + Math.floor(Math.random() * 998)).padStart(3, '0')}`;
function makeForm(grade) {
  const p = makePerson(pick(FACTIONS));
  const f = { name: p.name, age: p.age, skiff: num(), seen: Math.floor(Math.random() * 12), cert: null, kind: 'housing' };
  const edge = grade >= 2 && Math.random() < 0.4; // the 12-vs-13-day cases
  const r = Math.random();
  if (r < 0.24) { f.kind = 'number'; f.skiff = null; f.seen = 0; }
  else if (r < 0.5) { f.kind = 'housing'; if (edge) f.seen = 10 + Math.floor(Math.random() * 3); }
  else if (r < 0.7) { f.kind = 'auction'; f.seen = edge ? 13 + Math.floor(Math.random() * 2) : 13 + Math.floor(Math.random() * 80); }
  else if (r < 0.9) {
    f.kind = 'morgue'; f.cert = { by: pick(DOCTORS), cause: pick(CAUSES), seal: true };
    if (grade >= 1 && Math.random() < 0.35) f.seen = 13 + Math.floor(Math.random() * 30); // dead AND silent: death wins
  } else {
    f.kind = 'shred';
    if (grade >= 2 && Math.random() < 0.6) { f.cert = { by: f.name, cause: pick(['definitely died', 'very dead, honestly', 'bought out (fatally)', 'please stop billing me']), seal: false }; }
    else f.skiff = '#000';
  }
  // a little noise at higher grades: newly arrived souls who also claim housing are still just numbers
  f.note = f.kind === 'number' ? pick(['first day in the city', 'arrived on the shuttle', 'woke up in a skiff', 'claims to have always been here'])
    : f.kind === 'shred' && f.skiff === '#000' ? pick(['insists the number is real', 'says Skiff #000 is waiting', 'filed by no one']) : '';
  return f;
}
const WHY = {
  number: 'no skiff number yet: NUMBER', housing: 'living and active: HOUSING', auction: 'silent 13+ days: AUCTION',
  morgue: 'Mercy certificate: MORGUE (death beats dormancy)', shred: 'cannot exist: SHRED',
};

function shift(c, cv, grade, done) {
  const res = { score: 0, processed: 0, right: 0, rightPts: 0, wrong: 0, lost: 0, buried: 0, streak: 0, bestStreak: 0, by: {}, mistakes: [] };
  let t = 0, stopped = false, spawnIn = 0.4, flash = null, fly = null;
  const queue = [];
  const pops = [];

  function spawn() {
    if (queue.length >= QUEUE_MAX) {
      queue.shift(); res.lost++; res.score -= 8; res.streak = 0;
      pops.push({ x: 560, y: 60, s: 'LOST IN THE PAPERWORK −8', col: '#ff5a3a', t: 1.3 });
    }
    queue.push(makeForm(grade));
  }
  function file(tray) {
    const f = queue[0]; if (!f || fly) return;
    queue.shift(); res.processed++; res.by[tray] = (res.by[tray] || 0) + 1;
    if (tray === f.kind) {
      res.streak++; res.bestStreak = Math.max(res.bestStreak, res.streak);
      const pts = 6 + Math.min(5, Math.floor(res.streak / 5));
      res.right++; res.rightPts += pts; res.score += pts;
      pops.push({ x: trayX(tray) + TRAY.w / 2, y: TRAY.y - 8, s: `+${pts}`, col: '#1f8f4a', t: 1 });
      flash = { ok: true, t: 0.25 };
    } else {
      res.wrong++; res.score -= 5; res.streak = 0;
      if (tray === 'morgue' && f.kind !== 'morgue' && f.kind !== 'shred') res.buried++;
      if (res.mistakes.length < 8) res.mistakes.push(`${f.name} → ${tray.toUpperCase()} (${WHY[f.kind]})`);
      pops.push({ x: 341, y: 290, s: `✗ ${WHY[f.kind]}`, col: '#fff', t: 1.6, banner: true });
      flash = { ok: false, t: 0.4 };
    }
    fly = { f, tray, t: 0.22 };
  }
  const trayX = (id) => TRAY.x0 + TRAYS.findIndex((x) => x[0] === id) * (TRAY.w + TRAY.gap);

  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pd = (e) => {
    e.preventDefault();
    const p = pos(e);
    if (p.y < TRAY.y || p.y > TRAY.y + TRAY.h) return;
    const i = Math.floor((p.x - TRAY.x0) / (TRAY.w + TRAY.gap));
    if (i >= 0 && i < TRAYS.length) file(TRAYS[i][0]);
  };
  const kd = (e) => { const i = +e.key - 1; if (i >= 0 && i < TRAYS.length) { e.preventDefault(); e.stopPropagation(); file(TRAYS[i][0]); } };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd); window.addEventListener('keydown', kd, true);
  const stop = () => { stopped = true; window.removeEventListener('keydown', kd, true); };
  function end() { if (stopped) return; stop(); done(res); }
  cv.__debug = { get queue() { return queue; }, file, TRAY, TRAYS: TRAYS.map((x) => x[0]) };

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    for (const p of pops) p.t -= dt;
    if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
    if (fly) { fly.t -= dt; if (fly.t <= 0) fly = null; }
    spawnIn -= dt;
    if (spawnIn <= 0) { spawn(); spawnIn = Math.max(0.9, 2.5 - t * 0.02 - grade * 0.06); }
    if (t >= SHIFT_S) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#2a2418', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function drawForm(f, x, y, w, h, small = false) {
    c.fillStyle = '#f6f0dc'; c.fillRect(x, y, w, h);
    c.strokeStyle = '#8a7a5a'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (small) { c.fillStyle = '#8a7a5a'; c.fillRect(x + 6, y + 6, w * 0.6, 3); c.fillRect(x + 6, y + 12, w * 0.4, 3); return; }
    c.fillStyle = '#1d2230'; c.fillRect(x, y, w, 22);
    txt('INTAKE FORM · SKIFFS & SOULS', x + 8, y + 15, 10, '#4fc3f7', 'left', true);
    txt('NAME', x + 10, y + 42, 9, '#7a6a50', 'left', true); txt(f.name, x + 70, y + 42, 13, '#2a2418', 'left', true, w - 80);
    txt('AGE', x + 10, y + 62, 9, '#7a6a50', 'left', true); txt(String(f.age), x + 70, y + 62, 12);
    txt('SKIFF', x + 10, y + 84, 9, '#7a6a50', 'left', true);
    txt(f.skiff || '— none issued —', x + 70, y + 85, f.skiff ? 16 : 12, f.skiff === '#000' ? '#7a2e1f' : '#2a2418', 'left', !!f.skiff);
    txt('LAST SEEN', x + 10, y + 108, 9, '#7a6a50', 'left', true);
    txt(f.seen === 0 ? 'today' : `${f.seen} day${f.seen === 1 ? '' : 's'} ago`, x + 92, y + 108, 13, f.seen >= 13 ? '#7a4a00' : '#2a2418', 'left', true);
    if (f.note) txt(`note: ${f.note}`, x + 10, y + 130, 10, '#5a5040', 'left', false, w - 20);
    if (f.cert) {
      // attached death certificate
      const cx = x + 16, cy = y + 142, cw = w - 32, ch = 92;
      c.fillStyle = '#fffdf6'; c.fillRect(cx, cy, cw, ch);
      c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(cx + 1.5, cy + 1.5, cw - 3, ch - 3);
      txt('CERTIFICATE OF DEATH', cx + 10, cy + 20, 11, '#111', 'left', true);
      txt(`cause: ${f.cert.cause}`, cx + 10, cy + 40, 10, '#333', 'left', false, cw - 70);
      txt(`signed: ${f.cert.by}`, cx + 10, cy + 60, 11, '#222', 'left', true, cw - 70);
      txt(f.cert.seal ? 'Mercy Unlimited' : '', cx + 10, cy + 78, 9, '#7a2e2e');
      if (f.cert.seal) {
        c.fillStyle = '#c0392b'; c.beginPath(); c.arc(cx + cw - 32, cy + ch / 2, 22, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.fillRect(cx + cw - 36, cy + ch / 2 - 12, 8, 24); c.fillRect(cx + cw - 44, cy + ch / 2 - 4, 24, 8);
      }
    } else if (!f.skiff) {
      txt('☐ request skiff number', x + 16, y + 160, 11, '#2a2418');
    } else {
      txt('☑ housing claim attached', x + 16, y + 160, 11, '#2a2418');
    }
  }
  function draw() {
    c.fillStyle = flash ? (flash.ok ? '#203a2c' : '#4a2020') : '#262a33'; c.fillRect(0, 0, W, H);
    // rulebook
    c.fillStyle = '#e9e2cc'; c.fillRect(8, 36, 196, 274);
    txt('RULEBOOK · first match wins', 16, 54, 10, '#1d2230', 'left', true);
    const rules = [['1', '#000, or certificate signed', 'by the deceased', 'SHRED', '#c0392b'], ['2', 'Mercy death certificate', '(sealed, signed by a doctor)', 'MORGUE', '#5a5a66'], ['3', 'last seen 13+ days ago', '', 'AUCTION', '#a07a00'], ['4', 'no skiff number', '', 'NUMBER', '#1a7ab0'], ['5', 'everyone else', '', 'HOUSING', '#1f8f4a']];
    rules.forEach(([n, a, b, tray, col], i) => {
      const y = 76 + i * 46;
      txt(n, 16, y + 4, 16, col, 'left', true);
      txt(a, 34, y, 10, '#2a2418', 'left', false, 166); if (b) txt(b, 34, y + 13, 10, '#2a2418', 'left', false, 166);
      txt(`→ ${tray}`, 34, y + (b ? 27 : 14), 10, col, 'left', true);
    });
    // header
    txt('INTAKE 12', 10, 24, 14, '#4fc3f7', 'left', true);
    txt(`score ${res.score}${res.streak >= 5 ? ` · streak ${res.streak}` : ''}`, 120, 24, 11, '#cfd4dc');
    txt(`${Math.max(0, Math.ceil(SHIFT_S - t))}s`, 630, 24, 14, t > SHIFT_S - 10 ? '#ff7a5c' : '#4fc3f7', 'right', true);
    // the current form
    const f = queue[0];
    if (f) drawForm(f, 214, 36, 254, 274);
    else if (!pops.some((p) => p.banner && p.t > 0)) { txt('(the window is quiet)', 341, 170, 12, '#8a90a0', 'center'); }
    if (fly) { const k = 1 - fly.t / 0.22, tx = trayX(fly.tray) + TRAY.w / 2; c.globalAlpha = 1 - k; drawForm(fly.f, 214 + (tx - 341) * k, 36 + (TRAY.y - 60) * k, 254 * (1 - k * 0.7), 274 * (1 - k * 0.8), true); c.globalAlpha = 1; }
    // the waiting pile
    txt(`WAITING ${Math.max(0, queue.length - 1)}/${QUEUE_MAX - 1}`, 552, 52, 10, queue.length >= QUEUE_MAX ? '#ff7a5c' : '#cfd4dc', 'center', true);
    for (let i = 1; i < queue.length; i++) drawForm(queue[i], 486, 64 + (i - 1) * 46, 132, 40, true);
    // trays
    TRAYS.forEach(([id, label, sub, col], i) => {
      const x = TRAY.x0 + i * (TRAY.w + TRAY.gap);
      c.fillStyle = '#14171d'; c.fillRect(x, TRAY.y, TRAY.w, TRAY.h);
      c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(x + 1, TRAY.y + 1, TRAY.w - 2, TRAY.h - 2);
      txt(String(i + 1), x + 8, TRAY.y + 18, 11, col, 'left', true);
      txt(label, x + TRAY.w / 2, TRAY.y + 40, 15, col, 'center', true);
      txt(sub, x + TRAY.w / 2, TRAY.y + 60, 9, '#9aa0ad', 'center');
    });
    for (const p of pops) if (p.t > 0 && p.banner) { c.globalAlpha = Math.min(1, p.t * 2); c.fillStyle = '#a02a20'; c.fillRect(214, p.y - 18, 254, 28); txt(p.s, p.x, p.y, 11, '#fff', 'center', true, 244); }
    for (const p of pops) if (p.t > 0 && !p.banner) { c.globalAlpha = Math.min(1, p.t * 2); txt(p.s, p.x, p.y - (1.4 - p.t) * 16, p.s.length > 14 ? 12 : 16, p.col, 'center', true, 300); }
    c.globalAlpha = 1;
  }

  return { stop };
}
