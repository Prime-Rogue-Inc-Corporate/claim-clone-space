// Economy rules + local persistence. Everything here is SIMULATED (test money,
// localStorage). The rules are the real design:
//   - Claim an empty lot: $1. Height comes from value: contested lots become the skyline.
//   - Any branded lot can be bought at 1.25x its current value. Owner can't refuse.
//   - The displaced owner gets the full price as non-cash CREDITS (closed loop).
//   - Credits are spent first on any purchase; cash tops up the rest.
//   - Scrap (from drops) and XP are game-only. They never convert to credits/cash.

// Everything is 13, except the maximum building height. Nobody knows why.
export const T13 = 13;
export const MAX_FLOORS = 100;

export const PLAYER = 'you';
export const CLAIM_PRICE = 1;
export const TAKEOVER_MULT = 1.25;
export const START_CASH = T13; // prototype test money
const KEY = 'claim-clone-space:v3'; // v3: rule-of-13 world (older saves are ignored)

// Everything is in cents. Never round to whole dollars: $1 × 1.25 would round back to $1.
export const cents = (n) => Math.round(n * 100) / 100;

export function takeoverPrice(plot) {
  return cents(plot.value * TAKEOVER_MULT);
}

export function buildPrice() {
  return CLAIM_PRICE;
}

// Skyline: a claimed lot starts at 13 floors and gains 13 floors every 2 buy-outs (×1.25 each).
// $1 = 13F; ~13 flips (≈$18) caps at 100F, the one number that isn't 13.
export function floorsFor(value) {
  if (!value || value <= 0) return 0;
  const flips = Math.log(Math.max(1, value) / CLAIM_PRICE) / Math.log(TAKEOVER_MULT);
  return Math.max(T13, Math.min(MAX_FLOORS, Math.round(T13 + (T13 / 2) * flips)));
}

// ---- Skiff upgrades: earned scrap only, never cash or credits (no paid edge). ----
// 13 tiers per route; each tier costs ×1.25 the last (the Assessor's favourite number).
// Tier I is tuned so a new pilot needs ~2–3 minutes of scrounging. Adjust with in-game notes.
const tiers13 = (base) => Array.from({ length: T13 }, (_, i) => Math.round(base * Math.pow(TAKEOVER_MULT, i)));
export const HULL_TAP_TIER = 7; // from Hull VII, plating shrugs off one drone tap per pursuit
export const UPGRADES = {
  gyros: { name: 'Gyros', what: 'Turn rate', tiers: tiers13(120) },
  dampers: { name: 'Dampeners', what: 'Grip: kills sideways drift so the skiff goes where it points', tiers: tiers13(150) },
  thrusters: { name: 'Thrusters', what: 'Acceleration + top speed', tiers: tiers13(180) },
  hull: { name: 'Hull plating', what: `Less cargo damage per scrape; from tier VII, survives a drone tap`, tiers: tiers13(240) },
  chassis: { name: 'Road chassis', what: 'Spine-rated. Spine access opens when Security goes live.', tiers: tiers13(1300), locked: true },
};

// The starter skiff handles like a shopping cart of scrap. Each of 13 tiers fixes a little of that.
export function skiffStats(u = {}) {
  const g = (u.gyros || 0) / T13, d = (u.dampers || 0) / T13, t = (u.thrusters || 0) / T13;
  return {
    thrust: 0.14 + 0.11 * t,
    max: 6.5 + 3.5 * t,
    turn: 0.035 + 0.04 * g,
    drag: 0.993 - 0.0045 * d,
    grip: 0.1 * d,
    radius: 14,
  };
}

// Roman numerals for tier labels (I–XIII)
export const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'][n] || String(n);

export function levelFor(xp) {
  return Math.floor(Math.sqrt(xp / 40)) + 1;
}

export function xpForLevel(level) {
  return (level - 1) * (level - 1) * 40;
}

// Level perk: sight radius. The only edge in the game, earned by playing.
export function sightRadius(level) {
  return 360 + (level - 1) * 90;
}

export function createEconomy(world) {
  const saved = load();
  const state = {
    cash: START_CASH, // test money only
    credits: 0,
    scrap: 0,
    xp: 0,
    acceptedRisk: false,
    brandConsent: false,
    claimedDrops: {},
    overrides: {},
    hut: null,
    upgrades: {},
    mission: 1, // onboarding: 1 = scrounge scrap, 2 = fit first upgrade, 3 = build a home (hut), 0 = done
    ...saved,
  };

  const corpsById = Object.fromEntries(world.corps.map((c) => [c.id, c]));
  const listeners = [];

  function plotById(id) {
    return world.plots.find((p) => p.id === id);
  }

  // Apply saved overrides on top of the static world file.
  for (const [id, o] of Object.entries(state.overrides)) {
    const p = plotById(Number(id));
    if (p) Object.assign(p, o);
  }

  function persistPlot(p) {
    state.overrides[p.id] = { owner: p.owner, value: p.value, floors: p.floors, history: p.history, brand: p.brand };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* private mode etc. — play continues in memory */
    }
  }

  function emit(type, payload) {
    for (const fn of listeners) fn(type, payload);
  }

  function ownerName(owner) {
    if (!owner) return 'Unclaimed';
    if (owner === PLAYER) return 'You';
    return corpsById[owner]?.name || owner;
  }

  // Credits first, then cash. Returns false if the wallet can't cover it.
  function pay(amount) {
    if (cents(state.credits + state.cash) < amount) return false;
    const fromCredits = cents(Math.min(state.credits, amount));
    state.credits = cents(state.credits - fromCredits);
    state.cash = cents(state.cash - (amount - fromCredits));
    return { fromCredits, fromCash: cents(amount - fromCredits) };
  }

  function quote(amount) {
    const fromCredits = cents(Math.min(state.credits, amount));
    return { total: amount, fromCredits, fromCash: cents(amount - fromCredits), affordable: cents(state.credits + state.cash) >= amount };
  }

  function build(plot) {
    if (plot.owner) return { ok: false, reason: 'Lot already claimed.' };
    const price = buildPrice();
    const paid = pay(price);
    if (!paid) return { ok: false, reason: 'Not enough credits + cash.' };
    plot.owner = PLAYER;
    plot.value = price;
    plot.floors = floorsFor(price);
    plot.history.push({ t: Date.now(), kind: 'build', to: PLAYER, price });
    plot.brand = { name: `Lot ${plot.id}`, tagline: '', color: '#c9a227', link: '' };
    persistPlot(plot);
    save();
    emit('bought', { plot, price, paid });
    return { ok: true, price, paid };
  }

  function takeover(plot, buyer = PLAYER) {
    if (!plot.owner || plot.owner === buyer) return { ok: false, reason: 'Nothing to take over.' };
    const price = takeoverPrice(plot);
    const prev = plot.owner;
    let paid = null;
    if (buyer === PLAYER) {
      paid = pay(price);
      if (!paid) return { ok: false, reason: 'Not enough credits + cash.' };
    }
    if (prev === PLAYER) state.credits = cents(state.credits + price); // displaced owner made whole in credits
    plot.owner = buyer;
    plot.value = price;
    plot.floors = floorsFor(price);
    plot.history.push({ t: Date.now(), kind: 'takeover', from: prev, to: buyer, price });
    if (buyer !== PLAYER) {
      const corp = corpsById[buyer];
      plot.brand = { name: plot.brand?.name || `Lot ${plot.id}`, tagline: 'Acquired. Resistance is inefficient.', color: corp?.color || '#555', link: '' };
    } else {
      plot.brand = { ...plot.brand, color: '#c9a227' };
    }
    persistPlot(plot);
    save();
    if (prev === PLAYER) {
      emit('lost', { plot, price, buyer, buyback: takeoverPrice(plot), credits: state.credits });
    }
    if (buyer === PLAYER) emit('bought', { plot, price, paid });
    return { ok: true, price, paid };
  }

  function brand(plot, fields) {
    if (plot.owner !== PLAYER) return { ok: false, reason: 'Only the owner can brand this lot.' };
    const clean = (s, n) => String(s || '').slice(0, n);
    let link = clean(fields.link, 200).trim();
    if (link && !/^https:\/\//i.test(link)) link = '';
    plot.brand = {
      name: clean(fields.name, 32) || `Lot ${plot.id}`,
      tagline: clean(fields.tagline, 80),
      color: /^#[0-9a-f]{6}$/i.test(fields.color) ? fields.color : '#c9a227',
      link,
    };
    persistPlot(plot);
    save();
    return { ok: true };
  }

  // Game-only rewards (jobs, races, escapes). Scrap + XP, nothing with outside value.
  function reward(amount) {
    const before = levelFor(state.xp);
    const n = Math.max(1, Math.round(amount));
    state.scrap += n;
    state.xp += n;
    save();
    const after = levelFor(state.xp);
    return { amount: n, levelUp: after > before ? after : null };
  }

  function fine(amount) {
    state.scrap = Math.max(0, state.scrap - Math.round(amount));
    save();
  }

  // ---- The Sprawl: huts built with scrap only. Free to anyone who plays. Never branded. ----
  // 13 hut tiers. Art is shared across groups: tiers 1–4 shack, 5–8 hut, 9–13 bunker.
  const HUT_NAMES = ['Lean-to', 'Scrap shack', 'Tarp shack', 'Patched shack', 'Hab hut', 'Insulated hut', 'Two-room hut', 'Chimney hut',
    'Bunker', 'Sandbagged bunker', 'Antenna bunker', 'Fortified bunker', 'The Big Bunker'];
  const HUT_TIERS = HUT_NAMES.map((name, i) => ({ name, cost: Math.round(150 * Math.pow(TAKEOVER_MULT, i)) }));

  function buildHut(siteId) {
    if (state.hut) return { ok: false, reason: `You already have a hut (${state.hut.site}). One per pilot.` };
    const cost = HUT_TIERS[0].cost;
    if (state.scrap < cost) return { ok: false, reason: `Need ${cost} scrap. You have ${state.scrap}.` };
    state.scrap -= cost; // spends scrap only; XP is kept
    state.hut = { site: siteId, tier: 0, built: Date.now() };
    const missionDone = state.mission === 3;
    if (missionDone) state.mission = 0;
    save();
    return { ok: true, missionDone };
  }

  function upgradeHut() {
    if (!state.hut) return { ok: false, reason: 'No hut.' };
    const next = HUT_TIERS[state.hut.tier + 1];
    if (!next) return { ok: false, reason: 'The Big Bunker. This is as good as it gets out here.' };
    if (state.scrap < next.cost) return { ok: false, reason: `Need ${next.cost} scrap. You have ${state.scrap}.` };
    state.scrap -= next.cost;
    state.hut.tier++;
    save();
    return { ok: true };
  }

  function buyUpgrade(id) {
    const u = UPGRADES[id];
    if (!u) return { ok: false, reason: 'Unknown upgrade.' };
    if (u.locked) return { ok: false, reason: 'Not available yet. Spine Security isn\'t live.' };
    const tier = state.upgrades[id] || 0;
    const cost = u.tiers[tier];
    if (cost == null) return { ok: false, reason: 'Maxed out.' };
    if (state.scrap < cost) return { ok: false, reason: `Need ${cost} scrap. You have ${state.scrap}.` };
    state.scrap -= cost; // scrap only; XP is kept
    state.upgrades[id] = tier + 1;
    if (state.mission === 1 || state.mission === 2) state.mission = state.hut ? 0 : 3;
    save();
    return { ok: true, tier: tier + 1, mission: state.mission };
  }

  function claimDrop(drop, multiplier = 1) {
    if (state.claimedDrops[drop.key]) return null;
    const before = levelFor(state.xp);
    state.claimedDrops[drop.key] = Date.now();
    const amount = Math.max(1, Math.round(drop.amount * multiplier));
    state.scrap += amount;
    state.xp += amount;
    // keep the claimed map small
    const keys = Object.keys(state.claimedDrops);
    if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete state.claimedDrops[k];
    save();
    const after = levelFor(state.xp);
    return { amount, levelUp: after > before ? after : null };
  }

  // NPC market: corps buy lots off each other, and sometimes off you.
  // Corps also claim empty $1 lots on their own, but always leave a few for players.
  const NPC_PREFIX = ['Hollow', 'Ash', 'Iron', 'Grey', 'Null', 'Rust', 'Sable', 'Tithe', 'Gallows', 'Slag', 'Pallid', 'Cinder'];
  const NPC_SUFFIX = ['Foundry', 'Arcology', 'Refinery', 'Spire', 'Hab-Block', 'Depot', 'Relay', 'Silo', 'Exchange', 'Kiln', 'Yard', 'Works'];
  function npcClaim(rng) {
    const empty = world.plots.filter((p) => !p.owner);
    if (empty.length <= 6) return false;
    const plot = empty[Math.floor(rng() * empty.length)];
    const corp = world.corps[Math.floor(rng() * world.corps.length)];
    plot.owner = corp.id;
    plot.value = CLAIM_PRICE;
    plot.floors = floorsFor(CLAIM_PRICE);
    plot.history.push({ t: Date.now(), kind: 'build', to: corp.id, price: CLAIM_PRICE });
    plot.brand = {
      name: `${NPC_PREFIX[Math.floor(rng() * NPC_PREFIX.length)]} ${NPC_SUFFIX[Math.floor(rng() * NPC_SUFFIX.length)]}`,
      tagline: corp.motto || '',
      color: corp.color,
      link: '',
    };
    persistPlot(plot);
    save();
    emit('market', { plot, buyer: corp.id, claimed: true });
    return true;
  }

  function npcTick(rng) {
    if (rng() < 0.3 && npcClaim(rng)) return;
    const claimed = world.plots.filter((p) => p.owner);
    if (!claimed.length) return;
    const mine = claimed.filter((p) => p.owner === PLAYER);
    let target;
    if (mine.length && rng() < 0.45) target = mine[Math.floor(rng() * mine.length)];
    else target = claimed[Math.floor(rng() * claimed.length)];
    const buyers = world.corps.filter((c) => c.id !== target.owner);
    const buyer = buyers[Math.floor(rng() * buyers.length)];
    takeover(target, buyer.id);
    emit('market', { plot: target, buyer: buyer.id });
  }

  function reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    location.reload();
  }

  return {
    state,
    corpsById,
    ownerName,
    quote,
    build,
    takeover,
    brand,
    claimDrop,
    reward,
    fine,
    buyUpgrade,
    HUT_TIERS,
    buildHut,
    upgradeHut,
    npcTick,
    save,
    reset,
    on: (fn) => listeners.push(fn),
    plotById,
  };
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
