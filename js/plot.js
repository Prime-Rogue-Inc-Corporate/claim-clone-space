// Your plot in the Sprawl: every hut tier unlocks one thing (data/plot-unlocks.json).
// Cosmetic unlocks = pick a preset option (never branding). Allotment fixtures = a guaranteed minimum
// of the (still to be decided) allotment resource per real day, banked up to 13 days, collected at the hut.
import { mulberry32, hashStr, randInt } from './rng.js';
const DAY = 24 * 3600 * 1000;
const WINDOW = 13 * 60 * 1000; // magnetic weather changes every 13 minutes
const ODDITIES = ['a bent spoon', 'a dead patrol drone (still twitching)', 'somebody’s dentures', 'a Null Sector badge', 'a ration brick, unopened', 'half a skiff number plate', 'a Bureau smile pin', 'a single roller skate', 'a cracked Spine Run trophy', 'a love letter, rusted shut', 'a Ministry stapler', 'a goat bell (no goat)', 'thirteen identical keys'];

export function createPlot({ econ, data, log, esc, sprites, neighbours = () => ({ collectors: 0, detectors: 0 }), conditions = () => ({ bulletin: 1, drops: 0 }), emit = () => {} }) {
  const S = econ.state;
  const D = data || { resource: { id: 'allotment', name: 'Allotment', unit: 'units', tbd: true, bankDays: 13 }, unlocks: [] };
  const R = D.resource;
  S.resources ||= {};
  S.plot ||= { choices: {}, last: Date.now(), banked: 0 };
  S.plot.magnet ||= { pile: 0, lastW: Math.floor(Date.now() / WINDOW), lastCollect: Date.now(), odd: [] };
  const M = D.unlocks.find((u) => u.kind === 'magnet');

  const tier = () => (S.hut ? S.hut.tier : -1);
  const unlocked = () => D.unlocks.filter((u) => u.tier <= tier());
  const rate = () => unlocked().filter((u) => u.kind === 'allotment').reduce((n, u) => n + (u.min || 0), 0); // per day
  const choice = (u) => S.plot.choices[u.id] ?? u.options?.[1]?.[0] ?? u.options?.[0]?.[0];
  const k = () => unlocked().filter((u) => u.k).reduce((m, u) => m * (u.k[choice(u)] || 1), 1);

  // accrue the guaranteed minimum since we last looked
  function accrue(now = Date.now()) {
    const r = rate();
    const dt = Math.max(0, now - (S.plot.last || now));
    S.plot.last = now;
    if (!r) return;
    S.plot.banked = Math.min(r * k() * (R.bankDays || 13), (S.plot.banked || 0) + (r * k() * dt) / DAY);
  }
  function collect() {
    accrue();
    const n = Math.floor(S.plot.banked || 0);
    if (!n) return 0;
    S.plot.banked -= n;
    S.resources[R.id] = (S.resources[R.id] || 0) + n;
    econ.save();
    log(`📦 Collected ${n} ${esc(R.unit)} of ${esc(R.name)}${R.tbd ? ' (what it is, and what it’s for, is still being decided)' : ''}. Total: ${S.resources[R.id]}.`, 'good');
    return n;
  }
  // called after a hut upgrade: announce what the new tier unlocked
  function onTier(t) {
    accrue();
    const u = D.unlocks.find((x) => x.tier === t);
    if (!u) return;
    if (u.kind === 'magnet') return log(`🏠 Unlocked on your plot: <b>${esc(u.name)}</b>. It pulls scrap out of the air while you're away. Neighbours' magnets compete, their detectors resonate, the weather does what it wants, and it rusts if you ignore it. Collect at your hut.`, 'money');
    if (u.hint) return log(`🏠 Unlocked on your plot: <b>${esc(u.name)}</b>. ${esc(u.hint)} Choose at your hut (E).`, 'money');
    log(u.kind === 'cosmetic'
      ? `🏠 Unlocked on your plot: <b>${esc(u.name)}</b>. Pick a style at your hut (E).`
      : `🏠 Unlocked on your plot: <b>${esc(u.name)}</b>. +${u.min} ${esc(R.unit)}/day of ${esc(R.name)}, guaranteed. Collect at your hut.`, 'money');
  }

  // ---- the scrap magnet ----
  // Simulated in 13-minute windows (seeded by window + your site), so it runs while you're away and
  // reloading can't reroll it. Field = base × hut tier × weather × bulletin × nearby drops,
  // divided among competing neighbour magnets, boosted by neighbour detectors. Random surges and
  // oddities. Rust eats the pile, much faster once you've left it alone for 13 hours.
  const hasMagnet = () => M && tier() >= M.tier;
  function field(w, site) {
    const nb = neighbours(site), cond = conditions();
    const wr = mulberry32(hashStr(`magnet-weather:${w}`));
    const weather = 0.4 + wr() * 1.5; // shared by everyone: some windows are just magnetic
    const t = 1 + (M.tierBoost || 0) * Math.max(0, tier());
    const compete = 1 / (1 + (M.compete || 0) * nb.collectors);
    const resonate = 1 + (M.resonate || 0) * nb.detectors;
    const drops = 1 + 0.2 * Math.min(3, cond.drops || 0);
    return { weather, t, compete, resonate, drops, bulletin: cond.bulletin || 1, nb, perWindow: ((M.baseRatePerHour || 6) * WINDOW) / 3600000 * weather * t * compete * resonate * drops * (cond.bulletin || 1) * k() };
  }
  function runMagnet(site, now = Date.now()) {
    if (!hasMagnet() || !site) return;
    const g = S.plot.magnet;
    const to = Math.floor(now / WINDOW);
    let w = Math.max(g.lastW + 1, to - Math.round((13 * DAY) / WINDOW)); // at most 13 days of catch-up
    for (; w <= to; w++) {
      const f = field(w, site);
      const rng = mulberry32(hashStr(`magnet:${S.hut.site}:${w}`));
      let gain = f.perWindow * (0.6 + rng() * 0.8);
      if (rng() < (M.surgeChance || 0)) gain += Math.round(randInt(rng, M.surge[0], M.surge[1]) * f.compete * f.resonate * k());
      if (rng() < (M.oddityChance || 0)) g.odd = [ODDITIES[Math.floor(rng() * ODDITIES.length)], ...(g.odd || [])].slice(0, 6);
      const idleH = (w * WINDOW - g.lastCollect) / 3600000;
      const rust = idleH > (M.rustAfterHours || 13) ? M.rustPerWindow || 0.02 : M.decayPerWindow || 0.003;
      g.pile = Math.min((M.pileCap || 169) * k(), Math.max(0, g.pile * (1 - rust) + gain));
    }
    g.lastW = to;
  }
  function collectMagnet(site) {
    runMagnet(site);
    const g = S.plot.magnet;
    const n = Math.floor(g.pile);
    const odd = g.odd || [];
    g.pile -= n;
    g.lastCollect = Date.now();
    g.odd = [];
    if (n) econ.reward(n);
    econ.save();
    log(`🧲 Scrap magnet: +${n} scrap${odd.length ? `, plus ${odd.map(esc).join(', ')} (worthless, kept)` : ''}.`, 'good');
    emit('magnet', { n, odd: odd.length });
    return n;
  }
  function magnetHtml(site) {
    if (!hasMagnet()) return '';
    runMagnet(site);
    const g = S.plot.magnet, f = field(Math.floor(Date.now() / WINDOW), site);
    const idleH = (Date.now() - g.lastCollect) / 3600000;
    const pct = (x) => `${x >= 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`;
    // note: the house-number factor is folded into the total and never itemised
    return `<h3>🧲 SCRAP MAGNET</h3>
      <div class="explain">Pile: <b>${Math.floor(g.pile)} scrap</b> · ~${((f.perWindow * 60) / 13).toFixed(1)} scrap/hour right now.<br/>
      Magnetic weather ${pct(f.weather)} · hut tier ${pct(f.t)} · ${f.nb.collectors} neighbour magnet${f.nb.collectors === 1 ? '' : 's'} competing ${pct(f.compete)} · ${f.nb.detectors} detector${f.nb.detectors === 1 ? '' : 's'} resonating ${pct(f.resonate)} · nearby drops ${pct(f.drops)}${f.bulletin !== 1 ? ` · bulletin ${pct(f.bulletin)}` : ''}.<br/>
      ${idleH > (M.rustAfterHours || 13) ? `<b style="color:#ff5a3a">Rusting:</b> left alone ${Math.floor(idleH)} h, losing ~${Math.round((M.rustPerWindow || 0.02) * 100)}% every 13 minutes.` : `Uncollected for ${idleH < 1 ? `${Math.round(idleH * 60)} min` : `${idleH.toFixed(1)} h`}. Rust speeds up after ${M.rustAfterHours} h.`}
      ${(g.odd || []).length ? `<br/>Also stuck to it: ${g.odd.map(esc).join(', ')}.` : ''}</div>
      <div class="buttons"><button class="primary" id="magnet" ${Math.floor(g.pile) || (g.odd || []).length ? '' : 'disabled'}>Collect the magnet</button></div>`;
  }

  // section for the hut modal (your own hut)
  function section(site) {
    accrue();
    const rows = D.unlocks.map((u) => {
      const open = u.tier <= tier();
      if (!open) return `<tr class="sub"><td>🔒 ${esc(u.name)}</td><td style="text-align:right">tier ${u.tier + 1}${u.kind === 'allotment' ? ` · +${u.min}/day` : ''}</td></tr>`;
      if (u.kind === 'magnet') return `<tr><td><b>${esc(u.name)}</b> <span class="sub">· pulls in scrap; neighbours and weather matter; rusts if ignored</span></td><td style="text-align:right">see above</td></tr>`;
      if (u.kind === 'cosmetic') {
        return `<tr><td><b>${esc(u.name)}</b>${u.hint ? `<div class="sub" style="margin:2px 0 0">${esc(u.hint)}</div>` : ''}</td><td style="text-align:right">${u.options.map(([id, label]) => `<button data-pc="${u.id}:${id}" class="${choice(u) === id ? 'primary' : ''}">${esc(label)}</button>`).join(' ')}</td></tr>`;
      }
      return `<tr><td><b>${esc(u.name)}</b> <span class="sub">· allotment fixture</span></td><td style="text-align:right">+${+(u.min * k()).toFixed(1)} ${esc(R.unit)}/day</td></tr>`;
    }).join('');
    const banked = Math.floor(S.plot.banked || 0);
    return `${magnetHtml(site)}<h3>YOUR PLOT</h3>
      <div class="sub">Each hut tier unlocks something. Cosmetics are preset (huts are never branded). Allotment fixtures guarantee a minimum of <b>${esc(R.name)}</b>${R.tbd ? ' (resource still to be decided)' : ''}: ${+(rate() * k()).toFixed(1)} ${esc(R.unit)}/day now, banked up to ${R.bankDays} days.</div>
      <table>${rows}</table>
      <div class="buttons"><button id="collect" ${banked ? '' : 'disabled'}>Collect ${banked} ${esc(R.unit)}</button><span class="sub">You have ${S.resources[R.id] || 0}.</span></div>`;
  }
  function bind(el, rerender, site) {
    el.querySelector('#magnet')?.addEventListener('click', () => { collectMagnet(site); rerender(); });
    el.querySelectorAll('[data-pc]').forEach((b) => b.addEventListener('click', () => {
      const [id, opt] = b.dataset.pc.split(':');
      S.plot.choices[id] = opt;
      econ.save();
      rerender();
    }));
    el.querySelector('#collect')?.addEventListener('click', () => { collect(); rerender(); });
  }

  // draw the unlocked fixtures around your hut (world space)
  const LIGHT = { amber: 'rgba(255,190,90,0.35)', blue: 'rgba(110,170,255,0.35)', red: 'rgba(255,70,50,0.35)' };
  const FLAG = { white: '#e6dcc4', black: '#111', amber: '#e8c547', green: '#6f8f3a' };
  function draw(c, site, time) {
    if (!site) return;
    const on = new Set(unlocked().map((u) => u.id));
    const spr = (n) => sprites?.get(n);
    const put = (name, dx, dy, size) => { const img = spr(name); if (img) c.drawImage(img, site.x + dx - size / 2, site.y + dy - size / 2, size, size * (img.height / img.width)); };
    const ch = (id) => choice(D.unlocks.find((u) => u.id === id));
    if (on.has('porchlight') && ch('porchlight') !== 'off') {
      const g = c.createRadialGradient(site.x, site.y + 30, 2, site.x, site.y + 30, 70);
      g.addColorStop(0, LIGHT[ch('porchlight')] || LIGHT.amber);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(site.x, site.y + 30, 70, 0, Math.PI * 2); c.fill();
    }
    if (on.has('magnet')) {
      // a horseshoe magnet on a pole, sparking, with a pile of whatever it caught
      const mx = site.x - 30, my = site.y - 44;
      c.strokeStyle = '#b8382a'; c.lineWidth = 6;
      c.beginPath(); c.arc(mx, my, 10, Math.PI, 0); c.stroke();
      c.fillStyle = '#cfd8dc'; c.fillRect(mx - 13, my, 6, 6); c.fillRect(mx + 7, my, 6, 6);
      c.strokeStyle = '#777'; c.lineWidth = 2; c.beginPath(); c.moveTo(mx, my - 10); c.lineTo(mx, my - 22); c.stroke();
      if (Math.floor(time / 180) % 4 === 0) { c.strokeStyle = 'rgba(160,220,255,0.8)'; c.beginPath(); c.moveTo(mx - 10, my + 7); c.lineTo(mx - 2 + Math.random() * 6, my + 16); c.lineTo(mx + 10, my + 7); c.stroke(); }
      const pile = Math.floor(S.plot.magnet.pile || 0);
      if (pile) put('junk', -30, -18, Math.min(34, 10 + pile / 4));
    }
    if (on.has('number')) {
      const NUM = { white: '#e6dcc4', red: '#ff5a3a', amber: '#e8c547', green: '#6fcf5a', blue: '#5aa9ff', black: '#111' };
      c.font = 'bold 13px monospace';
      c.textAlign = 'center';
      c.lineWidth = 3;
      c.strokeStyle = ch('number') === 'black' ? '#c9b38a' : 'rgba(0,0,0,0.7)';
      const label = site.id.split('-')[1];
      c.strokeText(label, site.x + 22, site.y + 4);
      c.fillStyle = NUM[ch('number')] || NUM.white;
      c.fillText(label, site.x + 22, site.y + 4);
    }
    if (on.has('rainbarrel')) put('barrel_0', -44, 6, 20);
    if (on.has('laundry') && ch('laundry') !== 'none') put('laundry', 0, -48, 56);
    if (on.has('burnbarrel')) put(`barrel_${Math.floor(time / 140) % 3}`, 44, 6, 20);
    if (on.has('planter')) put('planter', -36, 30, 26);
    if (on.has('scrubber')) put('deck_scrubber', 52, -22, 26);
    if (on.has('rationcrate')) put('drop_cargo', 36, 34, 22);
    if (on.has('dish')) put('dish', -54, -26, 30);
    if (on.has('battery')) put('junk', -60, 20, 22);
    if (on.has('flag')) {
      c.strokeStyle = '#999'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(site.x + 62, site.y + 10); c.lineTo(site.x + 62, site.y - 40); c.stroke();
      c.fillStyle = FLAG[ch('flag')] || FLAG.white;
      const wave = Math.sin(time / 300) * 2;
      c.fillRect(site.x + 62, site.y - 40 + wave, 18, 11);
    }
    if (on.has('garden')) put('deck_garden', 0, 64, 52);
  }

  return { accrue, collect, onTier, section, bind, draw, rate: () => rate() * k(), resource: R, amount: () => S.resources[R.id] || 0, magnetPile: (site) => { runMagnet(site); return hasMagnet() ? Math.floor(S.plot.magnet.pile) : 0; }, magnetRusting: () => hasMagnet() && (Date.now() - S.plot.magnet.lastCollect) / 3600000 > (M?.rustAfterHours || 13) };
}
