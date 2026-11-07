// Civic Warmth™ (K): the Bureau of Public Cheer's friendly score. See js/citizen.js for the rules.
// Today: a number, a tier, a daily ledger, the Most Humane Citizen of the Day, and a certificate.
// Later (roadmap): consequences.
import { WARMTH_START, WARMTH_MAX, WARMTH_RULES, warmthTier, citizenOfDay, today } from './citizen.js';

const LABELS = {
  delivery: 'freight delivered', shift: 'worked a good shift', shuttle: 'Humane Shuttle run', stamp: 'residency stamp', processed: 'fully processed',
  'track-lap': 'clean lap', lap: 'Spine Run lap', hut: 'home built', scrape: 'scraped a wall with cargo or passengers',
  late: 'late delivery', 'wrong-way': 'drove a circuit backwards', bailed: 'abandoned cargo', jack: 'jacked a ship',
  escape: 'evaded the authorities', expired: 'stolen ship remote-killed', busted: 'busted by Null Sector',
  'passenger-incident': 'passengers evacuated your shuttle',
  'shuttle-abandon': 'abandoned a shuttle route',
  'vip-killed': 'a VIP died on your shuttle',
  'vip-delivered': 'delivered a VIP in comfort',
  'passengers-dumped': 'put passengers off between stops',
  'void-dump': 'dumped a busload of passengers into space',
  wipeout: 'crashed a rental scooter',
  juiced: 'recharged scooters for the common good',
};

export function createWarmth({ econ, log, esc, openModal, closeModal, skiff = '#001' }) {
  const S = econ.state;
  if (typeof S.warmth !== 'number') S.warmth = WARMTH_START;
  const day = () => {
    const d = today();
    if (!S.warmthDay || S.warmthDay.day !== d) S.warmthDay = { day: d, gained: 0, lost: 0, best: S.warmthDay?.best || null, log: [] };
    return S.warmthDay;
  };

  // returns the change applied (0 if the Bureau doesn't care)
  function apply(type, data = {}) {
    const rule = WARMTH_RULES[type];
    if (!rule) return 0;
    const delta = rule(data);
    if (!delta) return 0;
    const before = S.warmth;
    S.warmth = Math.max(0, Math.min(WARMTH_MAX, S.warmth + delta));
    const d = day();
    if (delta > 0) d.gained += delta; else d.lost -= delta;
    d.log.unshift({ t: Date.now(), delta, why: LABELS[type] || type });
    d.log.length = Math.min(d.log.length, 13);
    econ.save();
    if (Math.abs(delta) >= 5) log(`${delta > 0 ? '☀' : '❄'} Civic Warmth ${delta > 0 ? '+' : ''}${delta} · ${esc(LABELS[type] || type)}. ${delta > 0 ? 'The Bureau of Public Cheer thanks you.' : 'The Bureau of Public Cheer is disappointed.'}`, delta > 0 ? 'good' : '');
    if (warmthTier(before) !== warmthTier(S.warmth)) log(`Civic Warmth tier: <b>${warmthTier(S.warmth)}</b>.`, 'money');
    return delta;
  }

  const citizen = () => citizenOfDay(today());
  // Without a server we can't rank real pilots. Locally: beat today's pick's gain and you'd have been it.
  const wouldWin = () => day().gained > citizen().gained;

  function openPanel() {
    const d = day(), c = citizen();
    const rows = d.log.map((e) => `<tr><td style="width:48px;color:${e.delta > 0 ? '#d6f08a' : '#ff5a3a'}">${e.delta > 0 ? '+' : ''}${e.delta}</td><td>${esc(e.why)}</td><td class="sub" style="text-align:right">${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td></tr>`).join('');
    const pct = Math.round((S.warmth / WARMTH_MAX) * 100);
    openModal(
      `<h2>CIVIC WARMTH™ · ${S.warmth} · ${warmthTier(S.warmth).toUpperCase()}</h2>
       <div class="sub">Administered by the Bureau of Public Cheer. Contributing to society warms it. Degeneracy cools it.</div>
       ${S.souls?.count ? `<div class="sub">☠ Souls lost on your watch: <b>${S.souls.count}</b>${S.souls.vips ? ` (${S.souls.vips} VIP)` : ''}. The Registry never forgets. Neither does the Bureau.</div>` : ''}
       <div class="warmbar"><i style="width:${pct}%"></i></div>
       <div class="explain"><b>★ Most Humane Citizen of the Day</b> (${esc(c.day)}): <b>${esc(c.name)}</b>, skiff ${esc(c.skiff)}, Civic Warmth ${c.warmth}, who ${esc(c.deed)} (+${c.gained} today).<br/><br/>
       You today: <b>+${d.gained}</b> / −${d.lost}. ${wouldWin() ? '<b style="color:#d6f08a">You out-warmed today’s pick.</b> Once accounts exist, that makes you Most Humane Citizen of the Day.' : `Gain more than +${c.gained} today to out-warm the pick.`}</div>
       <table>${rows || '<tr><td class="sub">Nothing on today’s record yet.</td></tr>'}</table>
       <div class="sub">Warms you: deliveries (more if undamaged), Humane Shuttle runs (more if smooth and on time), residency stamps, building a home.<br/>
       Cools you: jacking ships, evading or getting busted by Null Sector, abandoning cargo, late deliveries, wall-scraping, driving circuits backwards, upsetting shuttle passengers.<br/>
       <i>What warmth actually gets you (and costs you) comes later.</i></div>
       <div class="buttons"><button class="primary" id="cert" ${wouldWin() ? '' : 'disabled'}>Print my certificate</button><button id="x">Close</button></div>
       <div class="sub">Certificates by e-mail (opt-in) and paper copies (for purchase) come with accounts.</div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#cert').addEventListener('click', () => printCertificate());
      }
    );
  }

  function printCertificate() {
    const d = day();
    const w = window.open('', '_blank', 'width=900,height=650');
    if (!w) return log('Pop-up blocked. Allow pop-ups to print your certificate.');
    w.document.write(`<!DOCTYPE html><html><head><title>Certificate of Exemplary Humanity</title><style>
      body{margin:0;background:#f3ecd8;font-family:Georgia,serif;color:#2a2318}
      .c{margin:36px;border:10px double #8a6d2b;padding:48px 64px;text-align:center;min-height:440px}
      h1{font-size:34px;letter-spacing:.08em;margin:6px 0}h2{font-weight:normal;font-style:italic;margin:4px 0 26px}
      .n{font-size:30px;border-bottom:1px solid #8a6d2b;display:inline-block;padding:0 40px 6px;margin:18px 0}
      .s{display:flex;justify-content:space-around;margin-top:48px;font-size:13px}.s div{border-top:1px solid #2a2318;padding-top:6px;width:220px}
      .f{font-size:11px;color:#6b5d40;margin-top:28px}@media print{button{display:none}}</style></head><body>
      <div class="c"><div>THE BUREAU OF PUBLIC CHEER</div><h1>CERTIFICATE OF EXEMPLARY HUMANITY</h1><h2>Most Humane Citizen of the Day</h2>
      <div>This certifies that the pilot of</div><div class="n">Skiff ${esc(skiff)}</div>
      <div>gained <b>+${d.gained}</b> Civic Warmth™ on ${esc(d.day)}, reaching <b>${S.warmth}</b> (${esc(warmthTier(S.warmth))}),<br/>and is hereby recognised as a credit to the Spine, the Sprawls and the void between.</div>
      <div class="s"><div>Director of Public Cheer</div><div>Registrar of Skiffs &amp; Souls</div></div>
      <div class="f">SpaceSquat · pre-pre-alpha · simulated · this certificate confers no rights, privileges or warmth</div>
      <button onclick="print()" style="margin-top:18px">Print / save as PDF</button></div></body></html>`);
    w.document.close();
  }

  return { apply, openPanel, value: () => S.warmth, tier: () => warmthTier(S.warmth), citizen, today: () => day() };
}
