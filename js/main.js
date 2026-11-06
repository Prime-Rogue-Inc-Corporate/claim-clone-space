import { mulberry32 } from './rng.js';
import { createEconomy, takeoverPrice, buildPrice, levelFor, xpForLevel, sightRadius, PLAYER } from './economy.js';
import { solids, collide, plotPad, sectorName, dropsForWindow, decorations, DROP_WINDOW_MS, flyBounds, sprawlSites, hutRect, hutPad, region } from './world.js';
import { createLoops } from './loops.js';
import { loadSprites } from './sprites.js';
import { KINDS, makeShip, fly, speedOf, makeTraffic, steerNpc } from './entities.js';
import { drawScene, drawMinimap, makeStars } from './render.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `$${Math.round(n).toLocaleString()}`;

const DEFAULT_BULLETIN = { day: 'offline', event: { id: 'calm', label: 'No bulletin', dropMultiplier: 1, headline: 'Bulletin relay offline.' }, featuredPlot: null };

async function loadJSON(url, fallback) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    return fallback;
  }
}

async function boot() {
  const world = await loadJSON('data/world.json', null);
  if (!world) {
    document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#e8c547">Could not load data/world.json. Serve this folder over HTTP (npm run serve), not file://</div>');
    return;
  }
  const [bulletin, sprites] = await Promise.all([loadJSON('data/bulletin.json', DEFAULT_BULLETIN), loadSprites()]);
  start(world, bulletin, sprites);
}

function start(world, bulletin, sprites) {
  const econ = createEconomy(world);
  const S = econ.state;
  const rng = mulberry32((Date.now() & 0xffffffff) >>> 0);
  // ---- the Sprawl ----
  const sprawl = sprawlSites(world);
  const hutOf = (site) => {
    if (S.hut && S.hut.site === site.id) return { tier: S.hut.tier, mine: true };
    if (site.squatter) return { tier: site.npcTier, mine: false, who: site.squatter.toUpperCase() };
    return null;
  };
  const hutRects = () => sprawl.sites.filter(hutOf).map((s) => hutRect(s, hutOf(s).tier));
  const rects = () => [...solids(world), ...hutRects()]; // geometry changes when lots/huts are built
  let solidCache = rects();
  const FLY = flyBounds(world);

  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const mctx = $('minimap').getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- entities ----
  const homeSite = S.hut && sprawl.sites.find((s) => s.id === S.hut.site);
  const spawn = homeSite ? { x: hutPad(homeSite).x, y: hutPad(homeSite).y + 60, a: -Math.PI } : { x: 0, y: 640, a: -Math.PI / 2 };
  const myShip = makeShip('skiff', spawn.x, spawn.y, spawn.a);
  const ships = [myShip, ...world.parked.map((p) => makeShip(p.kind, p.x, p.y, p.angle)), ...makeTraffic(rng, world.corps, 12)];
  const player = { mode: 'ship', ship: myShip, eva: null };
  const me = () => (player.mode === 'ship' ? player.ship : player.eva);

  const cam = { x: myShip.x, y: myShip.y, zoom: 1 };
  const deco = decorations(world);
  const stars = makeStars();
  const particles = [];
  let waypoint = null;

  // ---- input ----
  const keys = new Set();
  let modalOpen = false;
  window.addEventListener('keydown', (e) => {
    if (modalOpen) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
    const k = e.key.toLowerCase();
    if (!keys.has(k)) onPress(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  function inputState() {
    return {
      up: keys.has('w') || keys.has('arrowup'),
      down: keys.has('s') || keys.has('arrowdown'),
      left: keys.has('a') || keys.has('arrowleft'),
      right: keys.has('d') || keys.has('arrowright'),
      brake: keys.has(' '),
    };
  }

  // ---- log / prompts ----
  function log(msg, cls = '') {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = msg;
    $('log').appendChild(el);
    while ($('log').children.length > 6) $('log').firstChild.remove();
    setTimeout(() => (el.style.opacity = '0'), 9000);
    setTimeout(() => el.remove(), 10000);
  }

  $('bulletin').innerHTML = `<b>CORP BULLETIN ${esc(bulletin.day)}</b> · ${esc(bulletin.event.headline)}${bulletin.event.dropMultiplier !== 1 ? ` · drops ×${bulletin.event.dropMultiplier}` : ''}`;

  const loops = createLoops({ world, econ, log, rng, player, esc, getSolids: () => solidCache, bust, sprites });

  // ---- drops ----
  let windowIndex = -1;
  let drops = [];
  function refreshDrops(now) {
    const w = Math.floor(now / DROP_WINDOW_MS);
    if (w === windowIndex) return;
    windowIndex = w;
    drops = dropsForWindow(world, w, bulletin.event.dropMultiplier);
    const fresh = drops.filter((d) => !S.claimedDrops[d.key]);
    if (fresh.length === 1) {
      const d = fresh[0];
      log(`💩 ${esc(d.creature)} ${esc(d.verb)} near <b>${sectorName(world, d.x, d.y)}</b>. ${d.amount} scrap in the ${esc(d.noun)}.`, 'good');
    } else if (fresh.length) {
      const d = fresh[0];
      const where = fresh.map((x) => sectorName(world, x.x, x.y)).join(', ');
      log(`💩 ${esc(d.creature)} ${esc(d.verb)}, and it's catching. ${fresh.length} drops out there: <b>${where}</b>.`, 'good');
    }
  }
  let hold = { drop: null, progress: 0 };

  // ---- interactions ----
  let nearPlot = null;
  let nearHut = null;
  let nearDrop = null;
  let boardable = null;

  function onPress(k) {
    if (k === 'h') return openHelp();
    if (k === 'tab') return openLedger();
    if (k === 'f') return toggleBoard();
    if (k === 'x') return loops.onKey('x', performance.now());
    if (k === 'e' && !nearDrop && nearPlot) return openPlot(nearPlot);
    if (k === 'e' && !nearDrop && nearHut) return openHut(nearHut);
  }

  // Busted by Corp drones: ship impounded, you're on EVA.
  function bust() {
    const body = me();
    if (player.mode === 'ship') {
      const i = ships.indexOf(player.ship);
      if (i >= 0) ships.splice(i, 1);
      player.eva = makeShip('eva', body.x, body.y + 30, body.angle);
      player.ship = null;
      player.mode = 'eva';
    }
  }

  function toggleBoard() {
    if (player.mode === 'ship') {
      const s = player.ship;
      if (speedOf(s) > 2.5) return log('Too fast to bail. Brake first (SPACE).');
      const off = KINDS[s.kind].radius + 12;
      player.eva = makeShip('eva', s.x + Math.cos(s.angle + Math.PI / 2) * off, s.y + Math.sin(s.angle + Math.PI / 2) * off, s.angle);
      player.mode = 'eva';
      player.ship = null;
      log('EVA. Suit integrity nominal. Probably.');
    } else if (boardable) {
      const s = boardable;
      if (s.npc) {
        const corp = econ.corpsById[s.corp];
        log(`You jacked a ${esc(corp?.name || 'corp')} ${KINDS[s.kind].label.toLowerCase()}. The pilot has been… relocated.`);
        loops.onJack(performance.now());
        s.npc = false;
        s.ai = null;
      } else {
        log(`Boarded ${KINDS[s.kind].label.toLowerCase()}.`);
      }
      player.ship = s;
      player.eva = null;
      player.mode = 'ship';
    }
  }

  // ---- economy events ----
  econ.on((type, p) => {
    if (type === 'lost') showLost(p);
    if (type === 'bought') log(`You now hold <b>${esc(p.plot.brand?.name)}</b> (Lot ${p.plot.id}) for ${money(p.price)}.`, 'money');
    if (type === 'market' && p.plot.owner !== PLAYER) {
      if (rng() < 0.35) log(`MARKET: ${esc(econ.ownerName(p.buyer))} took Lot ${p.plot.id} for ${money(p.plot.value)}.`);
    }
    solidCache = rects();
  });
  let nextMarket = performance.now() + 30000 + rng() * 30000;

  // ---- modal helpers ----
  function openModal(html, bind) {
    $('panel').innerHTML = html;
    $('modal').hidden = false;
    modalOpen = true;
    keys.clear();
    bind?.($('panel'));
  }
  function closeModal() {
    $('modal').hidden = true;
    modalOpen = false;
  }
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) closeModal();
  });

  function historyTable(p) {
    if (!p.history.length) return '<div class="sub">No history. Nobody has ever wanted this lot.</div>';
    const rows = [...p.history].reverse().map((h) => {
      const when = h.t > 1e9 ? new Date(h.t).toLocaleTimeString() : `epoch ${h.t}`;
      const what = h.kind === 'build' ? `Built by ${esc(econ.ownerName(h.to))}` : `${esc(econ.ownerName(h.to))} bought out ${esc(econ.ownerName(h.from))}`;
      return `<tr class="${h.to === PLAYER || h.from === PLAYER ? 'mine' : ''}"><td>${when}</td><td>${what}</td><td>${money(h.price)}</td></tr>`;
    });
    return `<table><tr><th>When</th><th>What</th><th>Price</th></tr>${rows.join('')}</table>`;
  }

  function riskBox() {
    if (S.acceptedRisk) return '';
    return `<label class="check"><input type="checkbox" id="risk" /> <span><b>I understand:</b> anyone can buy this from me at any time, at the posted price. I can't refuse. I get paid in <b>credits, not cash</b>, and credits can only be spent here.</span></label>`;
  }

  function payLine(q) {
    if (!q.affordable) return `<div class="err">You have ${money(S.credits)} credits + ${money(S.cash)} cash. Short by ${money(q.total - S.credits - S.cash)}.</div>`;
    return `You pay <b>${money(q.fromCredits)}</b> from credits${q.fromCash ? ` + <b>${money(q.fromCash)}</b> cash` : ''}.`;
  }

  function openPlot(p) {
    const owner = econ.ownerName(p.owner);
    const mine = p.owner === PLAYER;
    let action = '';
    if (!p.owner) {
      action = `
        <h3>BUILD</h3>
        <div class="field"><span>Floors: <b id="fl-n">25</b> × $5 = <b id="fl-p">${money(buildPrice(25))}</b></span><input type="range" id="floors" min="1" max="100" value="25" /></div>
        <div class="explain" id="explain"></div>
        ${riskBox()}
        <div class="buttons"><button class="primary" id="go">Build</button><button id="x">Close</button></div>
        <div class="err" id="err"></div>`;
    } else if (mine) {
      action = `
        <div class="explain">This is yours. <b>Anyone can buy it from you right now for ${money(takeoverPrice(p))}.</b>
        If they do, you get <b>${money(takeoverPrice(p))} in credits</b> instantly, and you can buy it back or spend the credits on any other lot.</div>
        <div class="buttons"><button class="primary" id="brand">Edit branding</button><button id="x">Close</button></div>`;
    } else {
      const price = takeoverPrice(p);
      const q = econ.quote(price);
      action = `
        <div class="explain">
          <b>Buy it now: ${money(price)}</b> (1.25 × current value ${money(p.value)}).<br/>
          ${payLine(q)}<br/>
          ${esc(owner)} gets ${money(price)} in credits. Nobody can refuse.<br/>
          After you buy, anyone can take it from you for <b>${money(Math.round(price * 1.25))}</b>, and you'd get that much back in credits.
        </div>
        ${riskBox()}
        <div class="buttons"><button class="primary" id="go" ${q.affordable ? '' : 'disabled'}>Buy out ${esc(owner)}</button><button id="x">Close</button></div>
        <div class="err" id="err"></div>`;
    }
    const b = p.brand;
    openModal(
      `<h2>${esc(b?.name || `Lot ${p.id}`)}</h2>
       <div class="sub">LOT ${p.id} · ${p.side} side · ${sectorName(world, p.x, p.side === 'north' ? -200 : 200)}${b?.tagline ? ` · “${esc(b.tagline)}”` : ''}</div>
       <div class="grid">
         <span class="k">Owner</span><span>${esc(owner)}</span>
         <span class="k">Height</span><span>${p.floors || 0} floors</span>
         <span class="k">Current value</span><span>${money(p.value)}</span>
         <span class="k">Buy-out price</span><span>${p.owner ? money(takeoverPrice(p)) : '—'}</span>
         <span class="k">Times bought out</span><span>${p.history.filter((h) => h.kind === 'takeover').length}</span>
         ${b?.link ? `<span class="k">Link</span><span><a href="${esc(b.link)}" target="_blank" rel="noopener nofollow ugc">${esc(b.link)}</a></span>` : ''}
       </div>
       ${action}
       <h3>FULL OWNERSHIP LEDGER</h3>
       ${historyTable(p)}`,
      (el) => {
        el.querySelector('#x')?.addEventListener('click', closeModal);
        el.querySelector('#brand')?.addEventListener('click', () => openBrand(p));
        const risk = el.querySelector('#risk');
        const go = el.querySelector('#go');
        const slider = el.querySelector('#floors');
        const updateBuild = () => {
          const n = Number(slider.value);
          const q = econ.quote(buildPrice(n));
          el.querySelector('#fl-n').textContent = n;
          el.querySelector('#fl-p').textContent = money(q.total);
          el.querySelector('#explain').innerHTML = `${payLine(q)}<br/>Once built, anyone can buy it from you for <b>${money(Math.round(q.total * 1.25))}</b>, and you'd get that much back in credits.`;
          go.dataset.afford = q.affordable ? '1' : '';
          sync();
        };
        const sync = () => {
          if (!go) return;
          const okRisk = S.acceptedRisk || (risk && risk.checked);
          const afford = slider ? go.dataset.afford === '1' : econ.quote(takeoverPrice(p)).affordable;
          go.disabled = !(okRisk && afford);
        };
        risk?.addEventListener('change', sync);
        if (slider) {
          slider.addEventListener('input', updateBuild);
          updateBuild();
        } else sync();
        go?.addEventListener('click', () => {
          if (risk?.checked) {
            S.acceptedRisk = true;
            econ.save();
          }
          const res = p.owner ? econ.takeover(p) : econ.build(p, Number(slider.value));
          if (!res.ok) {
            el.querySelector('#err').textContent = res.reason;
            return;
          }
          openPlot(p);
        });
      }
    );
  }

  function openBrand(p) {
    if (!S.brandConsent) {
      openModal(
        `<h2>Before you brand</h2>
         <div class="explain">Everything you type here is <b>public</b>. Every player sees it, and it's stored on our servers while the lot is yours.
         Don't put personal information here you don't want public. You can edit or clear it any time, and it's replaced when someone buys you out.
         Links must be https://.</div>
         <label class="check"><input type="checkbox" id="consent" /> <span>I understand and consent to publishing what I enter.</span></label>
         <div class="buttons"><button class="primary" id="ok" disabled>Continue</button><button id="x">Cancel</button></div>`,
        (el) => {
          const c = el.querySelector('#consent');
          c.addEventListener('change', () => (el.querySelector('#ok').disabled = !c.checked));
          el.querySelector('#ok').addEventListener('click', () => {
            S.brandConsent = true;
            econ.save();
            openBrand(p);
          });
          el.querySelector('#x').addEventListener('click', () => openPlot(p));
        }
      );
      return;
    }
    const b = p.brand || {};
    openModal(
      `<h2>Brand Lot ${p.id}</h2>
       <div class="sub">Public. Editable any time. Owners only.</div>
       <div class="field"><span>Name (32)</span><input type="text" id="b-name" maxlength="32" value="${esc(b.name)}" /></div>
       <div class="field"><span>Tagline (80)</span><input type="text" id="b-tag" maxlength="80" value="${esc(b.tagline)}" /></div>
       <div class="field"><span>Roof colour</span><input type="color" id="b-color" value="${esc(b.color || '#c9a227')}" /></div>
       <div class="field"><span>Link (https:// only)</span><input type="url" id="b-link" maxlength="200" value="${esc(b.link)}" placeholder="https://" /></div>
       <div class="buttons"><button class="primary" id="save">Save</button><button id="clear">Clear everything</button><button id="x">Cancel</button></div>`,
      (el) => {
        const val = (id) => el.querySelector(id).value;
        el.querySelector('#save').addEventListener('click', () => {
          econ.brand(p, { name: val('#b-name'), tagline: val('#b-tag'), color: val('#b-color'), link: val('#b-link') });
          openPlot(p);
        });
        el.querySelector('#clear').addEventListener('click', () => {
          econ.brand(p, { name: '', tagline: '', color: '#c9a227', link: '' });
          openPlot(p);
        });
        el.querySelector('#x').addEventListener('click', () => openPlot(p));
      }
    );
  }

  function showLost({ plot, price, buyer, buyback, credits }) {
    const topUp = Math.max(0, buyback - credits);
    openModal(
      `<h2>BOUGHT OUT</h2>
       <div class="sub">${esc(econ.ownerName(buyer))} bought <b>${esc(plot.brand?.name)}</b> (Lot ${plot.id}) for ${money(price)}.</div>
       <div class="explain">
         <b>+${money(price)} credits</b> added to your account. Credit balance: <b>${money(credits)}</b>.<br/><br/>
         Your options:<br/>
         1. <b>Buy it back</b> for ${money(buyback)}: your credits cover ${money(Math.min(credits, buyback))}${topUp ? `, you top up <b>${money(topUp)}</b>` : ', no top-up needed'}.<br/>
         2. <b>Buy a cheaper lot</b> with your credits.<br/>
         3. Keep the credits for later. They don't expire.
       </div>
       <div class="buttons"><button class="primary" id="wp">Set waypoint to it</button><button id="x">OK</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#wp').addEventListener('click', () => {
          waypoint = plotPad(world, plot);
          closeModal();
        });
      }
    );
  }

  function openHut(site) {
    const occ = hutOf(site);
    const T = econ.HUT_TIERS;
    let body;
    if (occ && !occ.mine) {
      body = `<div class="explain">${esc(site.squatter)} lives here in a ${T[occ.tier].name.toLowerCase()}. Squatters' rights are the only rights out here. Find a vacant site.</div>
              <div class="buttons"><button id="x">Leave</button></div>`;
    } else if (occ && occ.mine) {
      const next = T[S.hut.tier + 1];
      body = `<div class="explain">Your ${T[S.hut.tier].name.toLowerCase()}. Free players' housing: built with scrap, never branded, no logos, no links. You respawn here when you load in.</div>
              ${next ? `<div>Upgrade to <b>${next.name}</b>: ${next.cost} scrap (you have ${S.scrap}).</div>` : '<div>Bunker. Top tier.</div>'}
              <div class="buttons">${next ? `<button class="primary" id="up" ${S.scrap >= next.cost ? '' : 'disabled'}>Upgrade</button>` : ''}<button id="x">Close</button></div>
              <div class="err" id="err"></div>`;
    } else {
      body = `<div class="explain">Vacant. Build a <b>${T[0].name.toLowerCase()}</b> for <b>${T[0].cost} scrap</b> (you have ${S.scrap}).
              Scrap only: no cash, no credits. One hut per pilot. Huts can't be branded or bought out, and they're yours while you play.</div>
              ${S.hut ? `<div class="err">You already have a hut at ${esc(S.hut.site)}.</div>` : ''}
              <div class="buttons"><button class="primary" id="build" ${!S.hut && S.scrap >= T[0].cost ? '' : 'disabled'}>Build</button><button id="x">Close</button></div>
              <div class="err" id="err"></div>`;
    }
    openModal(`<h2>SITE ${esc(site.id)}</h2><div class="sub">The Sprawl · residential</div>${body}`, (el) => {
      el.querySelector('#x')?.addEventListener('click', closeModal);
      const after = (res) => {
        if (!res.ok) return (el.querySelector('#err').textContent = res.reason);
        solidCache = rects();
        log(`Home sweet hovel: ${esc(econ.HUT_TIERS[S.hut.tier].name)} at ${esc(site.id)}.`, 'money');
        openHut(site);
      };
      el.querySelector('#build')?.addEventListener('click', () => after(econ.buildHut(site.id)));
      el.querySelector('#up')?.addEventListener('click', () => after(econ.upgradeHut()));
    });
  }

  function openLedger() {
    const claimed = world.plots.filter((p) => p.owner).sort((a, b) => b.value - a.value);
    const total = claimed.reduce((s, p) => s + p.value, 0);
    const changes = world.plots.reduce((s, p) => s + p.history.filter((h) => h.kind === 'takeover').length, 0);
    const rows = claimed
      .map((p) => `<tr class="click ${p.owner === PLAYER ? 'mine' : ''}" data-id="${p.id}"><td>${p.id}</td><td>${esc(p.brand?.name)}</td><td>${esc(econ.ownerName(p.owner))}</td><td>${money(p.value)}</td><td>${money(takeoverPrice(p))}</td><td>${p.history.filter((h) => h.kind === 'takeover').length}</td></tr>`)
      .join('');
    openModal(
      `<h2>THE LEDGER</h2>
       <div class="sub">Every lot, every price, every buy-out. Market value ${money(total)} · ${changes} ownership changes · ${world.plots.length - claimed.length} lots unclaimed. Click a row to set a waypoint.</div>
       <div class="explain"><b>The rules, all of them:</b> new lots cost $5 per floor. Any lot can be bought for 1.25× its current value; the owner can't refuse and gets the full price back as credits.
       Credits pay first, cash tops up. Credits never expire and never turn into cash. Scrap and levels are game-only.</div>
       <table><tr><th>Lot</th><th>Name</th><th>Owner</th><th>Value</th><th>Buy-out</th><th>Flips</th></tr>${rows}</table>
       <div class="buttons"><button id="x">Close</button><button id="reset">Wipe my save</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#reset').addEventListener('click', () => confirm('Wipe local save?') && econ.reset());
        el.querySelectorAll('tr.click').forEach((tr) =>
          tr.addEventListener('click', () => {
            waypoint = plotPad(world, econ.plotById(Number(tr.dataset.id)));
            closeModal();
          })
        );
      }
    );
  }

  function openHelp() {
    openModal(
      `<h2>SPACESQUAT · CONTROLS</h2>
       <div class="grid">
         <span class="k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows</span><span>Thrust and turn</span>
         <span class="k"><kbd>SHIFT</kbd></span><span>Boost</span>
         <span class="k"><kbd>SPACE</kbd></span><span>Brake</span>
         <span class="k"><kbd>F</kbd></span><span>Bail out / board any parked or slow ship (yes, NPC ones too)</span>
         <span class="k"><kbd>E</kbd></span><span>At a lot's pad: open the terminal. At a drop: hold to claim.</span>
         <span class="k"><kbd>X</kbd></span><span>Decline / abandon a freight job</span>
         <span class="k"><kbd>TAB</kbd></span><span>The ledger: every lot and price</span>
         <span class="k"><kbd>H</kbd></span><span>This screen</span>
       </div>
       <h3>THE GAME</h3>
       <div>Fly the Spine. Hunt drops: when something craps out a load of scrap, the first pilot to reach it and hold <kbd>E</kbd> gets it.
       Scrap gives XP; levels widen your sight radius, the only edge anyone gets. Buy lots, brand them, get bought out, buy them back.</div>
       <h3>SIDE HUSTLES (scrap + XP only)</h3>
       <div><b>Freight jobs:</b> fly to the blue pickup beacon, slow down to load, deliver to the yellow beacon before the clock runs out. Every wall you hit damages the cargo.<br/>
       <b>Heat:</b> jacking ships or speeding in the Spine zone brings Corp drones after you. Lose them for 10s to drop a star; shake them all for a payout. Get caught and your ship is impounded.<br/>
       <b>Spine Run:</b> fly through the gold ring at the west end of the Spine and race the gates. Best time is saved.</div>
       <h3>THE SPRAWL</h3>
       <div>About a minute's flight east, past the city limit. Free housing for anyone who plays: build a hut with scrap (150), upgrade to a hab hut (300) or bunker (600). Huts are never branded and can't be bought out. You respawn at yours.</div>
       <div class="buttons"><button class="primary" id="x">Fly</button></div>`,
      (el) => el.querySelector('#x').addEventListener('click', closeModal)
    );
  }

  // ---- main loop ----
  let last = performance.now();
  let lastHud = '';
  let lastLoops = null;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const wall = Date.now();
    refreshDrops(wall);

    const body = me();
    const input = modalOpen ? {} : inputState();
    fly(body, input, dt, !modalOpen && keys.has('shift'));
    const hit = collide(body, KINDS[body.kind].radius, solidCache);
    clampToBounds(body);
    if (!modalOpen) loops.update(dt, now, body, hit);

    for (const s of ships) {
      if (s === body) continue;
      if (s.npc) steerNpc(s, rng, dt);
      else fly(s, { brake: true }, dt);
      collide(s, KINDS[s.kind].radius, solidCache);
      clampToBounds(s);
    }

    if (now > nextMarket) {
      econ.npcTick(rng);
      nextMarket = now + 35000 + rng() * 45000;
    }

    // proximity
    const lvl = levelFor(S.xp);
    const sight = sightRadius(lvl);
    const visible = drops.filter((d) => !S.claimedDrops[d.key] && Math.hypot(d.x - body.x, d.y - body.y) < sight);
    nearDrop = visible.find((d) => Math.hypot(d.x - body.x, d.y - body.y) < 55) || null;
    nearPlot = null;
    for (const p of world.plots) {
      const pad = plotPad(world, p);
      if (Math.hypot(pad.x - body.x, pad.y - body.y) < 40) nearPlot = p;
    }
    nearHut = null;
    if (region(world, body.x) === 'sprawl') {
      for (const site of sprawl.sites) {
        const pad = hutPad(site);
        if (Math.hypot(pad.x - body.x, pad.y - body.y) < 36) nearHut = site;
      }
    }
    boardable = null;
    if (player.mode === 'eva') {
      for (const s of ships) {
        const lim = s.npc ? 4.5 : 2.5;
        if (Math.hypot(s.x - body.x, s.y - body.y) < KINDS[s.kind].radius + 22 && speedOf(s) < lim) boardable = s;
      }
    }

    // hold E to claim a drop: in-world, slow, deliberate
    if (nearDrop && keys.has('e') && !modalOpen && speedOf(body) < 3.5) {
      if (hold.drop !== nearDrop) hold = { drop: nearDrop, progress: 0 };
      hold.progress += dt / 1.2;
      if (hold.progress >= 1) {
        const res = econ.claimDrop(nearDrop, 1);
        hold = { drop: null, progress: 0 };
        if (res) {
          log(`Claimed <b>${res.amount} scrap</b> from the ${esc(nearDrop.noun)}. Lovely.`, 'good');
          if (res.levelUp) log(`LEVEL ${res.levelUp}. Sight radius now ${sightRadius(res.levelUp)}m.`, 'money');
        }
      }
    } else if (hold.drop) hold = { drop: null, progress: 0 };

    if (waypoint && Math.hypot(waypoint.x - body.x, waypoint.y - body.y) < 60) waypoint = null;

    // particles
    for (const s of ships.concat(player.eva ? [player.eva] : [])) {
      if (s.thrusting && rng() < 0.7) {
        const r = KINDS[s.kind].radius;
        particles.push({ x: s.x - Math.cos(s.angle) * r, y: s.y - Math.sin(s.angle) * r, vx: -Math.cos(s.angle) * 2 + (rng() - 0.5), vy: -Math.sin(s.angle) * 2 + (rng() - 0.5), life: 1, color: rng() < 0.5 ? '#ffb347' : '#8a8a8a' });
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * 1.6;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);

    // camera: GTA2 zoom-out with speed
    const sp = speedOf(body);
    const targetZoom = player.mode === 'eva' ? 1.35 : Math.max(0.5, Math.min(1.05, 1.05 - sp * 0.055));
    cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 2);
    cam.x += (body.x + body.vx * 18 - cam.x) * Math.min(1, dt * 4);
    cam.y += (body.y + body.vy * 18 - cam.y) * Math.min(1, dt * 4);

    const scene = {
      world, time: now, dpr, deco, stars, particles,
      ships, pilot: player.eva, me: body, drops: visible,
      sight, nearPlot, boardable, featured: bulletin.featuredPlot,
      holdDrop: hold.drop, holdProgress: hold.progress,
      corpsById: econ.corpsById, waypoint,
      sprawl, hutOf, nearHut, sprites,
      extraWorld: (c) => loops.drawWorld(c, body, now),
      extraMinimap: (m, tx, ty) => loops.drawMinimap(m, tx, ty),
    };
    drawScene(ctx, W, H, cam, scene);
    drawMinimap(mctx, 200, 150, scene);

    // prompt
    let prompt = '';
    if (nearDrop) prompt = `Hold E to claim ${nearDrop.amount} scrap${sp >= 3.5 ? ' (slow down)' : ''}`;
    else if (nearPlot) prompt = `E · open terminal: Lot ${nearPlot.id}`;
    else if (nearHut) prompt = `E · site ${nearHut.id}${hutOf(nearHut) ? '' : ' (vacant)'}`;
    else if (loops.prompt(body)) prompt = loops.prompt(body);
    else if (boardable) prompt = `F · board ${boardable.npc ? 'and jack ' : ''}${KINDS[boardable.kind].label.toLowerCase()}`;
    else if (waypoint) prompt = `Waypoint: ${Math.round(Math.hypot(waypoint.x - body.x, waypoint.y - body.y))}m`;
    const pe = $('prompt');
    pe.style.display = prompt && !modalOpen ? 'block' : 'none';
    pe.textContent = prompt;

    const ls = loops.status(now);
    if (ls !== lastLoops) {
      lastLoops = ls;
      $('h-loops').innerHTML = ls;
      $('h-loops').style.display = ls ? 'block' : 'none';
    }

    // HUD (only touch the DOM when something changed)
    const hudKey = [S.cash, S.credits, S.scrap, S.xp, player.mode, sectorName(world, body.x, body.y), Math.round(sp * 10)].join('|');
    if (hudKey !== lastHud) {
      lastHud = hudKey;
      $('h-cash').textContent = money(S.cash);
      $('h-credits').textContent = money(S.credits);
      $('h-scrap').textContent = S.scrap.toLocaleString();
      const lv = levelFor(S.xp);
      $('h-level').textContent = lv;
      $('h-sight').textContent = `sight ${sightRadius(lv)}m`;
      const lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
      $('h-xp').style.width = `${Math.max(0, Math.min(100, Math.round(((S.xp - lo) / (hi - lo)) * 100)))}%`;
      $('h-mode').textContent = player.mode === 'ship' ? KINDS[body.kind].label.toUpperCase() : 'EVA';
      $('h-sector').textContent = `SECTOR ${sectorName(world, body.x, body.y)}`;
      $('h-speed').textContent = `${(sp * 10).toFixed(0)} m/s`;
    }
    requestAnimationFrame(frame);
  }

  function clampToBounds(b) {
    const B = FLY;
    if (b.x < B.minX) { b.x = B.minX; b.vx = Math.abs(b.vx) * 0.5; }
    if (b.x > B.maxX) { b.x = B.maxX; b.vx = -Math.abs(b.vx) * 0.5; }
    if (b.y < B.minY) { b.y = B.minY; b.vy = Math.abs(b.vy) * 0.5; }
    if (b.y > B.maxY) { b.y = B.maxY; b.vy = -Math.abs(b.vy) * 0.5; }
  }

  log('Welcome to <b>SpaceSquat</b>. You\'re on the Spine. Press <b>H</b> for controls. All money is fake.');
  requestAnimationFrame(frame);
  window.__game = { world, econ, ships, player, cam, drops: () => drops, loops, sprawl };
}

boot();
