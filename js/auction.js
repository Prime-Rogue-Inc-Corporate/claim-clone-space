// Gavel & Rope · Auction Floor 13. You hold the gavel. Five bidders, a lot at a time.
// Call the price up and read the room: bidders near their limit sweat, hesitate, mutter.
// Big steps are quick but leave money on the table; small steps are slow. A "chandelier bid"
// (a bid nobody made) pushes the top bidder further, but if nobody beats it the lot is bought in
// and the Rope Committee notes it. Commission is 13%. "Everything has a price. We find it."
import { T13 } from './economy.js';
import { makePerson } from './people.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 100, COMMISSION = 0.13;
export const CALLER_GRADES = [
  ['Runner', 0], ['Paddle Counter', 100], ['Spotter', 250], ['Junior Caller', 450], ['Caller', 700], ['Senior Caller', 1000],
  ['Chandelier Artist', 1400], ['Silver Tongue', 1900], ['Hammer of the Floor', 2500], ['Master of Lots', 3200],
  ['Keeper of the Rope', 4000], ['Gavel Emeritus', 5000], ['The Last Word', 6500],
];
const LOTS = [
  ['Skiff number #013', 220], ['A repossessed hut (Lower Upper Squalor)', 90], ['13 litres of metered air', 60], ['The Assessor’s spare monocle', 340],
  ['A Bureau smile (used, one careful owner)', 45], ['Signed Null Sector citation (framed)', 120], ['Wilco’s tennis ball (provenance disputed)', 780],
  ['A box of credit statements, mostly expired', 30], ['Half a Tenure Heights pod (the bottom half)', 1300], ['A Kessler ore sample (probably ore)', 150],
  ['Lot 9 (a person; debts included)', 410], ['Ash & Iron hymnal, smog-damaged', 70], ['A seat on the Rope Committee (non-voting)', 950],
  ['Mercy Unlimited gift card (non-refundable, like everything)', 85], ['Recycled water, vintage', 260], ['A Spine lot’s shadow (after 4 pm only)', 610],
];
const FNAME = { vanta: 'Vantablack', gullet: 'Gullet', ministry: 'Ministry', null: 'Null Sector', gavel: 'Gavel & Rope', assessor: 'Assessor', kessler: 'Kessler', sprawl: 'Sprawl', cinder: 'Cinder', mercy: 'Mercy' };
const step = (p) => (p < 100 ? 5 : p < 500 ? 10 : p < 1000 ? 25 : 50);
const money = (v) => `$${Math.round(v).toLocaleString()}`;

export function createAuction({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const S = econ.state;
  S.gavel ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const G = S.gavel;
  const blocks = world.spine.blocks || [];
  const b9 = blocks[8] || { x0: 4590, x1: 7450 };
  const SITE = { x: (b9.x0 + b9.x1) / 2 - 400, y: 1500 };
  const PAD = { x: SITE.x, y: SITE.y - 150 };
  const gradeOf = (xp = G.xp) => { let i = 0; CALLER_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (G.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 110;
    c.fillStyle = '#1e1810'; c.fillRect(x0, y0, 480, 250);
    c.strokeStyle = '#c9a227'; c.lineWidth = 4; c.strokeRect(x0, y0, 480, 250);
    c.fillStyle = '#3a2c18'; c.fillRect(SITE.x - 50, y0 + 44, 100, 40); // the rostrum
    for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) { // the room, paddles up now and then
      const px = x0 + 50 + i * 54, py = y0 + 120 + r * 38;
      c.fillStyle = '#5a4a36'; c.beginPath(); c.arc(px, py, 10, 0, 7); c.fill();
      if (Math.sin(time / 700 + i * 1.7 + r * 2.3) > 0.93) { c.fillStyle = '#efe6cf'; c.fillRect(px + 6, py - 26, 12, 10); c.fillStyle = '#5a4a36'; c.fillRect(px + 11, py - 16, 2, 10); }
    }
    c.fillStyle = '#c9a227'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#0b0c0e'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('GAVEL & ROPE · AUCTION FLOOR 13', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.7)';
    c.fillText('Everything has a price. We find it.', SITE.x, y0 + 266);
    c.strokeStyle = near ? '#e8c547' : 'rgba(201,162,39,0.7)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#e8c547'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'GAVEL', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#c9a227'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'gavel', type: 'stamp', title: 'Auction Floor 13 · take the gavel', sub: `${CALLER_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Gavel & Rope Auction Floor 13' } }];

  function open() {
    const g = gradeOf(), nx = CALLER_GRADES[g + 1];
    openModal(
      `<h2>AUCTION FLOOR 13</h2>
       <div class="sub">Gavel & Rope · “Everything has a price. We find it.”</div>
       <div class="explain"><b>${esc(CALLER_GRADES[g][0])}</b> · ${G.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${G.best || 0} · shifts ${G.shifts || 0}</div>
       <div class="explain">You're the auctioneer; you keep <b>13%</b> of every hammer price. <b>ASK</b> raises the price one step (<b>ASK ×5</b>, five). Bidders take it if they can afford it.
         <b>Read the tells</b>: a bidder near their limit sweats, hesitates, mutters. When nobody bites: <i>going once, going twice</i>, sold to the high bid (or hit <b>SOLD</b>).
         <b>CHANDELIER</b> invents a bid to push the top bidder higher. If nobody beats it, the lot is <b>bought in</b>: no sale, and a strike from the Rope Committee. Three strikes and they take your gavel. ${SHIFT_S} seconds.</div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Take the gavel (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="auct" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Leave the rostrum (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#auct');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = W * dpr; cv.height = H * dpr;
        const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const game = floor(c, cv, gradeOf(), (res) => finish(res, paid));
        el.querySelector('#quit').addEventListener('click', () => { game.stop(); open(); });
      }
    );
  }

  function finish(res, paid) {
    const before = gradeOf();
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 3.2)))).amount : 0;
    if (paid) { G.last = Date.now(); G.xp += Math.max(0, res.score); G.shifts = (G.shifts || 0) + 1; }
    G.best = Math.max(G.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Auction Floor 13: ${res.sold} lots sold for ${money(res.gross)}, commission ${money(res.score)}. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(CALLER_GRADES[after][0])}</b>, Gavel & Rope. The Rope Committee is watching, approvingly.`, 'money');
    emit('auction', { score: res.score, sold: res.sold, gross: res.gross, boughtIn: res.boughtIn, chandeliers: res.chandeliers, roped: res.roped, efficiency: res.eff, paid, grade: after });
    const rows = res.log.map((l) => `<tr><td>${esc(l.name)}</td><td style="text-align:right">${l.price ? money(l.price) : '—'}</td><td class="sub" style="text-align:right">${esc(l.note)}</td></tr>`).join('');
    openModal(
      `<h2>${res.roped ? 'GAVEL CONFISCATED' : 'THE FLOOR IS CLOSED'}</h2>
       <div class="sub">Auction Floor 13 · ${esc(CALLER_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>${rows}</table>
       <div class="explain" style="font-size:14px">Sold ${res.sold} · hammer total ${money(res.gross)} · <b>commission ${money(res.score)}</b><br/>
       Price found: ${Math.round(res.eff * 100)}% of what the room would actually pay · chandelier bids ${res.chandeliers} · bought in ${res.boughtIn}<br/>
       ${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${board ? `<br/>${board.line('auction')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Floor office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('auction'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => CALLER_GRADES[gradeOf()][0] };
}

// ---------- the floor ----------
function floor(c, cv, grade, done) {
  const FACTIONS = ['vanta', 'gullet', 'ministry', 'null', 'gavel', 'assessor', 'kessler', 'sprawl', 'cinder', 'mercy'];
  const seats = Array.from({ length: 5 }, (_, i) => {
    const p = makePerson(FACTIONS[Math.floor(Math.random() * FACTIONS.length)]);
    return { i, name: p.name.split(' ')[0], full: p.name, faction: p.faction, hue: Math.floor(Math.random() * 360), max: 0, paddle: 0, bidAt: null, mutter: null, mutterT: 0 };
  });
  const lotsLeft = [...LOTS].sort(() => Math.random() - 0.5);
  const res = { score: 0, gross: 0, sold: 0, boughtIn: 0, chandeliers: 0, roped: false, eff: 0, log: [] };
  let effSum = 0, effN = 0;
  let t = 0, stopped = false, lot = null, high = null, highPrice = 0, ask = 0, silence = 0, banner = null, bannerT = 0, between = 0, cooldownMsg = null;

  function nextLot() {
    if (!lotsLeft.length) lotsLeft.push(...[...LOTS].sort(() => Math.random() - 0.5));
    const [name, base] = lotsLeft.shift();
    const V = base * (0.7 + Math.random() * 0.6);
    lot = { name, est: [Math.round(V * 0.6), Math.round(V * 1.1)], opened: false };
    const sharp = 0.18 + grade * 0.01; // the room gets cagier as you rank up
    for (const s of seats) {
      const r = Math.random();
      s.max = r < 0.12 ? 0 : V * (0.55 + Math.random() * 0.75) * (Math.random() < 0.12 ? 1.5 : 1); // some sit on their hands; one may be a whale
      s.max = Math.round(s.max / step(s.max || 1)) * step(s.max || 1);
      s.paddle = 0; s.bidAt = null; s.mutter = null;
      s.tellAt = sharp;
    }
    high = null; highPrice = 0;
    ask = Math.max(5, Math.round((V * 0.35) / step(V)) * step(V));
    silence = 0; lot.opened = true;
    schedule();
  }
  // everyone who can afford the ask decides when (or whether) to raise a paddle
  function schedule() {
    silence = 0;
    for (const s of seats) {
      s.bidAt = null;
      if (s === high || s.max < ask) continue;
      const head = (s.max - ask) / Math.max(1, s.max);
      s.bidAt = t + 0.25 + Math.max(0, 0.2 - head) * 6 + Math.random() * 0.35;
      if (head < s.tellAt) { s.mutter = ['…steep', 'hm.', 'my wife will kill me', '*sweats*', 'last one', 'ugh, fine…', 'is that with tax?'][Math.floor(Math.random() * 7)]; s.mutterT = 1.6; }
    }
  }
  function soldTo(chand = false) {
    const realMax = Math.max(...seats.map((s) => s.max));
    const second = [...seats.map((s) => s.max)].sort((a, b) => b - a)[1] || 0;
    if (!high) { res.log.push({ name: lot.name, price: 0, note: 'passed (no bids)' }); flash('PASSED · NO BIDS', '#aaa'); }
    else if (high === 'chandelier') {
      res.boughtIn++; res.log.push({ name: lot.name, price: 0, note: 'BOUGHT IN · strike' });
      flash(`BOUGHT IN · STRIKE ${res.boughtIn}/3`, '#ff7a5c');
      if (res.boughtIn >= 3) { res.roped = true; return end(); }
    } else {
      const price = highPrice;
      const com = Math.round(price * COMMISSION);
      res.score += com; res.gross += price; res.sold++;
      if (realMax > 0) { effSum += Math.min(1, price / realMax); effN++; }
      res.log.push({ name: lot.name, price, note: `to ${high.full}${price >= second + step(second) ? '' : ''}` });
      high.paddle = 0;
      flash(`SOLD to ${high.name} · ${money(price)} · +${money(com)}`, '#d6f08a');
    }
    lot = null; between = 1.6;
  }
  function flash(s, col) { banner = { s, col }; bannerT = 1.6; }

  // input
  const BTN = [
    { id: 'ask', label: 'ASK +1', x: 10, y: 344, w: 148, h: 48 },
    { id: 'ask5', label: 'ASK ×5', x: 166, y: 344, w: 148, h: 48 },
    { id: 'chand', label: 'CHANDELIER', x: 322, y: 344, w: 148, h: 48 },
    { id: 'sold', label: 'SOLD!', x: 478, y: 344, w: 152, h: 48 },
  ];
  function act(id) {
    if (!lot || stopped) return;
    if (id === 'ask' || id === 'ask5') {
      if (!high && ask > 0 && id === 'ask') return; // the opening ask stands until somebody bites
      const n = id === 'ask5' ? 5 : 1;
      let a = Math.max(ask, highPrice); for (let k = 0; k < n; k++) a += step(a);
      ask = a; schedule();
    } else if (id === 'chand') {
      if (!high || high === 'chandelier') return cool('Only with a real bid in the room.');
      res.chandeliers++;
      const prev = high; high = 'chandelier'; highPrice = ask;
      ask = ask + step(ask);
      schedule();
      if (prev && prev.max >= ask) prev.bidAt = t + 0.6 + Math.random() * 0.6;
      flash(`“${money(highPrice)} from the back of the room…”`, '#ffb347');
    } else if (id === 'sold') soldTo();
  }
  const cool = (s) => { cooldownMsg = s; flash(s, '#aaa'); };
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pd = (e) => { e.preventDefault(); const p = pos(e); const b = BTN.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h); if (b) act(b.id); };
  const kd = (e) => { const m = { '1': 'ask', a: 'ask', '5': 'ask5', s: 'ask5', c: 'chand', '3': 'chand', ' ': 'sold', Enter: 'sold' }[e.key]; if (m) { e.preventDefault(); act(m); } };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd); window.addEventListener('keydown', kd);
  const stop = () => { stopped = true; window.removeEventListener('keydown', kd); };
  function end() { if (stopped) return; stop(); res.eff = effN ? effSum / effN : 0; done(res); }

  nextLot();
  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    bannerT = Math.max(0, bannerT - dt);
    for (const s of seats) { s.mutterT = Math.max(0, s.mutterT - dt); if (s.paddle > 0) s.paddle = Math.max(0, s.paddle - dt * 0.6); }
    if (between > 0) { between -= dt; if (between <= 0) { if (t >= SHIFT_S) return end(); nextLot(); } }
    else if (lot) {
      // first paddle up wins the ask
      const ready = seats.filter((s) => s.bidAt != null && s.bidAt <= t).sort((a, b) => a.bidAt - b.bidAt)[0];
      if (ready) {
        high = ready; highPrice = ask; ready.paddle = 1; ready.mutter = null;
        ask = ask + step(ask);
        schedule();
      } else {
        silence += dt;
        if (silence > 4.0) soldTo();
      }
    }
    if (t >= SHIFT_S + 6) return end(); // a lot in progress gets a few seconds' grace
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#efe6cf', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function draw() {
    c.fillStyle = '#17120c'; c.fillRect(0, 0, W, H);
    // header
    txt(`AUCTION FLOOR 13 · ${Math.max(0, Math.ceil(SHIFT_S - t))}s`, 12, 20, 12, '#c9a227', 'left', true);
    txt(`commission ${money(res.score)} · sold ${res.sold} · strikes ${'✖'.repeat(res.boughtIn)}${'·'.repeat(Math.max(0, 3 - res.boughtIn))}`, 628, 20, 11, 'rgba(230,220,196,0.8)', 'right');
    // the lot
    c.fillStyle = '#2a2016'; c.fillRect(12, 30, 616, 96); c.strokeStyle = 'rgba(201,162,39,0.5)'; c.strokeRect(12, 30, 616, 96);
    if (lot) {
      txt('NOW SELLING', 24, 48, 10, '#c9a227', 'left', true);
      txt(lot.name, 24, 70, 15, '#efe6cf', 'left', true, 590);
      txt(`Catalogue estimate ${money(lot.est[0])}–${money(lot.est[1])}`, 24, 90, 11, 'rgba(230,220,196,0.7)');
      const who = high === 'chandelier' ? 'the back of the room (ahem)' : high ? `${high.full} (paddle ${high.i + 1})` : 'no bids yet';
      txt(`HIGH BID ${high ? money(highPrice) : '—'}`, 24, 114, 14, high === 'chandelier' ? '#ffb347' : '#d6f08a', 'left', true);
      txt(who, 230, 114, 11, 'rgba(230,220,196,0.8)', 'left', false, 230);
      txt(`ASKING ${money(ask)}`, 616, 114, 14, '#e8c547', 'right', true);
      const g = silence > 3.1 ? 'GOING TWICE…' : silence > 2.0 ? 'GOING ONCE…' : '';
      if (g) txt(g, 616, 52, 14, '#ff7a5c', 'right', true);
    } else txt('Next lot…', 320, 84, 14, 'rgba(230,220,196,0.6)', 'center', true);
    // the bidders
    seats.forEach((s, i) => {
      const x = 70 + i * 125, y = 225;
      const head = lot && s.max ? (s.max - Math.max(ask, highPrice)) / s.max : 1;
      const isHigh = high === s;
      c.fillStyle = isHigh ? 'rgba(214,240,138,0.12)' : 'rgba(255,255,255,0.03)'; c.fillRect(x - 56, 136, 112, 196);
      // body + head
      c.fillStyle = `hsl(${s.hue},20%,32%)`; c.fillRect(x - 32, y + 22, 64, 70);
      const jitter = lot && head < 0.06 && head >= 0 ? Math.sin(t * 40) * 1.5 : 0;
      c.fillStyle = `hsl(${(s.hue + 40) % 360},28%,60%)`; c.beginPath(); c.ellipse(x + jitter, y, 22, 27, 0, 0, 7); c.fill();
      c.fillStyle = '#111'; c.fillRect(x - 10 + jitter, y - 6, 5, 3); c.fillRect(x + 5 + jitter, y - 6, 5, 3);
      c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath();
      if (lot && head < 0.12 && head >= 0) { c.moveTo(x - 8, y + 12); c.lineTo(x + 8, y + 10); } else c.arc(x, y + 6, 8, 0.2 * Math.PI, 0.8 * Math.PI);
      c.stroke();
      if (lot && head < s.tellAt && head >= 0) { c.fillStyle = 'rgba(120,190,255,0.8)'; for (let k = 0; k < 3; k++) { const yy = y - 22 + ((t * 30 + k * 13) % 30); c.beginPath(); c.arc(x + 20 + k * 3, yy, 2, 0, 7); c.fill(); } }
      // paddle
      const up = Math.min(1, s.paddle * 2);
      c.fillStyle = '#5a4a36'; c.fillRect(x + 30, y + 40 - up * 50, 3, 30);
      c.fillStyle = isHigh ? '#d6f08a' : '#efe6cf'; c.fillRect(x + 22, y + 22 - up * 50, 20, 18);
      txt(String(i + 1), x + 32, y + 35 - up * 50, 11, '#111', 'center', true);
      txt(s.name, x, 316, 11, isHigh ? '#d6f08a' : '#efe6cf', 'center', true, 108);
      txt(FNAME[s.faction] || s.faction, x, 328, 9, 'rgba(230,220,196,0.5)', 'center');
      if (s.mutterT > 0 && s.mutter) { c.globalAlpha = Math.min(1, s.mutterT * 2); c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(x - 54, 142, 108, 18); txt(s.mutter, x, 155, 10, '#ffb347', 'center', false, 104); c.globalAlpha = 1; }
    });
    // buttons
    for (const b of BTN) {
      const on = lot && (b.id !== 'chand' || (high && high !== 'chandelier')) && (b.id !== 'ask' || high);
      c.fillStyle = b.id === 'sold' ? (on ? '#c9a227' : '#3a3220') : b.id === 'chand' ? (on ? 'rgba(255,179,71,0.25)' : 'rgba(255,255,255,0.04)') : on ? 'rgba(232,197,71,0.16)' : 'rgba(255,255,255,0.04)';
      c.fillRect(b.x, b.y, b.w, b.h); c.strokeStyle = on ? '#e8c547' : '#444'; c.strokeRect(b.x, b.y, b.w, b.h);
      txt(b.label, b.x + b.w / 2, b.y + 22, 14, b.id === 'sold' && on ? '#0b0c0e' : on ? '#efe6cf' : '#666', 'center', true);
      const sub = b.id === 'ask' ? `+${money(step(Math.max(ask, highPrice)))}` : b.id === 'ask5' ? 'bigger, faster' : b.id === 'chand' ? 'bluff a bid' : 'hammer it now';
      txt(sub, b.x + b.w / 2, b.y + 38, 9, b.id === 'sold' && on ? '#0b0c0e' : 'rgba(230,220,196,0.55)', 'center');
    }
    if (bannerT > 0 && banner) { c.globalAlpha = Math.min(1, bannerT * 2); c.fillStyle = 'rgba(0,0,0,0.8)'; c.fillRect(0, 128, W, 28); txt(banner.s, W / 2, 147, 14, banner.col, 'center', true, W - 20); c.globalAlpha = 1; }
  }

  return { stop };
}
