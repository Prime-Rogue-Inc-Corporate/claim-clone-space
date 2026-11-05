// Deterministic helpers shared by the browser and the GitHub Actions scripts.
// Same seed in = same world out, on every client, with no server.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}
