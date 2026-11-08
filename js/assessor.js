// The Assessor's Office · Ledger Room 11. Spot the forgeries.
// Left: the Assessor's honest copy. Right: the page an owner submitted. Tap every cell that was altered,
// then certify. The Assessor is always right; you, less so. Some honest-copy cells are smudged, and then
// the only check left is the rule itself: assessed = paid × 1.13, to the cent.
// "Everything has a fair price."
import { T13 } from './economy.js';
import { makePerson } from './people.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 75, ROWS = 8;
export const AUDITOR_GRADES = [
  ['Filing Clerk', 0], ['Junior Clerk', 100], ['Ledger Clerk', 250], ['Copyist', 450], ['Auditor (Probationary)', 700], ['Auditor', 1000],
  ['Senior Auditor', 1400], ['Forensic Auditor', 1900], ['Chief Auditor', 2500], ['Deputy Assessor', 3200],
  ['Assessor-General', 4000], ['Keeper of the Honest Copy', 5000], ['The Assessor (Acting)', 6500],
];
// column layout inside a panel (x offsets, widths)
const COLS = [['lot', 'LOT', 8, 44], ['owner', 'OWNER', 54, 112], ['paid', 'PAID', 168, 58], ['assessed', '×1.13', 228, 62]];
const PANEL = { master: 8, sub: 326 }, PW = 306, ROW_Y = 78, ROW_H = 31;
const CERTIFY = { x: 470, y: 344, w: 162, h: 44 };
const FILERS = ['vanta', 'gullet', 'gavel', 'kessler', 'ministry', 'null', 'cinder', 'mercy', 'lastmile', 'ashiron', 'sprawl'];

const money = (c) => `$${(c / 100).toFixed(2)}`;
const assess = (c) => Math.round(c * 1.13);

export function createAssessor({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const ST = econ.state;
  ST.assessor ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const A = ST.assessor;
  const blocks = world.spine.blocks || [];
  const b11 = blocks[10] || { x0: 9030, x1: 11950 };
  const SITE = { x: (b11.x0 + b11.x1) / 2 - 300, y: 1550 };
  const PAD = { x: SITE.x, y: SITE.y - 160 };
  const gradeOf = (xp = A.xp) => { let i = 0; AUDITOR_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (A.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 110;
    c.fillStyle = '#d9d2bd'; c.fillRect(x0, y0, 480, 240); // archive floor
    c.fillStyle = '#6b5a40'; // shelves of ledgers
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) { c.fillRect(x0 + 18 + i * 50, y0 + 50 + r * 58, 40, 40); }
    c.fillStyle = '#efe6cf';
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) for (let k = 0; k < 5; k++) c.fillRect(x0 + 21 + i * 50 + k * 7, y0 + 54 + r * 58, 5, 32);
    c.fillStyle = '#2a3a4a'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#e8c547'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('THE ASSESSOR’S OFFICE · LEDGER ROOM 11', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.8)';
    c.fillText('Everything has a fair price. It is 1.13×.', SITE.x, y0 + 256);
    c.strokeStyle = near ? '#e8c547' : 'rgba(232,197,71,0.8)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#e8c547'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'AUDIT', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#e8c547'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'assessor', type: 'race', title: 'Ledger Room 11 · spot the forgery', sub: `${AUDITOR_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Assessor’s Ledger Room 11' } }];

  function open() {
    const g = gradeOf(), nx = AUDITOR_GRADES[g + 1];
    openModal(
      `<h2>LEDGER ROOM 11</h2>
       <div class="sub">The Assessor’s Office · “Everything has a fair price.”</div>
       <div class="explain"><b>${esc(AUDITOR_GRADES[g][0])}</b> · ${A.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${A.best || 0} · shifts ${A.shifts || 0}</div>
       <div class="explain">Owners submit their ledger pages for certification. Some have been <i>improved</i>.
         The left page is the Assessor’s honest copy; the right is what was submitted. <b>Tap every cell that was changed</b> (tap again to unmark), then <b>CERTIFY</b>.<br/>
         Caught forgery <b>+10</b> · false accusation <b>−6</b> · missed forgery <b>−8</b> · a perfect page <b>+15</b>. Some pages are honest. ${SHIFT_S} seconds.<br/>
         <span class="sub">Where the honest copy is smudged, check the rule: the ×1.13 column must be exactly paid × 1.13, to the cent. Ranking up brings subtler forgers and more smudges.</span></div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Open the ledger (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="assessor" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Leave the ledger (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#assessor');
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
    if (paid) { A.last = Date.now(); A.xp += Math.max(0, res.score); A.shifts = (A.shifts || 0) + 1; }
    A.best = Math.max(A.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Ledger Room 11: ${res.pages} pages, ${res.caught} forgeries caught, ${res.missed} missed. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(AUDITOR_GRADES[after][0])}</b>, the Assessor’s Office. The Assessor has not assessed you. You may assume 1.13.`, 'money');
    emit('assessor', { score: res.score, pages: res.pages, caught: res.caught, missed: res.missed, wrong: res.wrong, perfect: res.perfect, paid, grade: after, clean: res.pages >= 3 && !res.missed && !res.wrong });
    openModal(
      `<h2>${res.wrong > res.caught ? 'THE ASSESSOR DISAGREES' : 'LEDGER CLOSED'}</h2>
       <div class="sub">Ledger Room 11 · ${esc(AUDITOR_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         <tr><td>Pages certified · ${res.pages}</td><td></td></tr>
         <tr><td>Forgeries caught (${res.caught})</td><td style="text-align:right;color:#d6f08a">+${res.caught * 10}</td></tr>
         ${res.perfect ? `<tr><td>Perfect pages (${res.perfect})</td><td style="text-align:right;color:#d6f08a">+${res.perfect * 15}</td></tr>` : ''}
         ${res.wrong ? `<tr><td>False accusations (${res.wrong})</td><td style="text-align:right;color:#ff7a5c">−${res.wrong * 6}</td></tr>` : ''}
         ${res.missed ? `<tr><td>Forgeries certified as honest (${res.missed})</td><td style="text-align:right;color:#ff7a5c">−${res.missed * 8}</td></tr>` : ''}
         <tr><td><b>Total</b></td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       ${res.tricks.length ? `<div class="explain sub">Forgers’ tricks this shift: ${res.tricks.slice(0, 6).map(esc).join(' · ')}</div>` : ''}
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${res.missed ? '<br/><span class="sub">The forgeries you certified are now, legally, the truth. The Assessor has noted this.</span>' : ''}
       ${board ? `<br/>${board.line('assessor')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Ledger office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('assessor'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => AUDITOR_GRADES[gradeOf()][0] };
}

// ---------- forgeries ----------
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function tweakDigit(s) {
  // change one digit of a money string, never the leading $ or the decimal point
  const idx = [...s].map((ch, i) => (/\d/.test(ch) ? i : -1)).filter((i) => i >= 0);
  const i = pick(idx), d = +s[i];
  const nd = pick([1, 3, 7, 8, 6, 9].map((k) => (d + k) % 10).filter((x) => x !== d && !(i === 1 && x === 0)));
  return s.slice(0, i) + nd + s.slice(i + 1);
}
const FORGE = {
  lot: (r) => { const [b, n] = r.lot.split('·'); const sw = n[1] + n[0]; return sw !== n ? { v: `${b}·${sw}`, why: 'lot digits swapped' } : { v: `${(+b % 13) + 1}·${n}`, why: 'wrong block' }; },
  owner: (r, others) => {
    if (Math.random() < 0.55) { const s = r.owner, i = 1 + Math.floor(Math.random() * (s.length - 3)); if (s[i] !== ' ' && s[i + 1] !== ' ' && s[i] !== s[i + 1]) return { v: s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2), why: 'owner name letters swapped' }; }
    const o = pick(others.filter((x) => x !== r.owner)); return { v: o, why: 'someone else’s name' };
  },
  paid: (r) => ({ v: tweakDigit(money(r.paid)), why: 'paid price altered' }),
  assessed: (r) => (Math.random() < 0.5 ? { v: money(Math.round(r.paid * 1.25)), why: 'assessed at 1.25× (the Claim Avenue rate)' } : { v: tweakDigit(money(assess(r.paid))), why: 'assessment altered' }),
};

function makePage(grade, n) {
  const block = 1 + Math.floor(Math.random() * 13);
  const lots = new Set();
  const rows = [];
  const filer = makePerson(pick(FILERS));
  const owners = Array.from({ length: 4 }, () => makePerson(pick(FILERS)).name.slice(0, 15));
  while (rows.length < ROWS) {
    const n2 = 1 + Math.floor(Math.random() * 13); if (lots.has(n2)) continue; lots.add(n2);
    const base = pick([113, 213, 313, 413, 1300, 2600]);
    const paid = Math.round(base * 1.13 ** Math.floor(Math.random() * 6));
    rows.push({ lot: `${block}·${String(n2).padStart(2, '0')}`, owner: pick(owners), paid });
  }
  rows.sort((a, b) => a.lot.localeCompare(b.lot));
  // honest copy
  const master = rows.map((r) => ({ lot: r.lot, owner: r.owner, paid: money(r.paid), assessed: money(assess(r.paid)) }));
  const sub = master.map((r) => ({ ...r }));
  const smudge = new Set();
  const pSmudge = grade >= 1 ? Math.min(0.45, 0.12 + grade * 0.03) : 0;
  master.forEach((_, i) => { if (Math.random() < pSmudge) smudge.add(`${i}:assessed`); });
  // forgeries: none on some pages
  const honest = n > 0 && Math.random() < 0.12;
  const count = honest ? 0 : Math.min(5, 1 + Math.floor(Math.random() * (2 + Math.floor(grade / 3))));
  const forged = new Map();
  let guard = 0;
  while (forged.size < count && guard++ < 50) {
    const i = Math.floor(Math.random() * ROWS);
    // at higher grades, forgers prefer the cells you can't compare directly
    const col = grade >= 3 && Math.random() < 0.35 && smudge.has(`${i}:assessed`) ? 'assessed' : pick(['lot', 'owner', 'paid', 'assessed']);
    const key = `${i}:${col}`;
    if (forged.has(key) || [...forged.keys()].some((k) => k.startsWith(`${i}:`))) continue;
    const f = FORGE[col](rows[i], owners);
    if (f.v === sub[i][col]) continue;
    sub[i][col] = f.v; forged.set(key, f.why);
  }
  return { block, filer: filer.name, master, sub, smudge, forged, marks: new Set() };
}

function shift(c, cv, grade, done) {
  const res = { score: 0, pages: 0, caught: 0, missed: 0, wrong: 0, perfect: 0, tricks: [] };
  let t = 0, stopped = false, page = makePage(grade, 0), review = 0, slide = 0, stampMsg = '';
  const pops = [];

  const cellAt = (x, y) => {
    if (x < PANEL.sub || x > PANEL.sub + PW || y < ROW_Y || y >= ROW_Y + ROWS * ROW_H) return null;
    const i = Math.floor((y - ROW_Y) / ROW_H), lx = x - PANEL.sub;
    const col = COLS.find(([, , cx, cw]) => lx >= cx - 3 && lx < cx + cw + 3);
    return col ? `${i}:${col[0]}` : null;
  };
  const cellRect = (key, panel = 'sub') => { const [i, col] = key.split(':'); const cc = COLS.find((k) => k[0] === col); return { x: PANEL[panel] + cc[2] - 3, y: ROW_Y + +i * ROW_H + 3, w: cc[3] + 4, h: ROW_H - 6 }; };

  function certify() {
    let caught = 0, wrong = 0, missed = 0;
    for (const k of page.marks) if (page.forged.has(k)) caught++; else wrong++;
    for (const [k, why] of page.forged) if (!page.marks.has(k)) { missed++; if (!res.tricks.includes(why)) res.tricks.push(why); }
    const perfect = !wrong && !missed;
    const pts = caught * 10 - wrong * 6 - missed * 8 + (perfect ? 15 : 0);
    res.caught += caught; res.wrong += wrong; res.missed += missed; res.perfect += perfect ? 1 : 0; res.pages++; res.score += pts;
    stampMsg = perfect ? (page.forged.size ? 'CERTIFIED · ALL FORGERIES CAUGHT' : 'CERTIFIED · HONEST PAGE') : missed ? `${missed} FORGER${missed > 1 ? 'IES' : 'Y'} CERTIFIED` : `${wrong} FALSE ACCUSATION${wrong > 1 ? 'S' : ''}`;
    pops.push({ x: CERTIFY.x + CERTIFY.w / 2, y: CERTIFY.y - 8, s: `${pts >= 0 ? '+' : ''}${pts}`, col: pts >= 0 ? '#1f8f4a' : '#c0392b', t: 1.4 });
    review = 1.5;
  }

  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pd = (e) => {
    e.preventDefault();
    if (review > 0 || slide > 0) return;
    const p = pos(e);
    if (p.x >= CERTIFY.x && p.x <= CERTIFY.x + CERTIFY.w && p.y >= CERTIFY.y && p.y <= CERTIFY.y + CERTIFY.h) return certify();
    const k = cellAt(p.x, p.y);
    if (k) { if (page.marks.has(k)) page.marks.delete(k); else page.marks.add(k); }
  };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd);
  const stop = () => { stopped = true; };
  function end() { if (stopped) return; stop(); done(res); }
  cv.__debug = { get page() { return page; }, cellRect, CERTIFY, get busy() { return review > 0 || slide > 0; } };

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    for (const p of pops) p.t -= dt;
    if (review > 0) { review -= dt; if (review <= 0) { page = makePage(grade, res.pages); slide = 0.35; } }
    slide = Math.max(0, slide - dt);
    if (t >= SHIFT_S && review <= 0) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#2a2418', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function drawPanel(which) {
    const x0 = PANEL[which], rows = which === 'master' ? page.master : page.sub;
    c.fillStyle = which === 'master' ? '#f3ecd8' : '#fbf7ea'; c.fillRect(x0, 36, PW, ROW_Y + ROWS * ROW_H - 30);
    c.strokeStyle = '#b8a888'; c.lineWidth = 1; c.strokeRect(x0 + 0.5, 36.5, PW - 1, ROW_Y + ROWS * ROW_H - 31);
    txt(which === 'master' ? 'HONEST COPY · the Assessor' : `SUBMITTED · ${page.filer}`, x0 + 8, 52, 10, which === 'master' ? '#2a3a4a' : '#7a3b1f', 'left', true, PW - 16);
    for (const [, label, cx] of COLS) txt(label, x0 + cx, 70, 9, '#7a6a50', 'left', true);
    rows.forEach((r, i) => {
      const y = ROW_Y + i * ROW_H;
      c.fillStyle = i % 2 ? 'rgba(120,100,60,0.06)' : 'rgba(0,0,0,0)'; c.fillRect(x0 + 2, y, PW - 4, ROW_H);
      c.strokeStyle = 'rgba(120,150,190,0.35)'; c.beginPath(); c.moveTo(x0 + 2, y + ROW_H - 0.5); c.lineTo(x0 + PW - 2, y + ROW_H - 0.5); c.stroke();
      for (const [col, , cx, cw] of COLS) {
        if (which === 'master' && page.smudge.has(`${i}:${col}`)) {
          c.fillStyle = 'rgba(70,55,40,0.55)'; c.beginPath(); c.ellipse(x0 + cx + cw / 2 - 4, y + ROW_H / 2, cw / 2, 9, -0.1, 0, 7); c.fill();
          txt('smudged', x0 + cx + 4, y + 20, 9, 'rgba(250,240,220,0.8)');
          continue;
        }
        txt(r[col], x0 + cx, y + 20, 12, '#2a2418', 'left', col === 'assessed', cw);
      }
    });
  }
  function draw() {
    c.fillStyle = '#3a3226'; c.fillRect(0, 0, W, H);
    txt('LEDGER ROOM 11', 10, 24, 14, '#e8c547', 'left', true);
    txt(`block ${page.block} · page ${res.pages + 1}`, 168, 24, 11, '#cfc4a6');
    txt(`${Math.max(0, Math.ceil(SHIFT_S - t))}s`, 630, 24, 14, t > SHIFT_S - 10 ? '#ff7a5c' : '#e8c547', 'right', true);
    txt(`score ${res.score}`, 540, 24, 11, '#cfc4a6', 'right');
    c.save();
    if (slide > 0) c.translate((slide / 0.35) * 640, 0);
    drawPanel('master'); drawPanel('sub');
    // marks
    for (const k of page.marks) {
      const r = cellRect(k);
      const ok = page.forged.has(k);
      c.lineWidth = 2.5; c.strokeStyle = review > 0 ? (ok ? '#1f8f4a' : '#c0392b') : '#c0392b';
      c.beginPath(); c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 2, r.h / 2 + 2, -0.05, 0, 7); c.stroke();
      if (review > 0) txt(ok ? '✓' : '✗', r.x + r.w + 1, r.y + 10, 12, ok ? '#1f8f4a' : '#c0392b', 'left', true);
    }
    if (review > 0) {
      for (const [k, why] of page.forged) if (!page.marks.has(k)) {
        const r = cellRect(k); c.fillStyle = 'rgba(255,140,40,0.28)'; c.fillRect(r.x, r.y, r.w, r.h);
        c.strokeStyle = '#ff8c28'; c.lineWidth = 2; c.strokeRect(r.x, r.y, r.w, r.h);
        txt(why, PANEL.sub + 4, r.y - 1, 8, '#a04a00', 'left', true, PW - 8);
      }
      // the stamp
      const good = stampMsg.startsWith('CERTIFIED');
      c.save(); c.translate(PANEL.sub + PW / 2, 200); c.rotate(-0.16); c.globalAlpha = Math.min(1, (1.5 - review) * 5) * 0.85;
      c.strokeStyle = good ? '#1f8f4a' : '#c0392b'; c.lineWidth = 4; c.strokeRect(-140, -26, 280, 52);
      txt(stampMsg, 0, 6, 14, good ? '#1f8f4a' : '#c0392b', 'center', true, 266);
      c.restore(); c.globalAlpha = 1;
    }
    c.restore();
    // footer
    txt(page.smudge.size ? 'Smudged? Check it: ×1.13 = paid × 1.13, to the cent.' : 'Tap each altered cell on the submitted page, then certify.', 10, 362, 10, '#cfc4a6', 'left', false, 450);
    txt(`caught ${res.caught} · missed ${res.missed} · false ${res.wrong} · marked ${page.marks.size}`, 10, 382, 10, '#9a8e70', 'left', false, 450);
    c.fillStyle = review > 0 ? '#5a5040' : '#7a2e1f'; c.fillRect(CERTIFY.x, CERTIFY.y, CERTIFY.w, CERTIFY.h);
    c.strokeStyle = '#e8c547'; c.lineWidth = 2; c.strokeRect(CERTIFY.x + 1, CERTIFY.y + 1, CERTIFY.w - 2, CERTIFY.h - 2);
    txt('CERTIFY ▸', CERTIFY.x + CERTIFY.w / 2, CERTIFY.y + 28, 16, '#f3ecd8', 'center', true);
    for (const p of pops) if (p.t > 0) { c.globalAlpha = Math.min(1, p.t * 2); txt(p.s, p.x, p.y - (1.4 - p.t) * 18, 16, p.col, 'center', true); }
    c.globalAlpha = 1;
  }

  return { stop };
}
