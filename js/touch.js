// Touch controls for phones and tablets (portrait and landscape).
// - Left: a heading stick. Point where you want to go: the ship turns toward it and thrusts
//   in proportion to how far you push. (Works with the starter skiff and the dog-shit shuttle.)
// - Right: BRAKE (hold), E (use / grab / dock), F (jump), X (dump / abandon).
// - ☰ opens every menu the keyboard has (gigs, card, achievements, warmth, boards, ledger, wiki…).
// Shown automatically on touch screens; force it on a desktop with ?touch.

export function touchWanted() {
  try {
    if (new URLSearchParams(location.search).has('touch')) return true;
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  } catch { return false; }
}

const MENU = [
  ['p', 'Pilot / sign in'], ['g', 'Gigs'], ['c', 'Residency card'], ['j', 'Achievements'], ['k', 'Civic Warmth'], ['b', 'Leaderboards'],
  ['tab', 'Ledger'], ['l', 'Wiki'], ['q', 'Clear waypoint'], ['h', 'Help'],
];

export function createTouch({ onPress, getBody, dev = false, onMenu = null }) {
  const active = touchWanted();
  const state = { stick: null, brake: false };
  if (!active) return { active, input: () => null, setPrompt: () => {} };
  document.body.classList.add('touch');

  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="t-stick"><div id="t-ring"></div><div id="t-knob"></div></div>
    <div id="t-btns">
      <button id="t-brake" class="big">BRAKE</button>
      <button id="t-e" class="big act">E</button>
      <button id="t-f">F · jump</button>
      <button id="t-x">X · dump</button>
    </div>
    <button id="t-menu" aria-label="Menu">☰</button>
    <div id="t-sheet" hidden>
      ${MENU.map(([k, label]) => `<button data-k="${k}">${label}</button>`).join('')}
      ${dev ? '<button data-k="n">Note (staging)</button><button data-k="r">Roadmap (staging)</button>' : ''}
      <button data-fs="1">Full screen</button>
      <button data-close="1">Close</button>
    </div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector(id);

  // ---- heading stick ----
  const stickEl = $('#t-stick'), knob = $('#t-knob');
  const R = 56;
  let pid = null, cx = 0, cy = 0;
  stickEl.addEventListener('pointerdown', (e) => {
    pid = e.pointerId;
    stickEl.setPointerCapture(pid);
    const r = stickEl.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    move(e);
    e.preventDefault();
  });
  stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
  const release = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    state.stick = null;
    knob.style.transform = 'translate(-50%, -50%)';
  };
  stickEl.addEventListener('pointerup', release);
  stickEl.addEventListener('pointercancel', release);
  function move(e) {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const m = Math.hypot(dx, dy);
    if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    state.stick = { a: Math.atan2(dy, dx), mag: Math.min(1, m / R) };
  }

  // ---- buttons ----
  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, off);
  };
  hold($('#t-brake'), () => (state.brake = true), () => (state.brake = false));
  const tap = (el, k) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); onPress(k); });
  tap($('#t-e'), 'e');
  tap($('#t-f'), 'f');
  tap($('#t-x'), 'x');
  const sheet = $('#t-sheet');
  $('#t-menu').addEventListener('pointerdown', (e) => { e.preventDefault(); sheet.hidden = !sheet.hidden; if (!sheet.hidden) onMenu?.(); });
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    sheet.hidden = true;
    if (b.dataset.k) onPress(b.dataset.k);
    if (b.dataset.fs) {
      const d = document.documentElement;
      (document.fullscreenElement ? document.exitFullscreen() : d.requestFullscreen?.())?.catch?.(() => {});
    }
  });

  // Turn the stick into the same booleans the keyboard produces.
  function input() {
    const s = state.stick;
    const out = { up: false, down: false, left: false, right: false, brake: state.brake };
    if (!s || s.mag < 0.2) return out;
    const body = getBody();
    let diff = s.a - body.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (diff < -0.08) out.left = true;
    if (diff > 0.08) out.right = true;
    // thrust when roughly facing the stick; push harder = more throttle (pulsed)
    if (Math.abs(diff) < 1.0) out.up = s.mag > 0.9 || (performance.now() / 60) % 1 < s.mag;
    return out;
  }

  // The E button shows what it will do (from the on-screen prompt).
  let lastLabel = '';
  function setPrompt(text) {
    const on = !!(text && /\bE\b/.test(text));
    const key = String(on);
    if (key === lastLabel) return;
    lastLabel = key;
    $('#t-e').classList.toggle('ready', on);
  }

  return { active, input, setPrompt };
}
