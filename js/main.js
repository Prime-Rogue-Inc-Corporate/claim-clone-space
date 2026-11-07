import { mulberry32 } from './rng.js';
import { createEconomy, takeoverPrice, buildPrice, levelFor, xpForLevel, sightRadius, PLAYER, UPGRADES, skiffStats, TAKEOVER_MULT, cents, roman, T13 } from './economy.js';
import { solids, collide, plotPad, sectorName, sectorCentre, dropsForWindow, decorations, DROP_WINDOW_MS, flyBounds, sprawlSites, hutRect, hutPad, hutArt, region, SPRAWLS, sprawlAt, sprawlById, registryOf, COLS13, architects } from './world.js';
import { setLotLogo, clearLotLogo, lotLogoSrc } from './logos.js';
import { createLoops } from './loops.js';
import { loadSprites } from './sprites.js';
import { devEnabled, createDevTools } from './devtools.js';
import { openWiki } from './wiki.js';
import { createProgress, residencyLevel } from './progress.js';
import { createCircuits } from './circuits.js';
import { createGigs } from './gigs.js';
import { createShuttle } from './shuttle.js';
import { createWarmth } from './warmth.js';
import { createTouch } from './touch.js';
import { ensurePilots, createPilots } from './pilots.js';
import { createScooters } from './scooters.js';
import { createPlot } from './plot.js';
import { createMinigames } from './minigames.js';
import { createMilitia } from './militia.js';
import { createDock } from './dock.js';
import { createMinistry } from './ministry.js';
import { createSalvage } from './salvage.js';
import { createBoards } from './boards.js';
import { GAMES as SHIFT_GAMES } from './minigames.js';
import { CIRCUITS } from './circuits.js';
import { KINDS, makeShip, fly, speedOf, makeTraffic, steerNpc } from './entities.js';
import { drawScene, drawMinimap, makeStars } from './render.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const logo = (id, px = 22) => (id ? `<img class="logo" src="assets/sprites/logo_${id}.png" width="${px}" height="${px}" alt="" onerror="this.remove()"/>` : '');
const money = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  ensurePilots(); // which pilot's save is live (sign-in on this device)
  const world = await loadJSON('data/world.json', null);
  if (!world) {
    document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#e8c547">Could not load data/world.json. Serve this folder over HTTP (npm run serve), not file://</div>');
    return;
  }
  const DEV = devEnabled();
  const [bulletin, sprites, lore, achievements, passengers, plotData, roadmap, costs, build] = await Promise.all([
    loadJSON('data/bulletin.json', DEFAULT_BULLETIN),
    loadSprites(),
    loadJSON('data/lore.json', null),
    loadJSON('data/achievements.json', null),
    loadJSON('data/passengers.json', null),
    loadJSON('data/plot-unlocks.json', null),
    DEV ? loadJSON('data/roadmap.json', null) : null,
    DEV ? loadJSON('data/costs.json', null) : null,
    DEV ? loadJSON('data/build.json', { sha: 'local', built: '' }) : null,
  ]);
  start(world, bulletin, sprites, DEV ? { roadmap, costs, build } : null, lore, achievements, passengers, plotData);
}

function start(world, bulletin, sprites, devData, lore, achievements, passengers, plotData) {
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
  // Your skiff: issued at signup, numbered (the server will assign real numbers from #001), never sold.
  const START = { x: 0, y: 640 }; // static return point for now (detention etc. later)
  const myShip = makeShip('skiff', spawn.x, spawn.y, spawn.a, { home: true, reg: '#001', stats: skiffStats(S.upgrades) });
  const ships = [myShip, ...world.parked.map((p) => makeShip(p.kind, p.x, p.y, p.angle)), ...makeTraffic(rng, world.corps, T13 * 2)];
  // mode: 'ship' (flying something) or 'jump' (the brief ship-to-ship leap). Free EVA is locked by the Science Centre.
  const player = { mode: 'ship', ship: myShip, home: myShip, eva: null, jump: null, stolenUntil: 0 };
  const me = () => (player.mode === 'ship' ? player.ship : player.eva);
  const STOLEN_MS = 120000;
  const REFIT = { x: -320, y: 760 }; // Kessler Refit Bay, near the start
  // One Housing Registry per Sprawl, on its city-facing edge
  const REGISTRIES = SPRAWLS.map(registryOf);
  const nearestRegistry = (x) => (x >= 0 ? REGISTRIES[0] : REGISTRIES[1]);

  const cam = { x: myShip.x, y: myShip.y, zoom: 1 };
  const deco = decorations(world);
  const stars = makeStars();
  const particles = [];
  let waypoint = null;
  let objectiveHiddenFor = null; // the objective flag can be dismissed until the mission step changes

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

  let touch = null; // touch controls (phones/tablets), created once the menus exist
  function inputState() {
    const t = touch?.input();
    if (t && !modalOpen) {
      return {
        up: t.up || keys.has('w') || keys.has('arrowup'),
        down: t.down || keys.has('s') || keys.has('arrowdown'),
        left: t.left || keys.has('a') || keys.has('arrowleft'),
        right: t.right || keys.has('d') || keys.has('arrowright'),
        brake: t.brake || keys.has(' '),
      };
    }
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

  // Onboarding is immune to the bulletin: rookies always get the base drop rate. The world stays shared:
  // drops are seeded in order, so a rookie sees the first 3 of the same set veterans see.
  const onboarding = () => S.mission !== 0;
  const dropMult = () => (onboarding() ? 1 : bulletin.event.dropMultiplier);
  function renderBulletin() {
    const m = bulletin.event.dropMultiplier;
    $('bulletin').innerHTML = `<b>CORP BULLETIN ${esc(bulletin.day)}</b> · ${esc(bulletin.event.headline)}${
      m !== 1 ? (onboarding() ? ` · drops ×${m} <i>(not for rookies yet)</i>` : ` · drops ×${m}`) : ''
    }`;
  }
  renderBulletin();

  let gigs = null; // the gig board (G); created below
  const loops = createLoops({ world, econ, log, rng, player, esc, getSolids: () => solidCache, bust, sprites, hullLevel: () => (player.ship === player.home ? S.upgrades.hull || 0 : 0), emit: (t, d) => progress.emit(t, d), view: () => (gigs ? gigs.mapView() : { freight: true, races: true, trackedOffer: null }) });

  // ---- residency card (C) + achievements (J) ----
  // Civic Warmth™: the Bureau's friendly score (K)
  const warmth = createWarmth({ econ, log, esc, openModal, closeModal, skiff: myShip.reg });
  let boards = null; // leaderboards, created once the circuits exist
  const boardHook = { line: (id) => boards?.line(id) || '', open: (id) => boards?.open(id) };
  // shift work: a minigame at every organization's desk (pays scrap, 13-minute cooldown per org)
  const minigames = createMinigames({ econ, log, esc, openModal, closeModal, emit: (t, d) => progress.emit(t, d), onBack: (org) => progress.openDeskFor(org), board: boardHook });
  const progress = createProgress({
    world, econ, lore, achievements, log, esc, openModal, closeModal, sprites, warmth, minigames,
    setWaypoint: (w) => (waypoint = w),
    addHeat: (n, why) => loops.addHeat(n, why),
    raceStart: loops.raceStart, refit: REFIT, registries: REGISTRIES,
  });
  const emit = progress.emit;
  // the Non-Volunteer Volunteer Militia: Range 7 (first-person shooting gallery)
  const militia = createMilitia({ world, econ, lore, log, esc, openModal, closeModal, emit, sprites, board: boardHook });
  // Last Mile Freight: Loading Dock 3 (pack the hold)
  const dock = createDock({ world, econ, log, esc, openModal, closeModal, emit, board: boardHook });
  // Ministry of the Gentry: the Allocation Annex (approve / deny Tenure Heights applications)
  const annex = createMinistry({ world, econ, log, esc, openModal, closeModal, emit, board: boardHook });
  // Kessler Mining Co.: Salvage Yard 9 (cut a derelict apart along its seams)
  const salvage = createSalvage({ world, econ, log, esc, openModal, closeModal, emit, board: boardHook });
  $('h-warmrow').addEventListener('click', () => warmth.openPanel());
  // ---- racetracks south of the main drag ----
  const circuits = createCircuits({ econ, log, esc, player, emit, openModal, closeModal, sprites });
  // ---- leaderboards for every game (B, the menu, and the Hall of Records by the Atlas) ----
  boards = createBoards({ econ, esc, openModal, closeModal, circuits, circuitList: CIRCUITS, games: SHIFT_GAMES, lore, sprites });
  progress.on((t, d) => {
    boards.onEvent(t, d);
    if (t === 'lap') { const l = boards.line('spine'); if (l) log(l.replace(/<\/?b[^>]*>/g, '')); }
  });
  // ---- Humane Shuttle runs (Humane Transit Directorate, Ministry of the Gentry) ----
  const shuttle = createShuttle({
    world, econ, log, esc, player, emit, openModal, closeModal, sprites, refit: REFIT, passengers, addHeat: (n, why) => loops.addHeat(n, why),
    spawnShuttle: (x, y, a, stats) => {
      const v = makeShip('shuttle', x + 90 * Math.cos(a), y + 90 * Math.sin(a), a, { stats, shuttle: true });
      ships.push(v);
      player.mode = 'ship';
      player.ship = v;
      player.eva = null;
      player.stolenUntil = 0;
      return v;
    },
    endShuttle: (v, at) => {
      const i = ships.indexOf(v);
      if (i >= 0) ships.splice(i, 1);
      if (player.ship === v) {
        const p = at || v;
        returnToSkiff();
        Object.assign(player.home, { x: p.x + 80, y: p.y + 80, vx: 0, vy: 0 });
        log('The Directorate tows your skiff alongside. A courtesy.');
      }
    },
    onScootersEjected: (x, y, n) => scooters.ejected(x, y, n),
  });
  // ---- your plot: hut-tier unlocks (cosmetics + allotment fixtures) ----
  const plot = createPlot({
    econ, data: plotData, log, esc, sprites, emit: (t, d) => emit(t, d),
    // other huts near yours: every squatted hut runs a magnet (competes); bigger ones run detectors (resonate)
    neighbours: (site) => {
      const near = sprawl.sites.filter((o) => o !== site && o.sprawl === site.sprawl && o.squatter && Math.hypot(o.x - site.x, o.y - site.y) < 650);
      return { collectors: near.length, detectors: near.filter((o) => o.npcTier >= 4).length };
    },
    conditions: () => ({ bulletin: dropMult(), drops: drops.filter((d) => !S.claimedDrops[d.key] && S.hut && Math.abs(d.x - (sprawl.sites.find((x) => x.id === S.hut.site)?.x ?? 0)) < 4000).length }),
  });
  const homeSiteNow = () => (S.hut ? sprawl.sites.find((x) => x.id === S.hut.site) : null);
  plot.accrue();
  // ---- Last Mile Scoot: rental scooters + the juicing gig ----
  const scooters = createScooters({ world, econ, log, esc, player, ships, makeShip, emit, sprites, returnToSkiff: (msg) => returnToSkiff(msg) });

  // ---- staging tools: roadmap (R) + pinned notes (N); hidden on the production domain ----
  const dev = devData
    ? createDevTools({
        ...devData, esc, log, openModal, closeModal,
        getContext: () => {
          const b = me();
          return { x: b.x, y: b.y, sector: sectorName(world, b.x, b.y), mode: modeLabel(), level: levelFor(S.xp) };
        },
        setWaypoint: (w) => (waypoint = w),
      })
    : null;
  const pilots = createPilots({ log, esc, openModal, closeModal });
  touch = createTouch({ onPress: (k) => (modalOpen ? null : onPress(k)), getBody: () => me(), dev: !!dev, onMenu: () => gigs?.toggle(false) });
  $('hint').innerHTML = 'H · controls &nbsp; TAB · ledger &nbsp; L · wiki &nbsp; P · pilot &nbsp; G · gigs &nbsp; K · warmth &nbsp; C · card &nbsp; J · achievements &nbsp; B · leaderboards' + (dev ? ' &nbsp; <b style="color:#ffd166">N · note &nbsp; R · roadmap</b>' : '');

  // ---- drops ----
  let windowIndex = -1;
  let drops = [];
  function refreshDrops(now) {
    const w = Math.floor(now / DROP_WINDOW_MS);
    if (w === windowIndex) return;
    windowIndex = w;
    drops = dropsForWindow(world, w, dropMult());
    const fresh = drops.filter((d) => !S.claimedDrops[d.key]);
    if (fresh.length === 1) {
      const d = fresh[0];
      log(`💩 ${esc(d.creature)} ${esc(d.verb)} near <b>${sectorName(world, d.x, d.y)}</b>. ${d.amount} scrap in the ${esc(d.noun)}.`, 'good');
    } else if (fresh.length) {
      const d = fresh[0];
      // 13+ drops: name the three nearest sectors, not all of them
      const b0 = me();
      const nearest = [...fresh].sort((a, c) => Math.hypot(a.x - b0.x, a.y - b0.y) - Math.hypot(c.x - b0.x, c.y - b0.y)).slice(0, 3);
      const where = [...new Set(nearest.map((x) => sectorName(world, x.x, x.y)))].join(', ');
      log(`💩 ${esc(d.creature)} ${esc(d.verb)}, and it's catching. ${fresh.length} drops reported; nearest in <b>${where}</b>. All of them on the gig board (G).`, 'good');
    }
  }
  // Press E near a drop to grab it. Must be close and slowed down (not a fly-through).
  const GRAB_RADIUS = 75;
  const GRAB_SPEED = 5;
  function grabDrop(d) {
    if (speedOf(me()) >= GRAB_SPEED) return log('Too fast to grab it. Brake (SPACE) and press E.');
    const res = econ.claimDrop(d, 1);
    if (!res) return;
    log(`Grabbed <b>${res.amount} scrap</b> from the ${esc(d.noun)}. Lovely.`, 'good');
    emit('drop', { amount: res.amount, noun: d.noun });
    if (res.levelUp) log(`LEVEL ${res.levelUp}. Sight radius now ${sightRadius(res.levelUp)}m.`, 'money');
  }

  // ---- interactions ----
  let nearPlot = null;
  let nearHut = null;
  let nearDrop = null;
  let nearRefit = false;
  let nearArchitect = null, lastArch = null, nearMilitia = false, nearDock = false, nearHall = false, nearAnnex = false, nearSalvage = false;
  let nearRegistry = null; // the Registry kiosk you're parked at, if any
  let nearDesk = null; // an organization's residency desk
  let nearCircuit = null; // a racetrack's timing board
  let nearDepot = null; // a Humane Shuttle depot
  let registryAutoShown = false;
  let lastSprawl = null;
  let lastYSide = 0;
  let boardable = null;

  function modeLabel() {
    if (player.mode === 'jump') return 'JUMPING';
    const s = player.ship;
    if (s === player.home) return `SKIFF ${s.reg}`;
    if (s.shuttle) return 'HUMANE SHUTTLE';
    if (s.rental) return `SCOOTER ${s.tag} · ${Math.round(s.battery)}%`;
    return `STOLEN ${KINDS[s.kind].label.toUpperCase()} · ${Math.max(0, Math.ceil((player.stolenUntil - performance.now()) / 1000))}s`;
  }

  function onPress(k) {
    if (dev && dev.onKey(k)) return;
    if (k === 'h') return openHelp();
    if (k === 'l') { emit('wiki'); return openWiki(lore, { openModal, closeModal, esc }); }
    if (k === 'c') return progress.openCard();
    if (k === 'j') return progress.openAchievements();
    if (k === 'b') return boards.open(nearCircuit ? `circuit:${nearCircuit.id}` : null);
    if (k === 'q') return clearMarkers();
    if (k === 'g') return gigs.toggle();
    if (k === 'tab') return openLedger();
    if (k === 'f') return tryJump();
    if (k === 'x') return scooters.onKey('x') || loops.onKey('x', performance.now()) || shuttle.abandon();
    if (k === 'k') return warmth.openPanel();
    if (k === 'p') return pilots.open();
    if (k === 'e' && nearDrop) return grabDrop(nearDrop);
    if (k === 'e' && scooters.onE(me())) return;
    if (k === 'e' && !nearDrop && nearPlot) return openPlot(nearPlot);
    if (k === 'e' && !nearDrop && nearHut) return openHut(nearHut);
    if (k === 'e' && !nearDrop && nearRefit) return openRefit();
    if (k === 'e' && !nearDrop && nearArchitect) return openArchitect(nearArchitect);
    if (k === 'e' && !nearDrop && nearMilitia) return militia.open();
    if (k === 'e' && !nearDrop && nearDock) return dock.open();
    if (k === 'e' && !nearDrop && nearAnnex) return annex.open();
    if (k === 'e' && !nearDrop && nearSalvage) return salvage.open();
    if (k === 'e' && !nearDrop && nearHall) return boards.open();
    if (k === 'e' && !nearDrop && nearRegistry) return openRegistry(null, nearRegistry.sprawl);
    if (k === 'e' && !nearDrop && nearDesk) return progress.openDesk(nearDesk);
    if (k === 'e' && !nearDrop && nearCircuit) return circuits.openBoard(nearCircuit.id);
    if (k === 'e' && !nearDrop && nearDepot) return shuttle.openDepot(nearDepot);
  }

  // Back into your own skiff, wherever you left it. Stolen ships are always temporary.
  function returnToSkiff(msg) {
    player.mode = 'ship';
    player.ship = player.home;
    player.eva = null;
    player.jump = null;
    player.stolenUntil = 0;
    if (msg) log(msg);
  }

  // Busted by Null Sector drones.
  function bust() {
    if (player.mode === 'ship' && player.ship !== player.home) {
      const i = ships.indexOf(player.ship);
      if (i >= 0) ships.splice(i, 1); // the stolen ship is impounded
      returnToSkiff(`The ${KINDS[player.ship.kind].label.toLowerCase()} is impounded. Null Sector drops you back in your skiff.`);
      return;
    }
    // in your own skiff (or mid-jump): towed back to the start. Later: detention, etc.
    returnToSkiff();
    Object.assign(player.home, { x: START.x, y: START.y, vx: 0, vy: 0, angle: -Math.PI / 2 });
    log('A Null Sector tug tows your skiff back to the start.');
  }

  // F: ship-to-ship jump. Under 3s of exposure is "acceptable" per the Science Centre.
  function tryJump() {
    if (player.mode !== 'ship') return;
    const from = player.ship;
    if (!boardable) {
      return log('EVA not cleared. The Vantablack Science Centre is still testing whether it\'s survivable. Pull alongside a slow ship to jump.');
    }
    if (speedOf(from) > 4) return log('Too fast to jump. Brake first (SPACE).');
    const to = boardable;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    player.eva = makeShip('eva', from.x, from.y, Math.atan2(to.y - from.y, to.x - from.x));
    player.jump = { from, to, t: 0, dur: Math.min(2.5, Math.max(0.5, dist / 90)), sx: from.x, sy: from.y };
    player.mode = 'jump';
  }

  function landJump() {
    const { to, dur, from } = player.jump;
    if (from?.rental) scooters.parked(from);
    player.eva = null;
    player.jump = null;
    player.mode = 'ship';
    player.ship = to;
    if (to.rental) {
      if (!scooters.startRide(to)) { player.ship = from; return; }
      player.stolenUntil = 0;
      return;
    }
    emit('jump', { dur });
    if (to === player.home) {
      player.stolenUntil = 0;
      return log(`Back in your skiff ${player.home.reg}. ${dur.toFixed(1)}s of exposure, logged.`);
    }
    if (to.npc) {
      const corp = econ.corpsById[to.corp];
      log(`You jacked a ${esc(corp?.name || 'corp')} ${KINDS[to.kind].label.toLowerCase()}. ${dur.toFixed(1)}s of exposure. The pilot has been… relocated.`);
      loops.onJack(performance.now());
      emit('jack');
      to.npc = false;
      to.ai = null;
    } else {
      log(`Jumped into a derelict ${KINDS[to.kind].label.toLowerCase()}.`);
    }
    player.stolenUntil = performance.now() + STOLEN_MS;
    log(`It's hot: Corp will remote-kill it in ${STOLEN_MS / 1000}s. Your skiff stays where you left it.`);
  }

  // ---- economy events ----
  econ.on((type, p) => {
    if (type === 'lost') { showLost(p); emit('lost'); }
    if (type === 'bought') emit('lot');
    if (type === 'bought') log(`You now hold <b>${esc(p.plot.brand?.name)}</b> (Lot ${p.plot.id}) for ${money(p.price)}.`, 'money');
    if (type === 'market' && p.plot.owner !== PLAYER) {
      if (p.claimed) log(`MARKET: ${esc(econ.ownerName(p.buyer))} claimed empty Lot ${p.plot.id} for ${money(p.plot.value)}.`);
      else if (rng() < 0.35) log(`MARKET: ${esc(econ.ownerName(p.buyer))} took Lot ${p.plot.id} for ${money(p.plot.value)}.`);
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
        <h3>CLAIM</h3>
        <div class="explain">Empty lots cost <b>${money(buildPrice())}</b>. ${payLine(econ.quote(buildPrice()))}<br/>
        Your tower starts at 13 floors and grows every time the lot changes hands.<br/>
        Once claimed, anyone can buy it from you for <b>${money(cents(buildPrice() * TAKEOVER_MULT))}</b>, and you'd get that much back in credits.</div>
        ${riskBox()}
        <div class="buttons"><button class="primary" id="go">Claim for ${money(buildPrice())}</button><button id="x">Close</button></div>
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
          <b>Buy it now: ${money(price)}</b> (1.13 × current value ${money(p.value)}).<br/>
          ${payLine(q)}<br/>
          ${esc(owner)} gets ${money(price)} in credits. Nobody can refuse.<br/>
          After you buy, anyone can take it from you for <b>${money(cents(price * TAKEOVER_MULT))}</b>, and you'd get that much back in credits.
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
         <span class="k">Owner</span><span>${p.owner && p.owner !== PLAYER ? logo(p.owner, 18) + ' ' : ''}${esc(owner)}</span>
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
        const sync = () => {
          if (!go) return;
          const okRisk = S.acceptedRisk || (risk && risk.checked);
          const afford = econ.quote(p.owner ? takeoverPrice(p) : buildPrice()).affordable;
          go.disabled = !(okRisk && afford);
        };
        risk?.addEventListener('change', sync);
        sync();
        go?.addEventListener('click', () => {
          if (risk?.checked) {
            S.acceptedRisk = true;
            econ.save();
          }
          const res = p.owner ? econ.takeover(p) : econ.build(p);
          if (!res.ok) {
            el.querySelector('#err').textContent = res.reason;
            return;
          }
          openPlot(p);
        });
      }
    );
  }

  function openArchitect(a) {
    const L = lore?.architects?.find((x) => x.id === a.id);
    openModal(
      `<h2>${esc(a.name.toUpperCase())}</h2>
       <div class="sub">Architect · ${a.floors} floors · <i>“${esc(a.motto)}”</i></div>
       <div class="explain" style="border-left:4px solid ${esc(a.color)}">
         <img src="assets/architects/${esc(a.id)}_card.png" width="96" height="96" alt="" style="float:right;margin:0 0 6px 10px" onerror="this.onerror=()=>this.remove();this.src='assets/architects/${esc(a.id)}.png'"/>
         ${L ? esc(L.lore) : 'One of the two companies that built the universe.'}</div>
       <div class="explain"><b>Not for sale at any price.</b> The Assessor has never been allowed inside. No other building may be taller; everyone else stops at 100 floors.</div>
       ${L?.rumours?.length ? `<div class="sub">${L.rumours.map((x) => `<b>Rumour:</b> ${esc(x)}`).join('<br/>')}</div>` : ''}
       <div class="sub" style="margin-top:6px">${esc(lore?.architects_note || '')}</div>
       <div class="buttons"><button id="w">Wiki (L)</button><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#w').addEventListener('click', () => openWiki(lore, { openModal, closeModal, esc }, 'architects'));
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
       <div class="field"><span>Roof logo</span><div class="logo-row">
         <div class="logo-prev" id="b-prev">${lotLogoSrc(p.id) ? `<img src="${lotLogoSrc(p.id)}" alt=""/>` : '<span class="sub">none</span>'}</div>
         <label class="btn">Upload…<input type="file" id="b-logo" accept="image/png,image/jpeg,image/webp,image/gif" hidden /></label>
         <button id="b-nologo" ${lotLogoSrc(p.id) ? '' : 'disabled'}>Remove</button></div></div>
       <div class="sub">PNG with a transparent background works best; it's squared to 256 px. <b>For now your logo stays on this device:</b> other pilots see it once accounts and the automated scan exist.</div>
       <div class="err" id="b-err" style="display:none"></div>
       <div class="buttons"><button class="primary" id="save">Save</button><button id="clear">Clear everything</button><button id="x">Cancel</button></div>`,
      (el) => {
        const val = (id) => el.querySelector(id).value;
        const err = (m) => { const e = el.querySelector('#b-err'); e.textContent = m || ''; e.style.display = m ? 'block' : 'none'; };
        el.querySelector('#b-logo').addEventListener('change', async (ev) => {
          err('');
          try {
            const src = await setLotLogo(p.id, ev.target.files[0]);
            el.querySelector('#b-prev').innerHTML = `<img src="${src}" alt=""/>`;
            el.querySelector('#b-nologo').disabled = false;
            emit('logo');
          } catch (e) { err(e.message); }
          ev.target.value = '';
        });
        el.querySelector('#b-nologo').addEventListener('click', () => {
          clearLotLogo(p.id);
          el.querySelector('#b-prev').innerHTML = '<span class="sub">none</span>';
          el.querySelector('#b-nologo').disabled = true;
        });
        el.querySelector('#save').addEventListener('click', () => {
          econ.brand(p, { name: val('#b-name'), tagline: val('#b-tag'), color: val('#b-color'), link: val('#b-link') });
          if (val('#b-name')) emit('brand');
          openPlot(p);
        });
        el.querySelector('#clear').addEventListener('click', () => {
          econ.brand(p, { name: '', tagline: '', color: '#c9a227', link: '' });
          clearLotLogo(p.id);
          openPlot(p);
        });
        el.querySelector('#x').addEventListener('click', () => openPlot(p));
      }
    );
  }

  function showLost({ plot, price, buyer, buyback, credits }) {
    clearLotLogo(plot.id); // a buy-out replaces the branding, logo included
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

  // Shared: after a hut is built or upgraded (from a site pad or the Registry grid)
  function afterHutBuilt(site, res, upgraded = false) {
    solidCache = rects();
    log(`Home sweet hovel: ${esc(econ.HUT_TIERS[S.hut.tier].name)} at ${esc(site.id)}.`, 'money');
    emit(upgraded ? 'hut-upgrade' : 'hut', { tier: S.hut.tier, sprawl: site.sprawl });
    plot.onTier(S.hut.tier);
    if (!upgraded) waypoint = hutPad(site);
    if (res.missionDone) {
      econ.reward(50);
      log('MISSION 2 COMPLETE. +50 scrap. Onboarding done.', 'good');
      finishOnboarding(true);
      return true;
    }
    return false;
  }

  // ---- Sprawl Housing Registry: pick any vacant site from the grid ----
  function openRegistry(pick = null, spId = nearestRegistry(me().x).sprawl) {
    const T = econ.HUT_TIERS;
    const cost = T[0].cost;
    const SP = sprawlById(spId);
    const here = sprawl.sites.filter((s) => s.sprawl === spId);
    const rows = [...new Set(here.map((s) => s.id.slice(2, -1)))];
    const cols = [...COLS13];
    const byId = Object.fromEntries(here.map((s) => [s.id, s]));
    const vacantCount = here.filter((s) => !hutOf(s)).length;
    const cell = (site) => {
      const occ = hutOf(site);
      if (occ) {
        const img = `assets/sprites/hut${hutArt(occ.tier)}_a.png`;
        return `<div class="hcell ${occ.mine ? 'mine' : 'taken'}" title="${esc(site.id)} · ${occ.mine ? 'you' : esc(site.squatter)}">
          <img src="${img}" alt="" onerror="this.remove()"/><span>${esc(site.id)}</span><b>${occ.mine ? 'YOU' : esc(occ.who)}</b></div>`;
      }
      return `<button class="hcell vacant ${pick === site.id ? 'picked' : ''}" data-site="${esc(site.id)}"><span>${esc(site.id)}</span><b>vacant</b></button>`;
    };
    const grid = rows
      .map((r) => cols.map((c) => byId[`${SP.prefix}-${r}${c}`]).filter(Boolean).map(cell).join(''))
      .join('');
    let footer;
    if (S.hut) {
      footer = `<div class="explain">You already have a hut at <b>${esc(S.hut.site)}</b> (${esc(T[S.hut.tier].name)}). One per pilot. Upgrade it at its pad.</div>
                <div class="buttons"><button id="x">Close</button></div>`;
    } else if (pick) {
      footer = `<div class="explain">Build a <b>${esc(T[0].name.toLowerCase())}</b> at <b>${esc(pick)}</b> for <b>${cost} scrap</b>? You have ${S.scrap}.<br/>
                Scrap only. Never branded, can't be bought out, and you respawn here.</div>
                <div class="buttons"><button class="primary" id="build" ${S.scrap >= cost ? '' : 'disabled'}>Build at ${esc(pick)}</button><button id="back">Pick another</button><button id="x">Close</button></div>
                <div class="err" id="err">${S.scrap >= cost ? '' : `Need ${cost} scrap.`}</div>`;
    } else {
      footer = `<div class="sub">Pick any vacant site. A ${esc(T[0].name.toLowerCase())} costs ${cost} scrap; you have ${S.scrap}.</div>
                <div class="buttons"><button id="x">Close</button></div>`;
    }
    openModal(
      `<h2>HOUSING REGISTRY · ${esc(SP.name)}</h2>
       <div class="sub">${here.length} sites · ${vacantCount} vacant · north is up, the Registry is on the ${SP.dir > 0 ? 'west' : 'east'} edge (city side)</div>
       <div class="hutgrid" style="grid-template-columns: repeat(${cols.length}, 1fr)">${grid}</div>
       ${footer}`,
      (el) => {
        el.querySelector('#x')?.addEventListener('click', closeModal);
        el.querySelector('#back')?.addEventListener('click', () => openRegistry(null, spId));
        el.querySelectorAll('[data-site]').forEach((b) => b.addEventListener('click', () => !S.hut && openRegistry(b.dataset.site, spId)));
        el.querySelector('#build')?.addEventListener('click', () => {
          const site = byId[pick];
          const res = econ.buildHut(site.id);
          if (!res.ok) return (el.querySelector('#err').textContent = res.reason);
          if (!afterHutBuilt(site, res)) closeModal();
        });
      }
    );
  }

  function drawRegistry(c, time) {
    for (const R of REGISTRIES) drawRegistryAt(c, time, R);
  }
  function drawRegistryAt(c, time, REGISTRY) {
    if (Math.abs(cam.x - REGISTRY.x) > 3000) return;
    const img = sprites?.get('pad');
    if (img) c.drawImage(img, REGISTRY.x - 34, REGISTRY.y - 30, 68, 68 * (img.height / img.width));
    c.strokeStyle = nearRegistry === REGISTRY ? '#d6f08a' : 'rgba(214,240,138,0.4)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(REGISTRY.x, REGISTRY.y, 40 + (S.mission === 3 ? Math.sin(time / 200) * 5 : 0), 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#d6f08a';
    c.font = 'bold 13px monospace';
    c.textAlign = 'center';
    c.fillText(`HOUSING REGISTRY · ${sprawlById(REGISTRY.sprawl).name}`, REGISTRY.x, REGISTRY.y - 52);
    const rl = sprites?.get('logo_registry');
    if (rl) c.drawImage(rl, REGISTRY.x - 22, REGISTRY.y - 112, 44, 44);
    c.font = '10px monospace';
    c.fillStyle = 'rgba(214,240,138,0.7)';
    c.fillText('pick any vacant site · E', REGISTRY.x, REGISTRY.y + 56);
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
              ${next ? `<div>Tier ${roman(S.hut.tier + 1)} of ${T.length}. Upgrade to <b>${next.name}</b> (${roman(S.hut.tier + 2)}): ${next.cost} scrap (you have ${S.scrap}).</div>` : '<div>The Big Bunker. Tier XIII. Top tier.</div>'}
              <div class="buttons">${next ? `<button class="primary" id="up" ${S.scrap >= next.cost ? '' : 'disabled'}>Upgrade</button>` : ''}<button id="x">Close</button></div>
              <div class="err" id="err"></div>
              ${plot.section(site)}`;
    } else {
      body = `<div class="explain">Vacant. Build a <b>${T[0].name.toLowerCase()}</b> for <b>${T[0].cost} scrap</b> (you have ${S.scrap}).
              Scrap only: no cash, no credits. One hut per pilot. Huts can't be branded or bought out, and they're yours while you play.</div>
              ${S.hut ? `<div class="err">You already have a hut at ${esc(S.hut.site)}.</div>` : ''}
              <div class="buttons"><button class="primary" id="build" ${!S.hut && S.scrap >= T[0].cost ? '' : 'disabled'}>Build</button><button id="x">Close</button></div>
              <div class="err" id="err"></div>`;
    }
    openModal(`<h2>SITE ${esc(site.id)}</h2><div class="sub">${esc(sprawlById(site.sprawl).title)} · residential</div>${body}`, (el) => {
      el.querySelector('#x')?.addEventListener('click', closeModal);
      const after = (res, upgraded) => {
        if (!res.ok) return (el.querySelector('#err').textContent = res.reason);
        if (!afterHutBuilt(site, res, upgraded)) openHut(site);
      };
      el.querySelector('#build')?.addEventListener('click', () => after(econ.buildHut(site.id), false));
      el.querySelector('#up')?.addEventListener('click', () => after(econ.upgradeHut(), true));
      if (occ && occ.mine) plot.bind(el, () => openHut(site), site);
    });
  }

  // ---- Kessler Refit Bay: skiff upgrades, scrap only ----
  function openRefit() {
    const U = S.upgrades;
    const rows = Object.entries(UPGRADES)
      .map(([id, u]) => {
        const tier = U[id] || 0;
        const cost = u.tiers[tier];
        const pips = u.tiers.map((_, i) => (i < tier ? '■' : '□')).join('') + ` <span class="sub">${tier ? roman(tier) : '—'}/${roman(u.tiers.length)}</span>`;
        const btn = u.locked
          ? '<span class="sub">coming soon</span>'
          : cost == null
          ? '<span class="sub">maxed</span>'
          : `<button data-up="${id}" ${S.scrap >= cost ? '' : 'disabled'}>${cost} scrap</button>`;
        return `<tr><td><b>${esc(u.name)}</b> <span style="color:#e8c547">${pips}</span><div class="sub" style="margin:2px 0 0">${esc(u.what)}</div></td><td style="width:110px;text-align:right">${btn}</td></tr>`;
      })
      .join('');
    const st = skiffStats(U);
    openModal(
      `<h2>KESSLER REFIT BAY</h2>
       <div class="sub">Skiff ${esc(player.home.reg)} · you have <b>${S.scrap} scrap</b> · scrap only, no cash or credits accepted</div>
       <table>${rows}</table>
       <div class="sub">Turn ${(st.turn * 1000).toFixed(0)} · grip ${(st.grip * 100).toFixed(1)} · thrust ${(st.thrust * 100).toFixed(0)} · top ${(st.max * 10).toFixed(0)} m/s</div>
       <div class="err" id="err"></div>
       <div class="buttons"><button id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelectorAll('[data-up]').forEach((b) =>
          b.addEventListener('click', () => {
            const res = econ.buyUpgrade(b.dataset.up);
            if (!res.ok) return (el.querySelector('#err').textContent = res.reason);
            player.home.stats = skiffStats(S.upgrades);
            emit('upgrade', { id: b.dataset.up, tier: res.tier });
            log(`Fitted ${esc(UPGRADES[b.dataset.up].name)} ${roman(res.tier)}. Kessler thanks you for your scrap.`, 'money');
            if (res.mission !== 1 && res.mission !== 2 && missionShown !== res.mission) {
              missionShown = res.mission;
              econ.reward(40);
              log('MISSION 1 COMPLETE. +40 scrap.', 'good');
              if (res.mission === 3) return openMission2();
              if (res.mission === 0) finishOnboarding(false);
            }
            openRefit();
          })
        );
      }
    );
  }

  // ---- onboarding: mission 1 (fix the skiff a bit), mission 2 (get a home) ----
  const MISSION_SCRAP = 120; // ~2–3 min of scrounging; matches Gyros I (13 drops per window, one per sector column)
  const HOME_SCRAP = econ.HUT_TIERS[0].cost;
  if (S.mission === 3 && S.hut) S.mission = 0; // older saves that already have a hut
  let missionShown = S.mission;
  let homeWaypointSet = false;
  function missionText() {
    if (S.mission === 1) return `MISSION 1 · Scrounge ${MISSION_SCRAP} scrap (${Math.min(S.scrap, MISSION_SCRAP)}/${MISSION_SCRAP}). Hunt drops, run freight.`;
    if (S.mission === 2) return 'MISSION 1 · Fly to the Kessler Refit Bay and fit any upgrade.';
    if (S.mission === 3)
      return S.scrap < HOME_SCRAP
        ? `MISSION 2 · You need a home. Scrounge ${HOME_SCRAP} scrap (${S.scrap}/${HOME_SCRAP}).`
        : `MISSION 2 · Fly to a Sprawl (~1 min, ${me().x >= 0 ? 'east to Lower Upper Squalor' : 'west to Upper Lower Squalor'}). Pick a site at the Housing Registry.`;
    return '';
  }
  function missionTick() {
    if (S.mission === 1 && S.scrap >= MISSION_SCRAP) {
      S.mission = 2;
      econ.save();
      log('Enough scrap. Follow the flag to the Kessler Refit Bay.', 'good');
    }
    if (S.mission === 3 && S.scrap >= HOME_SCRAP && !homeWaypointSet) {
      homeWaypointSet = true;
      // nearest vacant site on the city side of the Sprawl
      log('Enough scrap for a shack. Follow the flag (and the buoys) to the nearest Sprawl Housing Registry: east or west, your pick.', 'good');
    }
  }
  // Objective flag: where the current mission wants you. For "scrounge" steps it points at the
  // sector a drop was reported in (not the drop itself), so sight radius still matters.
  const missionKey = () => `${S.mission}:${S.mission === 1 ? S.scrap >= MISSION_SCRAP : S.mission === 3 ? S.scrap >= HOME_SCRAP : ''}`;
  function objective(body) {
    const scrounge = (S.mission === 1 && S.scrap < MISSION_SCRAP) || (S.mission === 3 && S.scrap < HOME_SCRAP);
    if (scrounge) {
      const open = drops.filter((d) => !S.claimedDrops[d.key]);
      if (!open.length) return null;
      const d = open.reduce((a, c) => (Math.hypot(c.x - body.x, c.y - body.y) < Math.hypot(a.x - body.x, a.y - body.y) ? c : a));
      return { ...sectorCentre(world, d.x, d.y), label: `Scrap reported in ${sectorName(world, d.x, d.y)}`, area: true };
    }
    if (S.mission === 2) return { x: REFIT.x, y: REFIT.y, label: 'Fit an upgrade' };
    if (S.mission === 3) {
      const R = nearestRegistry(body.x);
      return { x: R.x, y: R.y, label: `Housing Registry · ${sprawlById(R.sprawl).title}` };
    }
    return null;
  }

  function openMission2() {
    openModal(
      `<h2>MISSION 1 COMPLETE</h2>
       <div class="sub">+40 scrap · skiff ${esc(player.home.reg)}</div>
       <div class="explain">Now it handles like a shopping cart with duct tape. Upgrade later.<br/><br/>
       <b>Mission 2: for now, you need a home.</b> Scrounge ${HOME_SCRAP} scrap, then fly past either city limit to a <b>Sprawl</b> (about a minute; follow the buoys): <b>Lower Upper Squalor</b> to the east or <b>Upper Lower Squalor</b> to the west. Build a hut on any vacant site.<br/><br/>
       Huts are scrap-only, never branded, can't be bought out, and you respawn at yours.</div>
       <div class="buttons"><button class="primary" id="x">Fly</button></div>`,
      (el) => el.querySelector('#x').addEventListener('click', closeModal)
    );
  }
  function finishOnboarding(showCard = true) {
    missionShown = 0;
    windowIndex = -1; // re-roll this window's drops at the bulletin rate
    renderBulletin();
    if (!showCard) return;
    openModal(
      `<h2>ONBOARDING COMPLETE</h2>
       <div class="sub">+50 scrap · welcome to the Squalor</div>
       <div class="explain">You have a skiff that almost steers and a hovel to call home. You respawn here from now on.<br/><br/>
       Drops now follow the Corp Bulletin (storm days, lockdowns). The rest is up to you: freight, races, heat, lots on the Spine, more upgrades at the Refit Bay.</div>
       <div class="buttons"><button class="primary" id="x">Fly</button></div>`,
      (el) => el.querySelector('#x').addEventListener('click', closeModal)
    );
  }
  function openIntro() {
    openModal(
      `<h2>WELCOME TO SPACESQUAT</h2>
       <div class="sub">Skiff ${esc(player.home.reg)} issued. Do not lose it. You cannot leave it.</div>
       <div class="explain">Your skiff handles like a shopping cart full of scrap. That's not a bug, it's your starting position.<br/><br/>
       <b>Mission 1:</b> scrounge ${MISSION_SCRAP} scrap (drops, freight jobs), then fit your first upgrade at the <b>Kessler Refit Bay</b> just west of here.<br/><br/>
       The Vantablack Science Centre has not cleared EVA. You may jump ship-to-ship (<kbd>F</kbd>) for under 3 seconds. Anything you steal is temporary.</div>
       <div class="buttons"><button class="primary" id="x">Fly</button><button id="help">Controls (H)</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#help').addEventListener('click', openHelp);
      }
    );
  }

  function drawRefit(c, time) {
    const img = sprites?.get('pad');
    c.save();
    if (img) c.drawImage(img, REFIT.x - 34, REFIT.y - 30, 68, 68 * (img.height / img.width));
    c.strokeStyle = nearRefit ? '#e8c547' : 'rgba(232,197,71,0.35)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(REFIT.x, REFIT.y, 40 + (S.mission === 2 ? Math.sin(time / 200) * 5 : 0), 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#e8c547';
    c.font = 'bold 13px monospace';
    c.textAlign = 'center';
    c.fillText('KESSLER REFIT BAY', REFIT.x, REFIT.y - 52);
    const kl = sprites?.get('logo_kessler');
    if (kl) c.drawImage(kl, REFIT.x + 62, REFIT.y - 26, 44, 44);
    c.font = '10px monospace';
    c.fillStyle = 'rgba(232,197,71,0.7)';
    c.fillText('scrap only · E to fit', REFIT.x, REFIT.y + 56);
    c.restore();
  }

  function openLedger() {
    emit('ledger');
    const claimed = world.plots.filter((p) => p.owner).sort((a, b) => b.value - a.value);
    const total = claimed.reduce((s, p) => s + p.value, 0);
    const changes = world.plots.reduce((s, p) => s + p.history.filter((h) => h.kind === 'takeover').length, 0);
    const rows = claimed
      .map((p) => `<tr class="click ${p.owner === PLAYER ? 'mine' : ''}" data-id="${p.id}"><td>${p.id}</td><td>${esc(p.brand?.name)}</td><td>${p.owner && p.owner !== PLAYER ? logo(p.owner, 14) + ' ' : ''}${esc(econ.ownerName(p.owner))}</td><td>${money(p.value)}</td><td>${money(takeoverPrice(p))}</td><td>${p.history.filter((h) => h.kind === 'takeover').length}</td></tr>`)
      .join('');
    openModal(
      `<h2>THE LEDGER</h2>
       <div class="sub">Every lot, every price, every buy-out. Market value ${money(total)} · ${changes} ownership changes · ${world.plots.length - claimed.length} lots unclaimed. Click a row to set a waypoint.</div>
       <div class="explain"><b>The rules, all of them:</b> empty lots cost $1. Any lot can be bought for 1.13× its current value; the owner can't refuse and gets the full price back as credits. Towers grow every time a lot changes hands.
       Credits pay first, cash tops up. Credits never expire and never turn into cash. Scrap, levels and skiff upgrades are game-only.</div>
       <table><tr><th>Lot</th><th>Name</th><th>Owner</th><th>Value</th><th>Buy-out</th><th>Flips</th></tr>${rows}</table>
       <h3>WHO OWNS THE SPINE</h3>
       <table>${world.corps
         .map((c) => `<tr><td style="width:12px;background:${esc(c.color)}"></td><td><b>${esc(c.name)}</b>${c.motto ? ` · <i>“${esc(c.motto)}”</i>` : ''}<div class="sub" style="margin:2px 0 0">${esc(c.does || '')}</div></td><td style="width:60px;text-align:right">${claimed.filter((p) => p.owner === c.id).length} lots</td></tr>`)
         .join('')}</table>
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
         <span class="k"><kbd>F</kbd></span><span>Jump ship-to-ship: pull alongside a slow ship (yes, NPC ones). Stolen ships are hot and get remote-killed after 2 minutes; you land back in your skiff.</span>
         <span class="k"><kbd>E</kbd></span><span>At a lot's pad: open the terminal. At the Refit Bay: upgrade your skiff. At a drop: press to grab it (slow down first).</span>
         <span class="k"><kbd>X</kbd></span><span>Dump the cargo (abandon your freight job)</span>
         <span class="k"><kbd>TAB</kbd></span><span>The ledger: every lot and price</span>
         <span class="k"><kbd>L</kbd></span><span>The wiki: who runs this place, and why everything is 13</span>
         <span class="k"><kbd>C</kbd></span><span>Residency card: 13 stamps from the 13 organizations. Level 0.00 → 0.13 → Level 1, “Fully Processed”. Every org desk also has a shift minigame that pays scrap (once per 13 min per org)</span>
         <span class="k"><kbd>J</kbd></span><span>Achievements: 13 categories × 13. Shame ones are hidden until you earn them</span>
         <span class="k"><kbd>G</kbd></span><span>Gig board: every open gig (freight offers, reported drops, races, stamps). Click one to track it: the tracked gig gets the flag and arrow. Toggle which gig types show on the map</span>
         <span class="k"><kbd>P</kbd></span><span>Pilots (sign in on this device): switch pilots, start a fresh one, wipe (with a backup), export/import a pilot code to move or protect it</span>
         <span class="k"><kbd>K</kbd></span><span>Civic Warmth™: the Bureau of Public Cheer's friendly score. Contributing warms it, degeneracy cools it. Most Humane Citizen of the Day, certificates</span>
         <span class="k"><kbd>Q</kbd></span><span>Clear your waypoint (press again to hide the objective flag). The chips above the minimap have clear buttons too</span>
         <span class="k"><kbd>B</kbd></span><span>Racetrack leaderboards (The Island Circuit, The Temple Circuit)</span>
         <span class="k"><kbd>H</kbd></span><span>This screen</span>
       </div>
       ${touch?.active ? `<h3>TOUCH CONTROLS</h3><div><b>Left stick:</b> point where you want to go; the ship turns toward it and pushes harder the further you drag. <b>BRAKE</b> (hold), <b>E</b> (lights up when there's something to use), <b>F</b> jump, <b>X</b> dump/abandon. <b>☰</b> has every menu: gigs, card, achievements, warmth, leaderboards, ledger, wiki. Works in portrait and landscape; Full screen is in the menu.</div>` : ''}
       <h3>THE GAME</h3>
       <div>Fly the Spine. Hunt drops: when something craps out a load of scrap, the first pilot to reach it, slow down and press <kbd>E</kbd> gets it.
       Scrap gives XP; levels widen your sight radius. Spend scrap at the Kessler Refit Bay so your skiff stops handling like a shopping cart. Buy lots for $1, brand them, get bought out, buy them back.<br/>
       <i>Why can't I get out? The Vantablack Science Centre hasn't cleared EVA yet. A jump under 3 seconds is the most they'll sign off on.</i></div>
       <h3>SIDE HUSTLES (scrap + XP only)</h3>
       <div><b>Freight jobs:</b> pick an offer from the gig board (G; offers expire), fly to its blue pickup pad, slow down to load, deliver to the yellow beacon before the clock runs out. Every wall you hit damages the cargo.<br/>
       <b>Heat:</b> jacking ships or speeding in the Spine zone brings Corp drones after you. Lose them for 10s to drop a star; shake them all for a payout. Get caught and your ship is impounded.<br/>
       <b>Spine Run:</b> fly through the gold ring south of the Spine's west end, then slalom through all 12 crossings (13 gates). The last crossing is the finish; the arrow points at the next gate. Best time is saved.</div>
       <h3>THE CITY</h3>
       <div>The Spine runs 13 blocks of 13 lots (169), all on the north side. The gaps between blocks are crossings: fly through them north-south. Real roads and intersections come later.</div>
       <h3>HUMANE SHUTTLE RUNS</h3>
       <div>Sign up at a Humane Shuttle Depot (next to each Sprawl's Housing Registry) and drive a route through the hubs into the city. Stop at every stop. The shuttle handles like dog shit on purpose. Keep passenger comfort at 70%+ and beat par for a bonus; runs build your career with the Humane Transit Directorate (13 ranks, each a slightly less awful shuttle). X opens the doors: everyone aboard gets off right there, and the route carries on empty (new passengers board at the next stops). X on an empty shuttle abandons the route. Shuttles seat 13; crowds depend on how many pilots are around; a VIP may board (pay ×1.5, very fussy).</div>
       <h3>SCOOTERS (LAST MILE SCOOT)</h3>
       <div>Dockless rental scooters all over: pull alongside in your skiff and jump on (F). 1 scrap to unlock, 1 every 13 s. Quick, twitchy, and if you hit a wall fast you eat it. F back into any ship to park it wherever; X ends the ride from anywhere (tug fee). <b>Juicing gig:</b> low or wrecked scooters show on the gig board; load them in your skiff (E, hold 3) and drop them at a Scoot Dock (E) for scrap. Shuttle passengers bring scooters too: they take up room, fall over on hard corners, and fly out if you open the doors in the void.</div>
       <h3>THE RACETRACKS</h3>
       <div>South of the main drag, two space circuits traced from real F1 tracks: <b>The Island Circuit</b> (after Circuit Gilles-Villeneuve, Montréal) to the southwest and <b>The Temple Circuit</b> (after Monza) to the southeast. Fly through the start gate in the race direction to start a lap, then hit all 13 gates in order. Laps go on the leaderboard (B, or E at the timing board).</div>
       <h3>THE SPRAWLS</h3>
       <div>About a minute's flight past either end of the city: <b>Lower Upper Squalor</b> (east) and <b>Upper Lower Squalor</b> (west), 39 sites each. Free housing for anyone who plays: build a lean-to with scrap (${econ.HUT_TIERS[0].cost}), then upgrade through 13 tiers to The Big Bunker. Huts are never branded and can't be bought out. You respawn at yours.</div>
       <div class="buttons"><button class="primary" id="x">Fly</button></div>`,
      (el) => el.querySelector('#x').addEventListener('click', closeModal)
    );
  }

  // ---- the gig board (G) ----
  gigs = createGigs({
    world, econ, loops, circuits, progress, registries: REGISTRIES, sectorName, sectorCentre,
    getDrops: () => drops, mission: (b) => objective(b), onboarding, esc, log, $,
    extraRows: (at) => {
      const hs = homeSiteNow(), pile = hs ? plot.magnetPile(hs) : 0;
      const magnet = pile >= 13 || (pile && plot.magnetRusting()) ? [{ id: 'magnet', type: 'magnet', title: `Scrap magnet: ${pile} waiting${plot.magnetRusting() ? ' (rusting!)' : ''}`, sub: 'collect at your hut before it rusts', pay: `${pile}`, target: { x: hs.x, y: hs.y + 58, label: 'Your hut · scrap magnet' } }] : [];
      return [...magnet, ...shuttle.gigRows(at), ...scooters.gigRows(at), ...militia.gigRows(at), ...dock.gigRows(at), ...annex.gigRows(at), ...salvage.gigRows(at)];
    }, citizen: () => warmth.citizen(), startClosed: !!touch?.active,
  });
  // what the flag + arrow point at: the tracked gig (the mission during onboarding), unless hidden
  function currentTarget(body) {
    const t = gigs.target(body);
    if (t && t.gig === 'mission' && objectiveHiddenFor === missionKey()) return null;
    return t;
  }

  // minimap extras governed by the gig board's "on map" toggles
  function drawGigMinimap(m, tx, ty) {
    const v = gigs.mapView();
    if (v.drops) for (const r of gigs.rows()) if (r.type === 'drop') { m.strokeStyle = 'rgba(214,240,138,0.45)'; m.strokeRect(tx(r.target.x) - 6, ty(r.target.y) - 6, 12, 12); }
    if (v.stamps) for (const r of gigs.rows()) if (r.type === 'stamp') { m.fillStyle = '#e6dcc4'; m.fillRect(tx(r.target.x) - 1.5, ty(r.target.y) - 1.5, 3, 3); }
  }

  // ---- marker chips: every active marker gets a clear button (Q clears them all) ----
  function clearMarkers() {
    if (waypoint) { waypoint = null; return log('Waypoint cleared.'); }
    const t = gigs.target(me());
    if (t && t.gig !== 'mission') { gigs.untrack(); return log('Stopped tracking.'); }
    if (t && objectiveHiddenFor !== missionKey()) { objectiveHiddenFor = missionKey(); return log('Objective flag hidden until your next mission step.'); }
  }
  let lastMarkers = '';
  function renderMarkers(body) {
    const raw = gigs.target(body);
    const obj = raw;
    const showObj = raw && currentTarget(body);
    const d = (p) => { const m = Math.hypot(p.x - body.x, p.y - body.y) / 6; return m > 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; };
    // rebuild the chips only when their set changes (so the buttons stay clickable); distances update in place
    const html = [
      waypoint && `<div class="mk wp"><b>✕ WAYPOINT</b> <span data-d="wp"></span> <button data-clear="wp" title="Clear waypoint (Q)">clear</button></div>`,
      showObj && `<div class="mk obj"><b>⚑</b> ${esc(obj.label)} · <span data-d="obj"></span> ${obj.gig === 'mission' ? '<button data-clear="obj" title="Hide until your next mission step">hide</button>' : '<button data-clear="untrack" title="Stop tracking (Q)">untrack</button>'}</div>`,
      !showObj && obj && `<div class="mk obj"><button data-clear="showobj">show objective</button></div>`,
    ].filter(Boolean).join('');
    if (html !== lastMarkers) {
      lastMarkers = html;
      $('markers').innerHTML = html;
    }
    const wd = $('markers').querySelector('[data-d="wp"]');
    if (wd && waypoint) wd.textContent = d(waypoint);
    const od = $('markers').querySelector('[data-d="obj"]');
    if (od && showObj) od.textContent = d(obj);
  }
  $('markers').addEventListener('click', (e) => {
    const k = e.target?.dataset?.clear;
    if (k === 'wp') waypoint = null;
    if (k === 'obj') objectiveHiddenFor = missionKey();
    if (k === 'untrack') gigs.untrack();
    if (k === 'showobj') objectiveHiddenFor = null;
    lastMarkers = '';
    e.target.blur();
  });

  // ---- main loop ----
  let last = performance.now();
  let lastHud = '';
  let lastLoops = null;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const wall = Date.now();
    refreshDrops(wall);

    // stolen ships are hot: the Corp remote-kills them, and you're back in your skiff
    if (player.mode === 'ship' && player.stolenUntil && now > player.stolenUntil) {
      const dead = player.ship;
      dead.vx *= 0.2;
      dead.vy *= 0.2;
      emit('expired');
      returnToSkiff(`Corp remote-killed the ${KINDS[dead.kind].label.toLowerCase()}. A Kessler tug drags you back to skiff ${player.home.reg}.`);
    }

    let body = me();
    let hit = false;
    if (player.mode === 'jump') {
      const j = player.jump;
      j.t += dt;
      const f = Math.min(1, j.t / j.dur);
      body.x = j.sx + (j.to.x - j.sx) * f;
      body.y = j.sy + (j.to.y - j.sy) * f;
      body.angle = Math.atan2(j.to.y - j.sy, j.to.x - j.sx);
      body.thrusting = true;
      if (f >= 1) {
        landJump();
        body = me();
      }
    } else {
      const input = modalOpen ? {} : inputState();
      fly(body, input, dt, !modalOpen && keys.has('shift'));
      hit = collide(body, KINDS[body.kind].radius, solidCache);
      clampToBounds(body);
    }
    if (!modalOpen) loops.update(dt, now, body, hit);
    if (!modalOpen) circuits.update(now, body);
    if (!modalOpen) shuttle.update(dt, now, body, hit, inputState());
    if (!modalOpen) scooters.update(dt, now, body, hit);
    missionTick();

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
    nearDrop = player.mode === 'ship' ? visible.find((d) => Math.hypot(d.x - body.x, d.y - body.y) < GRAB_RADIUS) || null : null;
    // Pad reach: generous on touch screens (a drifting skiff + a thumb = misery), a bit generous on PC.
    const REACH = touch?.active ? 1.8 : 1.3;
    const dist = (p) => Math.hypot(p.x - body.x, p.y - body.y);
    nearPlot = null;
    let bestPad = Infinity, dockPad = null;
    for (const p of world.plots) {
      if (Math.abs(p.x - body.x) > 400) continue;
      const pad = plotPad(world, p), d = dist(pad);
      if (d < 45 * REACH && d < bestPad) { bestPad = d; nearPlot = p; dockPad = pad; }
    }
    nearHut = null;
    const inSprawl = region(world, body.x) === 'sprawl' ? sprawlAt(body.x) : null;
    if (inSprawl) {
      for (const site of sprawl.sites) {
        if (site.sprawl !== inSprawl.id) continue;
        const pad = hutPad(site), d = dist(pad);
        if (d < 50 * REACH && d < bestPad) { bestPad = d; nearHut = site; dockPad = pad; nearPlot = null; }
      }
    }
    nearRefit = dist(REFIT) < 45 * REACH;
    if (nearRefit) dockPad = REFIT;
    nearMilitia = player.mode === 'ship' && militia.near(body.x, body.y, 50 * REACH);
    if (nearMilitia) dockPad = militia.pad;
    nearDock = player.mode === 'ship' && dock.near(body.x, body.y, 50 * REACH);
    if (nearDock) dockPad = dock.pad;
    nearSalvage = player.mode === 'ship' && salvage.near(body.x, body.y, 50 * REACH);
    if (nearSalvage) dockPad = salvage.pad;
    nearAnnex = player.mode === 'ship' && annex.near(body.x, body.y, 50 * REACH);
    if (nearAnnex) dockPad = annex.pad;
    nearHall = player.mode === 'ship' && boards.nearHall(body.x, body.y, 45 * REACH);
    if (nearHall) dockPad = boards.pad;
    nearArchitect = player.mode === 'ship' ? architects(world).find((a) => dist(a.pad) < 50 * REACH) || null : null;
    if (nearArchitect) { dockPad = nearArchitect.pad; if (lastArch !== nearArchitect.id) { lastArch = nearArchitect.id; emit('architect', { id: nearArchitect.id }); } }
    nearDesk = player.mode === 'ship' ? progress.nearDesk(body.x, body.y + -40, 60 * REACH) : null;
    if (nearDesk) dockPad = { x: nearDesk.x, y: nearDesk.y + 40 };
    // exploration + crossings (achievements)
    if (inSprawl && inSprawl.id !== lastSprawl) emit('sprawl', { id: inSprawl.id });
    lastSprawl = inSprawl ? inSprawl.id : null;
    const ySide = body.y < -60 ? -1 : body.y > 60 ? 1 : 0;
    if (ySide && lastYSide && ySide !== lastYSide && player.mode === 'ship') {
      const gi = (world.spine.gaps || []).findIndex((g) => body.x > g.x0 - 20 && body.x < g.x1 + 20);
      if (gi >= 0) emit('crossing', { i: gi + 1 });
    }
    if (ySide) lastYSide = ySide;
    nearCircuit = circuits.nearBoard(body.x, body.y);
    nearDepot = player.mode === 'ship' && !shuttle.running() ? shuttle.nearDepot(body.x, body.y, 70 * REACH) : null;
    if (nearDepot) dockPad = nearDepot;
    const REG = nearestRegistry(body.x);
    nearRegistry = dist(REG) < 60 * REACH ? REG : null;
    if (nearRegistry) dockPad = REG;
    // Docking assist: coasting slowly near a pad, the ship settles onto it instead of drifting off.
    if (dockPad && player.mode === 'ship' && !modalOpen) {
      const sp0 = speedOf(body), inp = inputState();
      if (sp0 < 2.5 && !inp.up) {
        const k = Math.min(1, dt * 60);
        body.vx *= 1 - 0.08 * k;
        body.vy *= 1 - 0.08 * k;
        body.x += (dockPad.x - body.x) * 0.03 * k;
        body.y += (dockPad.y - body.y) * 0.03 * k;
      }
    }
    // mission 2: arriving at a Registry with enough scrap opens the grid once
    if (!modalOpen && !registryAutoShown && S.mission === 3 && S.scrap >= HOME_SCRAP && !S.hut && Math.hypot(REG.x - body.x, REG.y - body.y) < 140) {
      registryAutoShown = true;
      openRegistry(null, REG.sprawl);
    }
    boardable = null;
    if (player.mode === 'ship') {
      let best = Infinity;
      for (const s of ships) {
        if (s === body) continue;
        if (s.rental && !scooters.canRide(s)) continue; // wrecked or in someone's hold
        const lim = s.npc ? 4.5 : 2.5;
        const d = Math.hypot(s.x - body.x, s.y - body.y);
        if (d < KINDS[s.kind].radius + KINDS[body.kind].radius + 60 && speedOf(s) < lim && d < best) {
          best = d;
          boardable = s;
        }
      }
    }


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
    // small screens (phones, portrait) see more of the world
    const screenK = Math.max(0.55, Math.min(1, Math.min(W, H) / 760));
    const targetZoom = window.__zoom || (player.mode === 'jump' ? 1.35 : Math.max(0.5, Math.min(1.05, 1.05 - sp * 0.055))) * screenK;
    cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 2);
    cam.x += (body.x + body.vx * 18 - cam.x) * Math.min(1, dt * 4);
    cam.y += (body.y + body.vy * 18 - cam.y) * Math.min(1, dt * 4);

    const scene = {
      world, time: now, dpr, deco, stars, particles,
      ships, pilot: player.eva, me: body, drops: visible,
      sight, nearPlot, boardable, featured: bulletin.featuredPlot, nearArchitect: nearArchitect?.id || null,
      holdDrop: null, holdProgress: 0,
      corpsById: econ.corpsById, waypoint,
      sprawl, hutOf, nearHut, sprites, objective: currentTarget(body), ownsLot: world.plots.some((p) => p.owner === PLAYER),
      extraWorld: (c) => { drawRefit(c, now); shuttle.drawWorld(c, cam, now); scooters.drawWorld(c, cam); if (S.hut) { const hs = sprawl.sites.find((x) => x.id === S.hut.site); if (hs && Math.abs(cam.x - hs.x) < 2500) plot.draw(c, hs, now); } drawRegistry(c, now); progress.drawWorld(c, cam, now, nearDesk); militia.drawWorld(c, cam, now, nearMilitia); dock.drawWorld(c, cam, now, nearDock); annex.drawWorld(c, cam, now, nearAnnex); salvage.drawWorld(c, cam, now, nearSalvage); boards.drawWorld(c, cam, now, nearHall); loops.drawWorld(c, body, now); dev?.drawWorld(c, now); },
      extraMinimap: (m, tx, ty) => { m.fillStyle = '#e8c547'; m.fillRect(tx(REFIT.x) - 2, ty(REFIT.y) - 2, 4, 4); loops.drawMinimap(m, tx, ty); circuits.drawMinimap(m, tx, ty, gigs.mapView().races); drawGigMinimap(m, tx, ty); shuttle.drawMinimap(m, tx, ty); militia.drawMinimap(m, tx, ty); dock.drawMinimap(m, tx, ty); annex.drawMinimap(m, tx, ty); salvage.drawMinimap(m, tx, ty); boards.drawMinimap(m, tx, ty); scooters.drawMinimap(m, tx, ty, gigs.mapView().scooters); dev?.drawMinimap(m, tx, ty); },
      underWorld: (c, viewR) => circuits.drawWorld(c, cam, viewR, now),
    };
    drawScene(ctx, W, H, cam, scene);
    drawMinimap(mctx, 200, 150, scene);

    // prompt
    let prompt = '';
    if (nearDrop) prompt = sp >= GRAB_SPEED ? `Slow down to grab ${nearDrop.amount} scrap (SPACE)` : `E · grab ${nearDrop.amount} scrap`;
    else if (shuttle.prompt(body)) prompt = shuttle.prompt(body);
    else if (scooters.prompt(body)) prompt = scooters.prompt(body);
    else if (loops.prompt(body)) prompt = loops.prompt(body) + (nearPlot ? ` · E: Lot ${nearPlot.id} terminal` : '');
    else if (nearPlot) prompt = `E · open terminal: Lot ${nearPlot.id}`;
    else if (nearHut) prompt = `E · site ${nearHut.id}${hutOf(nearHut) ? '' : ' (vacant)'}`;
    else if (nearRefit) prompt = 'E · Kessler Refit Bay (skiff upgrades)';
    else if (nearSalvage) prompt = `E · Kessler Salvage Yard 9 (${salvage.grade()})`;
    else if (nearAnnex) prompt = `E · Ministry Allocation Annex (${annex.grade()})`;
    else if (nearHall) prompt = 'E · Hall of Records (leaderboards for every game)';
    else if (nearDock) prompt = `E · Last Mile Loading Dock 3 (${dock.grade()})`;
    else if (nearMilitia) prompt = `E · Militia Range 7 (${militia.rank()})`;
    else if (nearArchitect) prompt = `E · ${nearArchitect.name} (Architect · not for sale)`;
    else if (nearRegistry) prompt = `E · Housing Registry, ${sprawlById(nearRegistry.sprawl).title} (pick a site)`;
    else if (nearCircuit) prompt = `E · ${nearCircuit.name} leaderboard`;
    else if (nearDesk) prompt = `E · ${nearDesk.office || lore?.organizations?.find((o) => o.id === nearDesk.org)?.site || nearDesk.org} (${nearDesk.office ? 'shift work' : 'stamp · shift work'})`;
    else if (boardable) prompt = boardable === player.home ? `F · jump back into your skiff ${player.home.reg}` : `F · jump ${boardable.npc ? 'and jack the ' : 'into the '}${KINDS[boardable.kind].label.toLowerCase()}`;
    else if (waypoint) prompt = `Waypoint: ${Math.round(Math.hypot(waypoint.x - body.x, waypoint.y - body.y) / 6)} m · Q to clear`;
    const pe = $('prompt');
    pe.style.display = prompt && !modalOpen ? 'block' : 'none';
    pe.textContent = prompt;
    touch?.setPrompt(modalOpen ? '' : prompt);

    renderMarkers(body);
    gigs.render(body, now);
    const mt = missionText();
    const ls = [mt && `<span style="color:#d6f08a">${esc(mt)}</span>`, loops.status(now), circuits.status(now), shuttle.status(now)].filter(Boolean).join('<br/>');
    if (ls !== lastLoops) {
      lastLoops = ls;
      $('h-loops').innerHTML = ls;
      $('h-loops').style.display = ls ? 'block' : 'none';
    }

    // HUD (only touch the DOM when something changed)
    const hudKey = [S.cash, S.credits, S.scrap, S.xp, progress.stampCount(), S.warmth, S.souls?.count, plot.amount(), plot.rate(), modeLabel(), sectorName(world, body.x, body.y), Math.round(sp * 10)].join('|');
    if (hudKey !== lastHud) {
      lastHud = hudKey;
      $('h-cash').textContent = money(S.cash);
      $('h-credits').textContent = money(S.credits);
      $('h-scrap').textContent = S.scrap.toLocaleString();
      const lv = levelFor(S.xp);
      // Until all 13 residency stamps are in, your level is your residency: 0.00 → 0.13 → 1.
      const n = progress.stampCount();
      $('h-level').textContent = progress.processed() ? lv : residencyLevel(n);
      $('h-warmth').textContent = S.warmth;
      $('h-allotrow').hidden = !plot.amount() && !plot.rate();
      $('h-allot').textContent = plot.amount();
      $('h-allottag').textContent = plot.rate() ? `+${plot.rate()}/day · collect at hut` : '';
      const souls = S.souls?.count || 0;
      $('h-soulsrow').hidden = !souls;
      $('h-souls').textContent = souls;
      $('h-warmtier').textContent = `K · ${warmth.tier().toLowerCase()}`;
      $('h-sight').textContent = progress.processed() ? `sight ${sightRadius(lv)}m` : `residency ${n}/13 · sight ${sightRadius(lv)}m`;
      const lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
      $('h-xp').style.width = `${Math.max(0, Math.min(100, Math.round(((S.xp - lo) / (hi - lo)) * 100)))}%`;
      $('h-mode').textContent = `${pilots.name()} · ${modeLabel()}`;
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
  { const c = warmth.citizen(); log(`★ Most Humane Citizen of the Day: <b>${esc(c.name)}</b> (skiff ${esc(c.skiff)}), who ${esc(c.deed)}. Civic Warmth ${c.warmth}. (K)`, 'good'); }
  if (S.mission === 1 && !S.introSeen) {
    S.introSeen = true;
    econ.save();
    openIntro();
  }
  requestAnimationFrame(frame);
  window.__game = { world, econ, ships, player, cam, drops: () => drops, loops, sprawl, progress, gigs, shuttle, warmth, scooters, minigames, militia, dock, annex, salvage, boards: () => boards, architects: () => architects(world) };
}

boot();
