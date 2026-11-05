// Economy rules + local persistence. Everything here is SIMULATED (test money,
// localStorage). The rules are the real design:
//   - Build a new lot: $5 per floor.
//   - Any branded lot can be bought at 1.25x its current value. Owner can't refuse.
//   - The displaced owner gets the full price as non-cash CREDITS (closed loop).
//   - Credits are spent first on any purchase; cash tops up the rest.
//   - Scrap (from drops) and XP are game-only. They never convert to credits/cash.

export const PLAYER = 'you';
export const FLOOR_PRICE = 5;
export const TAKEOVER_MULT = 1.25;
const KEY = 'claim-clone-space:v1';

export function takeoverPrice(plot) {
  return Math.round(plot.value * TAKEOVER_MULT);
}

export function buildPrice(floors) {
  return floors * FLOOR_PRICE;
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
    cash: 2500, // test money only
    credits: 0,
    scrap: 0,
    xp: 0,
    acceptedRisk: false,
    brandConsent: false,
    claimedDrops: {},
    overrides: {},
    hut: null,
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
    if (state.credits + state.cash < amount) return false;
    const fromCredits = Math.min(state.credits, amount);
    state.credits -= fromCredits;
    state.cash -= amount - fromCredits;
    return { fromCredits, fromCash: amount - fromCredits };
  }

  function quote(amount) {
    const fromCredits = Math.min(state.credits, amount);
    return { total: amount, fromCredits, fromCash: amount - fromCredits, affordable: state.credits + state.cash >= amount };
  }

  function build(plot, floors) {
    if (plot.owner) return { ok: false, reason: 'Lot already claimed.' };
    const price = buildPrice(floors);
    const paid = pay(price);
    if (!paid) return { ok: false, reason: 'Not enough credits + cash.' };
    plot.owner = PLAYER;
    plot.floors = floors;
    plot.value = price;
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
    if (prev === PLAYER) state.credits += price; // displaced owner made whole in credits
    plot.owner = buyer;
    plot.value = price;
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
    save();
    return { ok: true };
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
  function npcTick(rng) {
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
