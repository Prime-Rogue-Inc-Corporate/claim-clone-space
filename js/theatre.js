// Mercy Unlimited · Theatre 1. Steady hands. Extract what shouldn't be inside the patient,
// along the incision, without touching the sides. Vitals fall over time and every slip costs more.
// Finish a patient and the next is wheeled in. Lose one and Mercy's other department takes over.
// "Your death is our business."
import { T13 } from './economy.js';
import { makePerson } from './people.js';

const COOLDOWN_MS = 13 * 60 * 1000;
const W = 640, H = 400, SHIFT_S = 80;
const BODY = { cx: 250, cy: 220, rx: 150, ry: 150 };
export const SURGEON_GRADES = [
  ['Orderly', 0], ['Bedpan Technician', 100], ['Triage Nurse', 250], ['Ward Nurse', 450], ['Charge Nurse', 700], ['Junior Surgeon', 1000],
  ['Surgeon', 1400], ['Senior Surgeon', 1900], ['Chief of Surgery', 2500], ['Mortician-Surgeon (Dual Licence)', 3200],
  ['Director of Mercy', 4000], ['Saint (Billable)', 5000], ['Mercy Unlimited', 6500],
];
const OBJECTS = [
  ['a skiff number plate', '#9aa'], ['a Thursday ration brick', '#7a4a6a'], ['a smile pin (Bureau issue)', '#d6f08a'], ['a Null Sector citation', '#ff5a3a'],
  ['13 credits in coins', '#e8c547'], ['a scooter key', '#4fc3f7'], ['a Ministry stapler', '#b48cd6'], ['Wilco’s tennis ball', '#c8e04a'],
  ['shrapnel (Kessler, probably ore)', '#8a8a80'], ['a hymnal page', '#ff7a1f'], ['an unpaid invoice', '#efe6cf'], ['someone else’s dentures', '#f4f0e0'],
];
const STATUS = ['skiff collision (Spine Run, lap 3)', 'ate a Thursday', 'bought out', 'fell in the void (briefly)', 'Bureau smile mandate (overcompliance)', 'scooter wipeout'];

export function createTheatre({ world, econ, log = () => {}, esc, openModal, closeModal, emit = () => {}, board = null }) {
  const ST = econ.state;
  ST.theatre ||= { xp: 0, last: 0, best: 0, shifts: 0 };
  const T = ST.theatre;
  const blocks = world.spine.blocks || [];
  const b1 = blocks[0] || { x0: -20450, x1: -17530 };
  const SITE = { x: (b1.x0 + b1.x1) / 2 + 400, y: 1600 };
  const PAD = { x: SITE.x, y: SITE.y - 160 };
  const gradeOf = (xp = T.xp) => { let i = 0; SURGEON_GRADES.forEach(([, t], k) => { if (xp >= t) i = k; }); return i; };
  const left = () => Math.max(0, (T.last || 0) + COOLDOWN_MS - Date.now());
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawWorld(c, cam, time, near) {
    if (Math.abs(cam.x - SITE.x) > 2600 || Math.abs(cam.y - SITE.y) > 2600) return;
    const x0 = SITE.x - 240, y0 = SITE.y - 110;
    c.fillStyle = '#e6e8e6'; c.fillRect(x0, y0, 480, 240);
    c.fillStyle = '#c9cfcc'; for (let i = 0; i < 12; i++) c.fillRect(x0 + i * 40, y0 + 34, 1, 206);
    c.fillStyle = '#7a8a8a'; c.fillRect(x0 + 180, y0 + 100, 120, 40); // the table
    c.fillStyle = '#c8a890'; c.beginPath(); c.ellipse(x0 + 240, y0 + 120, 46, 14, 0, 0, 7); c.fill();
    const beat = (time / 900) % 1;
    c.strokeStyle = '#2bbf6a'; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i < 80; i++) { const xx = x0 + 340 + i * 1.5, ph = (i / 80 + beat) % 1; c.lineTo(xx, y0 + 70 - (ph > 0.45 && ph < 0.5 ? 18 : ph > 0.5 && ph < 0.53 ? -8 : 0)); }
    c.stroke();
    c.fillStyle = '#c0392b'; c.fillRect(x0, y0, 480, 34);
    c.fillStyle = '#fff'; c.font = 'bold 15px monospace'; c.textAlign = 'center';
    c.fillText('MERCY UNLIMITED · THEATRE 1', SITE.x, y0 + 23);
    c.font = '11px monospace'; c.fillStyle = 'rgba(230,220,196,0.8)';
    c.fillText('Your death is our business.', SITE.x, y0 + 256);
    c.strokeStyle = near ? '#e8c547' : 'rgba(192,57,43,0.9)'; c.lineWidth = 3;
    c.beginPath(); c.arc(PAD.x, PAD.y, near ? 26 + Math.sin(time / 200) * 3 : 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = near ? '#e8c547' : '#ff5a4a'; c.font = 'bold 12px monospace';
    c.fillText(near ? 'E' : 'SCRUB', PAD.x, PAD.y + 4);
  }
  const drawMinimap = (m, tx, ty) => { m.fillStyle = '#ff5a4a'; m.fillRect(tx(SITE.x) - 3, ty(SITE.y) - 3, 6, 6); };
  const near = (x, y, r) => Math.hypot(PAD.x - x, PAD.y - y) < r;
  const gigRows = () => [{ id: 'theatre', type: 'race', title: 'Theatre 1 · steady hands', sub: `${SURGEON_GRADES[gradeOf()][0]} · ${left() ? `paid again in ${fmt(left())}` : 'paid shift ready'}`, pay: left() ? 'practice' : '13–65', target: { ...PAD, label: 'Mercy Unlimited Theatre 1' } }];

  function open() {
    const g = gradeOf(), nx = SURGEON_GRADES[g + 1];
    openModal(
      `<h2>THEATRE 1</h2>
       <div class="sub">Mercy Unlimited · “Your death is our business.”</div>
       <div class="explain"><b>${esc(SURGEON_GRADES[g][0])}</b> · ${T.xp} merit${nx ? ` · next: ${esc(nx[0])} at ${nx[1]}` : ''} · best ${T.best || 0} · shifts ${T.shifts || 0}</div>
       <div class="explain">Things are inside patients that shouldn't be. <b>Press on an object and drag it out along its incision</b> to the edge of the body, <b>without touching the sides</b>.
         Touch the sides and the patient bucks: the object drops back and vitals take a hit. Vitals also fall on their own, so work steadily. Clear a patient and the next is wheeled in.
         If vitals hit zero, the patient is transferred to Mercy's <i>other</i> department (−20). ${SHIFT_S} seconds.<br/>
         <span class="sub">Phone: drag with your finger (the tweezers sit a little above your fingertip so you can see). PC: mouse.</span></div>
       <div class="buttons"><button class="primary" id="go">${left() ? `Practice (paid again in ${fmt(left())})` : 'Scrub in (13–65 scrap)'}</button><button id="x">Not today</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#go').addEventListener('click', play);
      }
    );
  }

  function play() {
    const paid = !left();
    openModal(
      `<div class="mil-wrap"><canvas id="theatre" width="${W}" height="${H}"></canvas></div>
       <div class="buttons"><button id="quit">Leave mid-operation (forfeit)</button></div>`,
      (el) => {
        const cv = el.querySelector('#theatre');
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
    const pay = paid ? econ.reward(Math.max(T13, Math.min(T13 * 5, Math.round(res.score / 2.6)))).amount : 0;
    if (paid) { T.last = Date.now(); T.xp += Math.max(0, res.score); T.shifts = (T.shifts || 0) + 1; }
    T.best = Math.max(T.best || 0, res.score);
    econ.save();
    const after = gradeOf();
    if (paid) log(`Theatre 1: ${res.extracted} objects removed, ${res.discharged} patients discharged, ${res.lost} transferred. +${pay} scrap.`, 'money');
    if (after > before) log(`PROMOTED: <b>${esc(SURGEON_GRADES[after][0])}</b>, Mercy Unlimited. Your death is still our business; now so is everyone else's.`, 'money');
    emit('theatre', { score: res.score, extracted: res.extracted, discharged: res.discharged, lost: res.lost, slips: res.slips, paid, grade: after, clean: res.discharged >= 2 && !res.slips && !res.lost });
    openModal(
      `<h2>${res.lost && !res.discharged ? 'TRANSFERRED TO THE OTHER DEPARTMENT' : 'SCRUBBED OUT'}</h2>
       <div class="sub">Theatre 1 · ${esc(SURGEON_GRADES[after][0])}${after > before ? ' <b style="color:#d6f08a">(PROMOTED)</b>' : ''}</div>
       <table>
         ${res.items.slice(0, 8).map((n) => `<tr><td>Removed: ${esc(n)}</td><td style="text-align:right;color:#d6f08a">+12</td></tr>`).join('')}
         ${res.items.length > 8 ? `<tr><td>…and ${res.items.length - 8} more</td><td style="text-align:right;color:#d6f08a">+${(res.items.length - 8) * 12}</td></tr>` : ''}
         ${res.discharged ? `<tr><td>Patients discharged (and billed) · ${res.discharged}</td><td style="text-align:right;color:#d6f08a">+${res.dischargePts}</td></tr>` : ''}
         ${res.slips ? `<tr><td>Slips (${res.slips})</td><td style="text-align:right;color:#ff7a5c">−${res.slips * 4}</td></tr>` : ''}
         ${res.lost ? `<tr><td>Transferred to the funerary department (${res.lost})</td><td style="text-align:right;color:#ff7a5c">−${res.lost * 20}</td></tr>` : ''}
         <tr><td><b>Total</b></td><td style="text-align:right"><b>${res.score}</b></td></tr></table>
       <div class="explain">${paid ? `Paid <b style="color:#d6f08a">+${pay} scrap</b> · +${Math.max(0, res.score)} merit` : `Practice: no pay, no merit. Paid again in ${fmt(left())}.`}
       ${res.lost ? '<br/><span class="sub">Mercy Unlimited thanks the deceased for their business. The Registry has been informed.</span>' : ''}
       ${board ? `<br/>${board.line('theatre')}` : ''}</div>
       <div class="buttons"><button class="primary" id="again">Again</button>${board ? '<button id="lb">Leaderboard</button>' : ''}<button id="desk">Theatre office</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#again').addEventListener('click', play);
        el.querySelector('#lb')?.addEventListener('click', () => board.open('theatre'));
        el.querySelector('#desk').addEventListener('click', open);
        el.querySelector('#x').addEventListener('click', closeModal);
      }
    );
  }

  return { drawWorld, drawMinimap, near, open, gigRows, pad: PAD, grade: () => SURGEON_GRADES[gradeOf()][0] };
}

// ---------- the operation ----------
const inBody = (x, y, pad = 0) => ((x - BODY.cx) / (BODY.rx - pad)) ** 2 + ((y - BODY.cy) / (BODY.ry - pad)) ** 2 <= 1;
function segDist(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L2));
  return Math.hypot(a.x + dx * t - px, a.y + dy * t - py);
}

function shift(c, cv, grade, done) {
  const width = Math.max(13, 22 - grade * 0.7);
  const res = { score: 0, extracted: 0, discharged: 0, dischargePts: 0, lost: 0, slips: 0, items: [] };
  let t = 0, stopped = false, patient = null, grab = null, tip = { x: 0, y: 0 }, buzz = 0, wheel = 0;
  const pops = [];
  const touchOffset = { v: 0 };

  function newPatient() {
    const p = makePerson(['sprawl', 'kessler', 'lastmile', 'gullet', 'cinder', 'ashiron', 'null'][Math.floor(Math.random() * 7)]);
    const n = Math.min(5, 3 + Math.floor(grade / 4) + (res.discharged >= 2 ? 1 : 0));
    const cavities = [];
    let guard = 0;
    while (cavities.length < n && guard++ < 200) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.55;
      const px = BODY.cx + Math.cos(a) * BODY.rx * r, py = BODY.cy + Math.sin(a) * BODY.ry * r;
      if (cavities.some((cv2) => Math.hypot(cv2.pocket.x - px, cv2.pocket.y - py) < 60)) continue;
      // a wandering incision out to the skin
      const pts = [{ x: px, y: py }];
      let dir = Math.atan2(py - BODY.cy, px - BODY.cx) + (Math.random() - 0.5) * 1.2;
      let x = px, y = py, k = 0;
      while (inBody(x, y, -8) && k++ < 40) {
        const segL = 26 + Math.random() * 22;
        dir += (Math.random() - 0.5) * (1.1 + grade * 0.03);
        const out = Math.atan2(y - BODY.cy, x - BODY.cx);
        let d = dir - out; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        dir = out + Math.max(-1.25, Math.min(1.25, d)); // keep heading outward overall
        x += Math.cos(dir) * segL; y += Math.sin(dir) * segL;
        pts.push({ x, y });
      }
      if (inBody(x, y, -8)) continue;
      const [name, col] = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
      cavities.push({ pocket: { x: px, y: py }, pts, name, col, out: false, obj: { x: px, y: py } });
    }
    patient = { name: p.name, age: p.age, why: STATUS[Math.floor(Math.random() * STATUS.length)], vitals: 100, cavities, hue: Math.floor(Math.random() * 30) };
    wheel = 0.8;
  }
  newPatient();

  const onPath = (cav, x, y) => Math.hypot(x - cav.pocket.x, y - cav.pocket.y) < 16 || cav.pts.some((p, i) => i && segDist(x, y, cav.pts[i - 1], p) <= width / 2);
  const exitOf = (cav) => cav.pts[cav.pts.length - 1];

  function slip(cav) {
    res.slips++; res.score -= 4; patient.vitals -= 9; buzz = 0.35;
    cav.obj = { ...cav.pocket };
    pops.push({ x: tip.x, y: tip.y - 14, s: 'BZZT · touched the sides', col: '#ff5a3a', t: 1 });
    grab = null;
  }

  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pd = (e) => {
    e.preventDefault(); cv.setPointerCapture?.(e.pointerId);
    touchOffset.v = e.pointerType === 'touch' ? 28 : 0; // keep the tweezers visible above a finger
    const p = pos(e); tip = { x: p.x, y: p.y - touchOffset.v };
    if (!patient || wheel > 0) return;
    const cav = patient.cavities.find((cv2) => !cv2.out && Math.hypot(cv2.obj.x - tip.x, cv2.obj.y - tip.y) < 18);
    if (cav) grab = cav;
  };
  const pm = (e) => {
    const p = pos(e); tip = { x: p.x, y: p.y - touchOffset.v };
    if (!grab) return;
    if (!onPath(grab, tip.x, tip.y)) return slip(grab);
    grab.obj = { x: tip.x, y: tip.y };
    const ex = exitOf(grab);
    if (Math.hypot(tip.x - ex.x, tip.y - ex.y) < width * 0.8) {
      grab.out = true; res.extracted++; res.score += 12; res.items.push(grab.name);
      pops.push({ x: ex.x, y: ex.y - 12, s: `+12 · ${grab.name}`, col: '#1f8f4a', t: 1.4 });
      grab = null;
      if (patient.cavities.every((cv2) => cv2.out)) {
        const pts = 10 + Math.round(patient.vitals / 4);
        res.discharged++; res.dischargePts += pts; res.score += pts;
        pops.push({ x: BODY.cx, y: BODY.cy, s: `DISCHARGED (and billed) +${pts}`, col: '#1f8f4a', t: 1.6 });
        newPatient();
      }
    }
  };
  const pu = () => { if (grab) grab.obj = { ...grab.obj }; grab = null; };
  cv.style.touchAction = 'none'; cv.style.cursor = 'none';
  cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
  const stop = () => { stopped = true; window.removeEventListener('pointerup', pu); };
  function end() { if (stopped) return; stop(); done(res); }
  cv.__debug = { get patient() { return patient; }, width };

  let last = performance.now();
  const tick = (now) => {
    if (stopped) return;
    if (!cv.isConnected) return stop();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    buzz = Math.max(0, buzz - dt); wheel = Math.max(0, wheel - dt);
    for (const p of pops) p.t -= dt;
    if (patient && wheel <= 0) {
      patient.vitals -= dt * (0.9 + grade * 0.05);
      if (patient.vitals <= 0) {
        res.lost++; res.score -= 20;
        pops.push({ x: BODY.cx, y: BODY.cy, s: 'TRANSFERRED TO FUNERARY −20', col: '#ff5a3a', t: 1.8 });
        grab = null; newPatient();
      }
    }
    if (t >= SHIFT_S) return end();
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function txt(s, x, y, size = 11, col = '#1d2224', align = 'left', bold = false, max) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${size}px monospace`; c.textAlign = align; c.fillText(s, x, y, max); }
  function draw() {
    const shake = buzz ? (Math.random() - 0.5) * 6 : 0;
    c.fillStyle = buzz ? '#f4d6d2' : '#dfe6e3'; c.fillRect(0, 0, W, H);
    c.save(); c.translate(shake, 0);
    // drape + patient
    c.fillStyle = '#5f8f86'; c.fillRect(70, 40, 360, 350);
    const slide = wheel > 0 ? (wheel / 0.8) * 420 : 0;
    c.save(); c.translate(-slide, 0);
    c.fillStyle = `hsl(${24 + (patient?.hue || 0)},38%,72%)`;
    c.beginPath(); c.ellipse(BODY.cx, BODY.cy, BODY.rx, BODY.ry, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(120,70,60,0.35)'; c.lineWidth = 2; c.stroke();
    if (patient) for (const cav of patient.cavities) {
      // incision channel
      c.strokeStyle = cav.out ? 'rgba(150,60,60,0.25)' : '#7a2e2e'; c.lineWidth = width + 4; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); cav.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
      c.strokeStyle = cav.out ? 'rgba(200,120,110,0.3)' : '#c46a5e'; c.lineWidth = width;
      c.beginPath(); cav.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
      c.fillStyle = cav.out ? 'rgba(200,120,110,0.3)' : '#b55a50'; c.beginPath(); c.arc(cav.pocket.x, cav.pocket.y, 17, 0, 7); c.fill();
      const ex = exitOf(cav);
      if (!cav.out) { c.strokeStyle = '#2bbf6a'; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.arc(ex.x, ex.y, width * 0.8, 0, 7); c.stroke(); c.setLineDash([]); }
      if (!cav.out) { c.fillStyle = cav.col; c.strokeStyle = '#222'; c.lineWidth = 1.5; c.beginPath(); c.rect(cav.obj.x - 8, cav.obj.y - 6, 16, 12); c.fill(); c.stroke(); }
    }
    c.restore();
    c.lineCap = 'butt'; c.lineJoin = 'miter';
    // tweezers
    c.strokeStyle = grab ? '#2bbf6a' : '#555'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(tip.x - 3, tip.y); c.lineTo(tip.x - 12, tip.y + 34); c.moveTo(tip.x + 3, tip.y); c.lineTo(tip.x + 12, tip.y + 34); c.stroke();
    c.fillStyle = '#222'; c.beginPath(); c.arc(tip.x, tip.y, 2.5, 0, 7); c.fill();
    c.restore();
    // monitor
    c.fillStyle = '#0c1210'; c.fillRect(448, 14, 180, 140);
    const v = Math.max(0, patient?.vitals || 0), col = v > 50 ? '#2bbf6a' : v > 25 ? '#ffd166' : '#ff5a3a';
    c.strokeStyle = col; c.lineWidth = 2; c.beginPath();
    const rate = 0.5 + (100 - v) / 80;
    for (let i = 0; i < 160; i++) { const ph = ((i / 160) * 3 + t * rate) % 1; c.lineTo(458 + i, 74 - (ph > 0.46 && ph < 0.5 ? 26 : ph > 0.5 && ph < 0.54 ? -12 : 0)); }
    c.stroke();
    txt(`VITALS ${Math.round(v)}%`, 458, 34, 13, col, 'left', true);
    c.fillStyle = '#222'; c.fillRect(458, 120, 160, 8); c.fillStyle = col; c.fillRect(458, 120, 1.6 * v, 8);
    txt(`${Math.max(0, Math.ceil(SHIFT_S - t))}s`, 618, 34, 12, '#9ab', 'right', true);
    if (patient) {
      txt('PATIENT', 448, 176, 10, '#5a6466', 'left', true);
      txt(patient.name, 448, 194, 12, '#1d2224', 'left', true, 180);
      txt(`age ${patient.age} · ${patient.why}`, 448, 210, 9, '#3a4446', 'left', false, 182);
      patient.cavities.forEach((cv2, i) => txt(`${cv2.out ? '✓' : '·'} ${cv2.name}`, 448, 232 + i * 15, 10, cv2.out ? '#2b8f5a' : '#1d2224', 'left', false, 182));
    }
    txt(`score ${res.score} · discharged ${res.discharged} · removed ${res.extracted}`, 448, 388, 10, '#3a4446', 'left', false, 186);
    for (const p of pops) if (p.t > 0) { c.globalAlpha = Math.min(1, p.t * 2); txt(p.s, Math.max(110, Math.min(400, p.x)), p.y - (1.4 - p.t) * 18, 12, p.col, 'center', true); }
    c.globalAlpha = 1;
  }

  return { stop };
}
