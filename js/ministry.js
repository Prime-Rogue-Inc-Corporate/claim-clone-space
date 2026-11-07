// Ministry of the Gentry · Allocation Annex. Approve or deny Tenure Heights applications against
// today's rules, which change daily and get amended mid-shift by Bulletin. "Equality, conveniently."
// Correct calls pay; wrong ones earn citations; three citations and your desk is reassigned.
import { T13 } from './economy.js';
import { makePerson } from './people.js';
import { mulberry32, hashStr } from './rng.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 90, BULLETIN_AT = 40;
export const CLERK_GRADES = [
  ['Temporary Clerk (Permanent)', 0], ['Clerk, Grade 13', 100], ['Clerk, Grade 12', 250], ['Senior Stamper', 450],
  ['Deputy Assistant to the Deputy', 700], ['Assistant Deputy', 1000], ['Allocation Officer', 1400], ['Senior Allocation Officer', 1900],
  ['Keeper of Forms', 2500], ['Director of Fairness', 3200], ['Commissioner of Convenience', 4000], ['Deputy Minister', 5000], ['Undersecretary for Equality', 6500],
];
const ORGS = ['vanta', 'kessler', 'ashiron', 'null', 'cinder', 'gullet', 'lastmile', 'gavel', 'mercy', 'assessor', 'registry', 'bureau'];
const ORG_NAMES = { vanta: 'Vantablack', kessler: 'Kessler', ashiron: 'Ash & Iron', null: 'Null Sector', cinder: 'Cinder', gullet: 'Gullet', lastmile: 'Last Mile', gavel: 'Gavel & Rope', mercy: 'Mercy', assessor: 'Assessor', registry: 'Registry', bureau: 'Bureau', sprawl: 'unemployed' };

// Each rule: short text, applies(app) → is it in force for this applicant, ok(app), fix(app), break(app)
function makeRules(banned) {
  return [
    { id: 'level', text: 'Residency level 0.07 or higher', ok: (a) => a.level >= 7, fix: (a) => { a.level = 7 + Math.floor(Math.random() * 7); }, brk: (a) => { a.level = Math.floor(Math.random() * 7); } },
    { id: 'gentry', text: 'Gentry only: must hold a lot or credits', ok: (a) => a.lots > 0 || a.credits > 0, fix: (a) => { if (!a.lots && !a.credits) a.credits = 13 + Math.floor(Math.random() * 400); }, brk: (a) => { a.lots = 0; a.credits = 0; a.bond = 5000 + Math.floor(Math.random() * 3) * 1000; } },
    { id: 'stmt', text: 'Credit statements dated within 13 days', ok: (a) => !(a.credits > 0) || a.stmtAge <= 13, fix: (a) => { a.stmtAge = Math.floor(Math.random() * 13); }, brk: (a) => { if (!a.credits) a.credits = 50 + Math.floor(Math.random() * 300); a.stmtAge = 14 + Math.floor(Math.random() * 60); } },
    { id: 'form13', text: 'Skiff numbers ending in 3 need Form 13-B', ok: (a) => a.skiff % 10 !== 3 || a.form13, fix: (a) => { if (a.skiff % 10 === 3) a.form13 = true; }, brk: (a) => { a.skiff = a.skiff - (a.skiff % 10) + 3; a.form13 = false; } },
    { id: 'banned', text: `No ${ORG_NAMES[banned]} employees today`, ok: (a) => a.faction !== banned, fix: (a) => { if (a.faction === banned) a.faction = ORGS.find((o) => o !== banned); }, brk: (a) => { a.faction = banned; } },
    { id: 'age', text: 'Applicants must be 26 or older', ok: (a) => a.age >= 26, fix: (a) => { if (a.age < 26) a.age = 26 + Math.floor(Math.random() * 50); }, brk: (a) => { a.age = 18 + Math.floor(Math.random() * 8); } },
    { id: 'name', text: 'Name on the deed must match the ID', ok: (a) => a.deedName === a.name, fix: (a) => { a.deedName = a.name; }, brk: (a) => { a.deedName = misspell(a.name); } },
    { id: 'smile', text: 'Applicant must be smiling (Bureau mandate)', ok: (a) => a.smile, fix: (a) => { a.smile = true; }, brk: (a) => { a.smile = false; } },
    { id: 'dog', text: 'Dogs listed as dependants need Form W', ok: (a) => !a.dog || a.formW, fix: (a) => { if (a.dog) a.formW = true; }, brk: (a) => { a.dog = true; a.formW = false; } },
  ];
}
function misspell(n) {
  const i = 1 + Math.floor(Math.random() * (n.length - 2));
  const swaps = { a: 'e', e: 'a', o: 'u', u: 'o', i: 'y', y: 'i', n: 'm', m: 'n', l: 'll', r: 'rr' };
  const ch = n[i].toLowerCase();
  if (swaps[ch]) return n.slice(0, i) + swaps[ch] + n.slice(i + 1);
  return n.slice(0, i) + n[i + 1] + n[i] + n.slice(i + 2);
}

export function createMinistry({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const S = econ.state;
  S.annex ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const A = S.annex;
  const blocks = world.spine.blocks || [];
  const b10 = blocks[9] || { x0: 8050, x1: 10910 };
  const SITE = { x: (b10.x0 + b10.x1) / 2 - 500, y: -1550 };
  const PAD = { x: SITE.x, y: SITE.y + 150 };
  const gradeOf = (xp = A.xp) => { let i = 0; CLERK_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (A.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 150;
    c.fillStyle = '#1a1622'; c.fillRect(x0, y0, 480, 240);
    c.strokeStyle = '#b48cd6'; c.globalAlpha = 0.6; c.lineWidth = 4; c.strokeRect(x0, y0, 480, 240); c.globalAlpha = 1;
    for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(180,140,214,0.15)'; c.fillRect(x0 + 30 + i * 72, y0 + 60, 50, 110); } // booths
    for (let i = 0; i < 9; i++) { c.fillStyle = '#6b6457'; c.beginPath(); c.arc(x0 + 40 + i * 48, y0 + 205 + Math.sin(time / 600 + i) * 2, 9, 0, 7); c.fill(); } // the queue
    c.fillStyle = '#b48cd6'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#0b0c0e'; c.font = 'bold 14px monospace'; c.textAlign = 'center';
    c.fillText('MINISTRY OF THE GENTRY · ALLOCATION ANNEX', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.7)';
    c.fillText('Equality, conveniently. Please wait to be equal.', SITE.x, y0 - 10);
    c.strokeStyle = near ? '#e8c547' : 'rgba(180,140,214,0.7)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#b48cd6'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'CLERK', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#b48cd6'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'annex', type: 'stamp', title: 'Allocation Annex · approve or deny', sub: `${CLERK_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Ministry Allocation Annex' } }];

  function open() {
    const g = gradeOf(), nx = CLERK_GRADES[g + 1];
    openModal(
      `<h2>ALLOCATION ANNEX</h2>
       <div class="sub">Ministry of the Gentry · Tenure Heights applications · “Equality, conveniently.”</div>
       <div class="explain"><b>${esc(CLERK_GRADES[g][0])}</b> · ${A.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${A.best || 0} · shifts ${A.shifts || 0}</div>
       <div class="explain">Applicants want a unit in Tenure Heights. Check their papers against <b>today's rules</b> (they change every day, and the Bureau amends them mid-shift). <b>APPROVE</b> or <b>DENY</b>; when you deny, cite the rule they broke for a bonus.
         Right call +10 (+5 for the right citation). Wrong call: a citation, −15. Three citations and your desk is reassigned. ${SHIFT_S} seconds.</div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Take your seat (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="annex" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Leave your post (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#annex');
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
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 2.5)))).amount : 0;
    if (paid) { A.last = Date.now(); A.xp += Math.max(0, res.score); A.shifts = (A.shifts || 0) + 1; }
    A.best = Math.max(A.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Allocation Annex: ${res.processed} applicants, ${res.citations} citation${res.citations === 1 ? '' : 's'}, ${res.score} points. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(CLERK_GRADES[after][0])}</b>, Ministry of the Gentry. Equality has been conveniently served.`, 'money');
    emit('annex', { score: res.score, processed: res.processed, citations: res.citations, reassigned: res.reassigned, paid, grade: after, perfect: res.processed >= 13 && !res.citations });
    openModal(
      `<h2>${res.reassigned ? 'DESK REASSIGNED' : 'END OF SHIFT'}</h2>
       <div class="sub">Allocation Annex · ${esc(CLERK_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <div class="explain" style="font-size:14px">Applicants processed: <b>${res.processed}</b> · approved ${res.approved} · denied ${res.denied}<br/>
       Correct citations: ${res.cited} · <span style="color:${res.citations ? '#ff7a5c' : '#d6f08a'}">citations against you: ${res.citations}</span><br/>
       Score <b>${res.score}</b>${res.mistakes.length ? `<div class="sub" style="margin-top:6px">${res.mistakes.slice(0, 4).map((m) => esc(m)).join('<br/>')}</div>` : ''}<br/>
       ${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${board ? `<br/>${board.line('annex')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Annex office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('annex'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => CLERK_GRADES[gradeOf()][0] };
}

// ---------- the shift ----------
function shift(c, cv, grade, done) {
  const day = new Date().toISOString().slice(0, 10);
  const rng = mulberry32(hashStr(`annex:${day}`));
  const banned = ORGS[Math.floor(rng() * ORGS.length)];
  const pool = makeRules(banned);
  const order = [...pool].sort(() => rng() - 0.5);
  const rules = order.slice(0, Math.min(5, 3 + Math.floor(grade / 4)));
  const bulletinRule = order[rules.length];
  let bulletinShown = false, bulletinT = 0;

  let t = 0, stopped = false, app = null, stamp = null, stampT = 0, picking = false, flash = null, flashT = 0;
  const res = { score: 0, processed: 0, approved: 0, denied: 0, cited: 0, citations: 0, mistakes: [], reassigned: false };

  function newApp() {
    const fac = Math.random() < 0.2 ? 'sprawl' : ORGS[Math.floor(Math.random() * ORGS.length)];
    const p = makePerson(fac);
    const a = {
      name: p.name, deedName: p.name, age: p.age, faction: fac, job: p.job, skiff: 1 + Math.floor(Math.random() * 998),
      level: Math.floor(Math.random() * 14), lots: Math.random() < 0.45 ? 1 + Math.floor(Math.random() * 3) : 0, credits: 0, stmtAge: 0, bond: 0,
      form13: Math.random() < 0.15, dog: Math.random() < 0.18, formW: false, smile: Math.random() < 0.85, hue: Math.floor(Math.random() * 360),
    };
    if (!a.lots) a.credits = Math.random() < 0.7 ? 13 + Math.floor(Math.random() * 600) : 0;
    a.stmtAge = Math.floor(Math.random() * 30);
    if (a.dog) a.formW = Math.random() < 0.6;
    for (const r of rules) r.fix(a);
    a.bad = null;
    if (Math.random() < 0.48) { const r = rules[Math.floor(Math.random() * rules.length)]; r.brk(a); a.bad = r.id; }
    // a fixed rule can be broken again by another fix/break; recompute the truth
    a.violations = rules.filter((r) => !r.ok(a)).map((r) => r.id);
    return a;
  }
  app = newApp();

  function decide(approve, reason = null) {
    if (!app || stopped) return;
    const ok = app.violations.length === 0;
    res.processed++;
    if (approve) res.approved++; else res.denied++;
    if (approve === ok) {
      res.score += 10;
      if (!approve && reason && app.violations.includes(reason)) { res.score += 5; res.cited++; }
      flash = { s: approve ? 'APPROVED · correct' : reason && app.violations.includes(reason) ? 'DENIED · correct citation' : 'DENIED · correct', c: '#d6f08a' };
    } else {
      res.score -= 15; res.citations++;
      const why = approve ? `Approved ${app.name}: broke “${rules.concat(bulletinShown ? [bulletinRule] : []).find((r) => app.violations.includes(r.id))?.text}”` : `Denied ${app.name}, who was eligible`;
      res.mistakes.push(why);
      flash = { s: `CITATION: ${approve ? 'should have denied' : 'should have approved'}`, c: '#ff7a5c' };
    }
    flashT = 1.1;
    stamp = approve ? 'APPROVED' : 'DENIED'; stampT = 0.6;
    picking = false;
    if (res.citations >= 3) { res.reassigned = true; return end(); }
    app = null;
    setTimeout(() => { if (!stopped) app = newApp(); }, 450);
  }

  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const BTN = { ok: { x: 14, y: 346, w: 190, h: 44 }, no: { x: 214, y: 346, w: 190, h: 44 } };
  const inB = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const reasonBoxes = () => active().map((r, i) => ({ r, x: 130, y: 94 + i * 36, w: 380, h: 31 })).concat([{ r: null, x: 130, y: 94 + active().length * 36, w: 380, h: 28 }]);
  const active = () => (bulletinShown ? [...rules, bulletinRule] : rules);
  const pd = (e) => {
    e.preventDefault();
    const p = pos(e);
    if (picking) {
      const hit = reasonBoxes().find((b) => inB(p, b));
      if (hit) decide(false, hit.r?.id || null); else picking = false;
      return;
    }
    if (!app) return;
    if (inB(p, BTN.ok)) decide(true);
    else if (inB(p, BTN.no)) picking = true;
  };
  const kd = (e) => {
    if (picking) { const n = parseInt(e.key, 10); if (n >= 1 && n <= active().length) decide(false, active()[n - 1].id); else if (e.key === '0' || e.key === 'Enter') decide(false, null); else if (e.key === 'Escape') { e.stopImmediatePropagation(); picking = false; } return; }
    if (e.key === 'a' || e.key === 'ArrowLeft') decide(true);
    if (e.key === 'd' || e.key === 'ArrowRight') picking = true;
  };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', pd);
  window.addEventListener('keydown', kd, true);
  const stop = () => { stopped = true; window.removeEventListener('keydown', kd, true); };
  function end() { if (stopped) return; stop(); done(res); }

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    flashT = Math.max(0, flashT - dt); stampT = Math.max(0, stampT - dt); bulletinT = Math.max(0, bulletinT - dt);
    if (!bulletinShown && t >= BULLETIN_AT && bulletinRule) {
      bulletinShown = true; bulletinT = 3;
      rules.push(bulletinRule);
      if (app) app.violations = rules.filter((r) => !r.ok(app)).map((r) => r.id);
    }
    if (t >= SHIFT_S) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#efe6cf', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function card(x, y, w, h, title, col) { c.fillStyle = '#e9dfc6'; c.fillRect(x, y, w, h); c.fillStyle = col; c.fillRect(x, y, w, 16); txt(title, x + 6, y + 12, 10, '#0b0c0e', 'left', true); }

  function draw() {
    c.fillStyle = '#17141d'; c.fillRect(0, 0, W, H);
    // header
    txt('ALLOCATION ANNEX · TENURE HEIGHTS', 14, 20, 12, '#b48cd6', 'left', true);
    txt(`${Math.max(0, Math.ceil(SHIFT_S - t))}s · processed ${res.processed} · score ${res.score} · citations ${'✖'.repeat(res.citations)}${'·'.repeat(3 - res.citations)}`, 14, 36, 11, 'rgba(230,220,196,0.75)');
    // booth: the applicant
    c.fillStyle = '#231e2b'; c.fillRect(14, 46, 120, 150);
    if (app) {
      const fx = 74, fy = 112;
      c.fillStyle = `hsl(${app.hue},18%,${app.faction === 'sprawl' ? 34 : 46}%)`; c.fillRect(fx - 40, fy + 30, 80, 60); // shoulders
      c.fillStyle = `hsl(${(app.hue + 30) % 360},25%,62%)`; c.beginPath(); c.ellipse(fx, fy, 26, 32, 0, 0, 7); c.fill();
      c.fillStyle = '#1a1a1a'; c.fillRect(fx - 12, fy - 8, 6, 4); c.fillRect(fx + 6, fy - 8, 6, 4);
      c.strokeStyle = '#1a1a1a'; c.lineWidth = 2; c.beginPath();
      if (app.smile) c.arc(fx, fy + 8, 10, 0.15 * Math.PI, 0.85 * Math.PI); else { c.moveTo(fx - 9, fy + 14); c.lineTo(fx + 9, fy + 14); }
      c.stroke();
      if (app.dog) { c.fillStyle = '#7a5230'; c.beginPath(); c.ellipse(fx + 40, fy + 70, 14, 9, 0, 0, 7); c.fill(); c.beginPath(); c.arc(fx + 52, fy + 62, 6, 0, 7); c.fill(); }
      txt(app.smile ? 'smiling' : 'not smiling', 74, 190, 9, 'rgba(230,220,196,0.6)', 'center');
    } else txt('NEXT!', 74, 125, 14, '#b48cd6', 'center', true);
    // documents
    if (app) {
      card(144, 46, 260, 96, 'RESIDENT ID', '#b48cd6');
      txt(app.name, 152, 76, 13, '#111', 'left', true, 244);
      txt(`Age ${app.age} · Skiff #${String(app.skiff).padStart(3, '0')}`, 152, 94, 11, '#222');
      txt(`Employer: ${ORG_NAMES[app.faction]}${app.faction !== 'sprawl' ? ` (${app.job})` : ''}`, 152, 110, 10, '#222', 'left', false, 244);
      txt(`Residency level 0.${String(app.level).padStart(2, '0')}`, 152, 128, 11, '#222');
      const deedTitle = app.lots ? 'LAND REGISTRY · DEED' : app.credits ? 'CREDIT STATEMENT' : 'SPRAWL REGISTRY';
      card(144, 150, 260, 74, deedTitle, '#c9a227');
      txt(`Holder: ${app.deedName}`, 152, 180, 11, '#111', 'left', true, 244);
      if (app.lots) txt(`Lots held: ${app.lots} (Spine)`, 152, 198, 11, '#222');
      else if (app.credits) { txt(`Credits: $${app.credits.toFixed(2)}`, 152, 198, 11, '#222'); txt(`Dated ${app.stmtAge} day${app.stmtAge === 1 ? '' : 's'} ago`, 152, 214, 11, app.stmtAge > 13 ? '#8a2a1a' : '#222'); }
      else { txt('No lots. No credits.', 152, 198, 11, '#8a2a1a'); txt(`Rent bond posted: ${app.bond || 0} scrap`, 152, 214, 10, '#222'); }
      let fx = 144;
      const tag = (label, on) => { c.fillStyle = on ? '#d6f08a' : 'rgba(255,255,255,0.06)'; c.fillRect(fx, 232, 82, 26); txt(label, fx + 41, 249, 10, on ? '#111' : 'rgba(230,220,196,0.35)', 'center', true); fx += 89; };
      tag('FORM 13-B', app.form13); tag('FORM W', app.formW); tag(app.dog ? 'DOG: 1' : 'DOG: 0', app.dog);
    }
    // today's rules
    c.fillStyle = '#211c29'; c.fillRect(414, 46, 214, 290);
    txt(`TODAY'S RULES · ${day}`, 422, 64, 10, '#b48cd6', 'left', true);
    rules.forEach((r, i) => {
      const isNew = bulletinShown && r === bulletinRule;
      const y = 84 + i * 46;
      c.fillStyle = isNew ? 'rgba(255,179,71,0.15)' : 'rgba(255,255,255,0.03)'; c.fillRect(420, y - 12, 202, 40);
      txt(`${i + 1}.`, 424, y + 2, 11, isNew ? '#ffb347' : '#e8c547', 'left', true);
      wrap(r.text, 442, y + 2, 176, 12, isNew ? '#ffb347' : '#efe6cf');
    });
    // buttons
    const btn = (b, label, col) => { c.fillStyle = col; c.globalAlpha = app && !picking ? 1 : 0.35; c.fillRect(b.x, b.y, b.w, b.h); c.globalAlpha = 1; txt(label, b.x + b.w / 2, b.y + 28, 15, '#0b0c0e', 'center', true); };
    btn(BTN.ok, 'APPROVE (A)', '#7fd17f'); btn(BTN.no, 'DENY (D)', '#ff7a5c');
    txt('Unhoused applicants need a', 418, 352, 9, 'rgba(230,220,196,0.5)'); txt('5,000-scrap rent bond (lore).', 418, 364, 9, 'rgba(230,220,196,0.5)');
    // stamp + feedback
    if (stampT > 0) { c.save(); c.translate(274, 120); c.rotate(-0.18); c.globalAlpha = Math.min(1, stampT * 3); c.strokeStyle = stamp === 'APPROVED' ? '#2e8b3e' : '#b3261e'; c.lineWidth = 4; c.strokeRect(-90, -24, 180, 48); txt(stamp, 0, 10, 26, stamp === 'APPROVED' ? '#2e8b3e' : '#b3261e', 'center', true); c.restore(); }
    if (flashT > 0 && flash) { c.globalAlpha = Math.min(1, flashT * 2); c.fillStyle = "rgba(0,0,0,0.75)"; c.fillRect(14, 300, 390, 36); txt(flash.s, 209, 323, 12, flash.c, 'center', true); c.globalAlpha = 1; }
    if (bulletinT > 0) { c.fillStyle = 'rgba(255,179,71,0.92)'; c.fillRect(0, H / 2 - 30, W, 52); txt('BUREAU BULLETIN · EFFECTIVE IMMEDIATELY', W / 2, H / 2 - 8, 13, '#0b0c0e', 'center', true); txt(bulletinRule.text, W / 2, H / 2 + 12, 12, '#0b0c0e', 'center', false, W - 20); }
    // deny: pick the reason
    if (picking) {
      c.fillStyle = 'rgba(10,8,14,0.92)'; c.fillRect(110, 56, 420, 290);
      txt('DENY ON WHAT GROUNDS?', 320, 82, 13, '#ff7a5c', 'center', true);
      for (const b of reasonBoxes()) {
        c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(b.x, b.y, b.w, b.h); c.strokeStyle = 'rgba(255,122,92,0.5)'; c.strokeRect(b.x, b.y, b.w, b.h);
        txt(b.r ? `${active().indexOf(b.r) + 1}. ${b.r.text}` : '0. No reason (it’s just a feeling)', b.x + 10, b.y + b.h / 2 + 4, 11, b.r ? '#efe6cf' : 'rgba(230,220,196,0.6)', 'left', false, b.w - 20);
      }
      txt('tap outside to go back', 320, 336, 9, 'rgba(230,220,196,0.5)', 'center');
    }
  }
  function wrap(s, x, y, w, lh, col) {
    c.font = '10px monospace'; const words = s.split(' '); let line = '', yy = y;
    for (const wd of words) { const tl = line ? `${line} ${wd}` : wd; if (c.measureText(tl).width > w && line) { txt(line, x, yy, 10, col); line = wd; yy += lh; } else line = tl; }
    if (line) txt(line, x, yy, 10, col);
  }

  return { stop };
}
