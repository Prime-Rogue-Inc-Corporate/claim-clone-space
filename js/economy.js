// Economy rules + local persistence. Everything here is SIMULATED (test money,
// localStorage). The rules are the real design:
//   - Claim an empty lot: $1. Height comes from value: contested lots become the skyline.
//   - Any branded lot can be bought at 1.25x its current value. Owner can't refuse.
//   - The displaced owner gets the full price as non-cash CREDITS (closed loop).
//   - Credits are spent first on any purchase; cash tops up the rest.
//   - Scrap (from drops) and XP are game-only. They never convert to credits/cash.

export const PLAYER = 'you';
export const CLAIM_PRICE = 1;
export const TAKEOVER_MULT = 1.25;
export const START_CASH = 10; // prototype test money
const KEY = 'claim-clone-space:v2'; // v2: $1 pricing reset (old v1 saves are ignored)

// Everything is in cents. Never round to whole dollars: $1 × 1.25 would round back to $1.
export const cents = (n) => Math.round(n * 100) / 100;

export function takeoverPrice(plot) {
  return cents(plot.value * TAKEOVER_MULT);
}

export function buildPrice() {
  return CLAIM_PRICE;
}

// Skyline: every buy-out (×1.25) adds ~6 floors. $1 = 10F, ~15 flips (≈$28) = 100F.
export function floorsFor(value) {
  if (!value || value <= 0) return 0;
  const flips = Math.log(Math.max(1, value) / CLAIM_PRICE) / Math.log(TAKEOVER_MULT);
  return Math.max(10, Math.min(100, Math.round(10 + 6 * flips)));
}

// ---- Skiff upgrades: earned scrap only, never cash or credits (no paid edge). ----
// Tuned so the first upgrade takes a new pilot ~2–3 minutes of scrounging (drops avg ~35 scrap,
// roughly one found per minute in a bad skiff, plus freight). Adjust with in-game notes.
export const UPGRADES = {
  gyros: { name: 'Gyros', what: 'Turn rate', tiers: [120, 260, 450] },
  dampers: { name: 'Dampeners', what: 'Kills sideways drift so the skiff goes where it points', tiers: [150, 320, 550] },
  thrusters: { name: 'Thrusters', what: 'Acceleration + top speed', tiers: [180, 380, 650] },
  hull: { name: 'Hull plating', what: 'Less cargo damage; survives a drone tap', tiers: [240, 500] },
  chassis: { name: 'Road chassis', what: 'Spine-rated. Spine access opens when Security goes live.', tiers: [1200], locked: true },
};

// The starter skiff handles like a shopping cart of scrap. Upgrades fix that.
export function skiffStats(u = {}) {
  const g = u.gyros || 0, d = u.dampers || 0, t = u.thrusters || 0;
  return {
    thrust: 0.14 + 0.035 * t,
    max: 6.5 + 1.0 * t,
    turn: 0.035 + 0.012 * g,
    drag: 0.993 - 0.0015 * d,
    grip: [0, 0.025, 0.055, 0.09][d],
    radius: 14,
  };
}

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
  const HUT_TIERS = [
    { name: 'Scrap shack', cost: 150 },
    { name: 'Hab hut', cost: 300 },
    { name: 'Bunker', cost: 600 },
  ];

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
    if (!next) return { ok: false, reason: 'Already a bunker. This is as good as it gets out here.' };
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
