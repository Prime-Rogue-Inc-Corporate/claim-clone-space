// Civic Warmth™ — administered by the Bureau of Public Cheer.
// A friendly little number. Contributing to society warms it; being a degenerate cools it.
// Consequences come later (see the roadmap). For now it's a number, a tier and a feeling.
import { mulberry32, hashStr, pick, randInt } from './rng.js';

export const WARMTH_START = 650;
export const WARMTH_MAX = 1300;
export const WARMTH_TIERS = ['Frozen Out', 'Glacial', 'Frostbitten', 'Chilly', 'Cool', 'Tepid', 'Lukewarm', 'Mild', 'Warm', 'Toasty', 'Glowing', 'Radiant', 'Incandescent'];
export const warmthTier = (w) => WARMTH_TIERS[Math.max(0, Math.min(12, Math.floor(w / 100)))];

// How the Bureau scores everyday life. Positive = contributing, negative = degeneracy.
export const WARMTH_RULES = {
  delivery: (d) => (d.damage === 0 ? 10 : 5),
  shuttle: (d) => 13 + (d.rating >= 90 ? 13 : 0) + (d.onTime ? 13 : 0),
  stamp: () => 3,
  processed: () => 26,
  'track-lap': () => 1,
  lap: () => 1,
  hut: () => 5,
  scrape: () => -1,
  late: () => -5,
  'wrong-way': () => -5,
  bailed: () => -13,
  jack: () => -13,
  escape: () => -13,
  expired: () => -13,
  busted: () => -26,
  'passenger-incident': () => -39,
  'shuttle-abandon': () => -13,
  'void-dump': (d) => -Math.min(130, 13 * (d.passengers || 1)),
};

// The Bureau's pick for today. Until accounts exist it's a seeded resident everyone sees the same;
// once there's a server, it's the real pilot with the biggest gain today (skiff number unless they opt in to a name).
const CITIZENS = ['Mother Kade', 'Orrin Vasquez-Pell', 'Aunt Tallow', 'Sixpence', 'the Deacon', 'Old Sorrow', 'Jessop Nine', 'Vel Okonkwo', 'Rook Marsh', 'Ninefingers', 'Pike Dunmore', 'the twins (jointly)', 'Lark Ibsen'];
const DEEDS = [
  'drove 13 Humane Shuttle runs without a single passenger complaint',
  'returned a lost ration brick to its rightful owner, mostly uneaten',
  'reported three neighbours for insufficient cheer',
  'delivered a sealed casket on time and did not open it',
  'smiled at a Null Sector drone',
  'collected every residency stamp and asked for more',
  'swept the Spine Run gate with their own sleeve',
  'volunteered for a 2.9-second EVA test twice',
  'paid a fine they did not owe, out of respect',
  'rebuilt a neighbour’s lean-to after the storm (and charged nothing)',
  'recited the Compliance Oath from memory, with feeling',
  'drove the shuttle the long way so the passengers could see the slag fields',
  'wrote the Bureau a thank-you note',
];

export function citizenOfDay(day) {
  const rng = mulberry32(hashStr(`citizen:${day}`));
  return {
    day,
    name: pick(rng, CITIZENS),
    skiff: `#${String(randInt(rng, 2, 412)).padStart(3, '0')}`,
    warmth: randInt(rng, 1150, 1296),
    gained: randInt(rng, 80, 169), // warmth gained today: beat this and you'd have been the pick
    deed: pick(rng, DEEDS),
  };
}

export const today = () => new Date().toISOString().slice(0, 10);
