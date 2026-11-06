// Residency card + achievements. No backend: everything lives in the save (econ.state).
//
// Residency: 13 stamps, one from each organization. Each stamp is worth 0.01, so a new pilot is
// Level 0.00 → 0.13; the 13th stamp makes you Level 1, "Fully Processed". Some stamps come from
// doing the thing (fit an upgrade, finish a lap); systems that don't exist yet get a stand-in
// action at the org's desk. Desks sit on the Spine, one per block.
//
// Achievements: data/achievements.json. 13 categories × 13 known + 169 hidden; only some are
// live. Shame ones are hidden until earned and pay a cosmetic once; the rest pay scrap.
import { T13 } from './economy.js';

const STAMP_SCRAP = T13; // the stand-in fee where a desk charges one
const PROCESSED_REWARD = T13 * 10;

// How each org's stamp is earned. 'event' = stamped automatically when that game event fires.
// 'desk' = a stand-in action at the desk (button). Both = either works.
const STAMPS = {
  vanta: { event: 'jump', how: 'Jump ship-to-ship (F). The Science Centre logs your exposure.' },
  kessler: { event: 'upgrade', how: 'Fit any upgrade at the Kessler Refit Bay.' },
  ashiron: { desk: 'smelt', cost: STAMP_SCRAP, how: `Work one shift at the Foundry: smelt ${STAMP_SCRAP} scrap.` },
  null: { event: 'escape', desk: 'fine', cost: STAMP_SCRAP, how: `Survive a pursuit, or pay a token ${STAMP_SCRAP}-scrap fine at the Impound Yard.` },
  cinder: { desk: 'register', how: 'Register for your air, water and oxygen ration at the Meter Office.' },
  gullet: { desk: 'ration', gift: T13, how: `Collect your first ration at the Depot (${T13} scrap of ration bricks).` },
  lastmile: { event: 'delivery', how: 'Complete one freight delivery.' },
  gavel: { desk: 'bid', cost: 1, how: 'Place a bid at the Auction House (1 scrap; skiff-number auctions come later).' },
  mercy: { event: 'lap', how: "Finish one Spine Run lap (the gold ring south of the Spine's west end)." },
  ministry: { desk: 'ministry', how: 'Get stamped at the Ministry, north of the Spine in the heat zone. Null Sector will notice.' },
  assessor: { event: 'ledger', how: "Read the Assessor's ledger (TAB). No purchase necessary." },
  registry: { event: 'hut', how: 'Claim a home at either Sprawl Housing Registry.' },
  bureau: { desk: 'oath', how: 'Swear the Compliance Oath at the Bulletin Tower.' },
};

// Desk positions: one org per block (block 1 = west end). Kessler, Mercy and the Registry already
// have real places (Refit Bay, Spine Run gate, Housing Registries), so their blocks have no desk.
const BLOCK_ORDER = ['mercy', 'vanta', 'ashiron', 'null', 'cinder', 'gullet', 'kessler', 'lastmile', 'gavel', 'ministry', 'assessor', 'bureau', 'registry'];
const NO_DESK = new Set(['mercy', 'kessler', 'registry']);

export function residencyLevel(n) {
  return n >= T13 ? '1' : `0.${String(n).padStart(2, '0')}`;
}

export function createProgress({ world, econ, lore, achievements, log, esc, openModal, closeModal, sprites, warmth = null, setWaypoint, addHeat, raceStart, refit, registries }) {
  const S = econ.state;
  S.stamps ||= {};
  S.ach ||= {};
  S.achProg ||= {};
  S.cosmetics ||= [];
  const orgs = lore?.organizations || world.corps;
  const orgById = Object.fromEntries(orgs.map((o) => [o.id, o]));
  const defs = achievements?.achievements || [];
  const cats = achievements?.categories || [];

  const blocks = world.spine.blocks || [];
  const desks = BLOCK_ORDER.map((id, k) => {
    const b = blocks[k];
    if (!b || NO_DESK.has(id) || !orgById[id]) return null;
    const north = id === 'ministry';
    return { org: id, x: (b.x0 + b.x1) / 2 + 300, y: north ? -900 : 420, north };
  }).filter(Boolean);
  const placeOf = (id) => {
    const d = desks.find((d) => d.org === id);
    if (d) return { x: d.x, y: d.y };
    if (id === 'kessler') return refit;
    if (id === 'mercy') return { x: raceStart[0], y: raceStart[1] };
    if (id === 'registry') return registries[0];
    return null;
  };

  const stampCount = () => Object.keys(S.stamps).filter((id) => STAMPS[id]).length;
  const processed = () => stampCount() >= T13;

  function stamp(id) {
    if (S.stamps[id] || !STAMPS[id]) return false;
    S.stamps[id] = Date.now();
    econ.save();
    const n = stampCount();
    const org = orgById[id];
    log(`🗳 RESIDENCY STAMP: <b>${esc(org?.name || id)}</b>. Level ${residencyLevel(n)} (${n}/${T13}).`, 'money');
    emit('stamp', { org: id, n });
    if (n >= T13) {
      const r = econ.reward(PROCESSED_REWARD);
      log(`LEVEL 1 · <b>FULLY PROCESSED</b>. The Bureau of Public Cheer congratulates you. +${r.amount} scrap.`, 'good');
      emit('processed', {});
    }
    return true;
  }

  // ---- achievements ----
  function matches(def, data) {
    for (const [k, v] of Object.entries(def.eq || {})) if (data?.[k] !== v) return false;
    for (const [k, v] of Object.entries(def.min || {})) if (!(data?.[k] >= v)) return false;
    for (const [k, v] of Object.entries(def.max || {})) if (!(data?.[k] <= v)) return false;
    return true;
  }
  function earn(def) {
    S.ach[def.id] = Date.now();
    if (def.shame) {
      if (def.cosmetic && !S.cosmetics.includes(def.cosmetic)) S.cosmetics.push(def.cosmetic);
      log(`🏅 <b>${esc(def.name)}</b> (shame). ${esc(def.desc)} You get a cosmetic: <i>${esc(def.cosmetic)}</i>.`, 'good');
    } else {
      const r = econ.reward(def.reward || T13);
      log(`🏅 <b>${esc(def.name)}</b>. ${esc(def.desc)} +${r.amount} scrap.`, 'good');
    }
    econ.save();
  }

  // Every game event goes through here: stamps first, then achievement progress.
  function emit(type, data = {}) {
    const dw = warmth ? warmth.apply(type, data) : 0;
    for (const [id, st] of Object.entries(STAMPS)) if (st.event === type) stamp(id);
    let dirty = false;
    for (const def of defs) {
      if (def.on !== type || S.ach[def.id] || !matches(def, data)) continue;
      const need = def.n || 1;
      if (def.distinct) {
        const seen = new Set(S.achProg[def.id] || []);
        seen.add(String(data[def.distinct]));
        S.achProg[def.id] = [...seen];
        dirty = true;
        if (seen.size >= need) earn(def);
      } else {
        S.achProg[def.id] = (S.achProg[def.id] || 0) + 1;
        dirty = true;
        if (S.achProg[def.id] >= need) earn(def);
      }
    }
    if (dirty) econ.save();
    if (dw) emit('warmth', { value: S.warmth });
  }
  const progressOf = (def) => {
    const p = S.achProg[def.id];
    return Array.isArray(p) ? p.length : p || 0;
  };

  // ---- desks ----
  function nearDesk(x, y) {
    return desks.find((d) => Math.hypot(d.x - x, d.y - y) < 60) || null;
  }

  function openDesk(desk) {
    const org = orgById[desk.org];
    const st = STAMPS[desk.org];
    const done = S.stamps[desk.org];
    const canDesk = st.desk && !done;
    const cost = st.cost || 0;
    const label = { smelt: `Work a shift (${cost} scrap)`, fine: `Pay the fine (${cost} scrap)`, register: 'Register', ration: 'Collect ration', bid: `Bid ${cost} scrap`, ministry: 'Get stamped', oath: 'I swear' }[st.desk];
    openModal(
      `<h2>${esc(org.site || org.name)}</h2>
       <div class="sub">${esc(org.name)} · ${esc(org.type || '')} · “${esc(org.motto || '')}”</div>
       <div class="explain">${esc(org.does || '')}<br/><br/>
       <b>Residency stamp:</b> ${esc(st.how)}<br/>
       ${done ? '<b style="color:#d6f08a">STAMPED.</b>' : st.event && !st.desk ? '<i>Stamped automatically when you do it.</i>' : ''}</div>
       <div class="buttons">${canDesk ? `<button class="primary" id="act" ${S.scrap >= cost ? '' : 'disabled'}>${esc(label)}</button>` : ''}<button id="card">Residency card (C)</button><button id="x">Close</button></div>
       <div class="err" id="err">${canDesk && S.scrap < cost ? `Need ${cost} scrap.` : ''}</div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#card').addEventListener('click', openCard);
        el.querySelector('#act')?.addEventListener('click', () => {
          if (cost) econ.fine(cost);
          if (st.gift) econ.reward(st.gift);
          if (st.desk === 'ministry') addHeat(1, 'loitering at the Ministry');
          stamp(desk.org);
          openDesk(desk);
        });
      }
    );
  }

  function drawWorld(c, cam, time, near) {
    for (const d of desks) {
      if (Math.abs(cam.x - d.x) > 2500) continue;
      const org = orgById[d.org];
      const done = S.stamps[d.org];
      const img = sprites?.get(`logo_${d.org}`);
      c.strokeStyle = near === d ? '#e8c547' : done ? 'rgba(214,240,138,0.6)' : 'rgba(232,197,71,0.45)';
      c.lineWidth = 2;
      if (img) {
        c.drawImage(img, d.x - 30, d.y - 46, 60, 60);
      } else {
        c.fillStyle = org.color || '#888';
        c.globalAlpha = 0.85;
        c.fillRect(d.x - 26, d.y - 18, 52, 30);
        c.globalAlpha = 1;
        c.strokeRect(d.x - 26, d.y - 18, 52, 30);
      }
      c.beginPath();
      c.arc(d.x, d.y + 40, near === d ? 18 + Math.sin(time / 200) * 2 : 14, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = done ? '#d6f08a' : '#e8c547';
      c.font = 'bold 12px monospace';
      c.textAlign = 'center';
      c.fillText(done ? '✓ STAMPED' : 'STAMP', d.x, d.y + 26);
      c.fillStyle = 'rgba(232,220,190,0.8)';
      c.font = 'bold 12px monospace';
      c.fillText((org.site || org.name).toUpperCase(), d.x, d.y - 54);
      c.font = '10px monospace';
      c.fillStyle = 'rgba(232,220,190,0.55)';
      c.fillText(`${org.name} · E at the pad`, d.x, d.y + 70);
    }
  }

  // ---- C: residency card ----
  function openCard() {
    emit('card');
    const n = stampCount();
    const rows = BLOCK_ORDER.map((id, k) => {
      const org = orgById[id];
      if (!org) return '';
      const done = S.stamps[id];
      return `<tr><td style="width:22px;color:${done ? '#d6f08a' : '#5b5648'}">${done ? '■' : '□'}</td>
        <td style="width:34px"><img src="assets/sprites/logo_${id}.png" width="30" height="30" alt="" style="${done ? '' : 'opacity:.45;filter:grayscale(1)'}" onerror="this.remove()"/></td>
        <td><b>${esc(org.name)}</b> <span class="sub">· ${esc(org.site || '')} · block ${k + 1}</span><div class="sub" style="margin:2px 0 0">${esc(STAMPS[id].how)}</div></td>
        <td style="width:90px;text-align:right">${done ? '<span class="sub">stamped</span>' : placeOf(id) ? `<button data-wp="${id}">Waypoint</button>` : ''}</td></tr>`;
    }).join('');
    openModal(
      `<h2>RESIDENCY CARD · LEVEL ${residencyLevel(n)}</h2>
       <div class="sub">Skiff #001 · ${n}/${T13} stamps · ${processed() ? '<b style="color:#d6f08a">FULLY PROCESSED</b>' : `the 13th stamp makes you Level 1 (“Fully Processed”) and pays ${PROCESSED_REWARD} scrap`}</div>
       <table>${rows}</table>
       <div class="buttons"><button id="ach">Achievements (J)</button><button class="primary" id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#ach').addEventListener('click', openAchievements);
        el.querySelectorAll('[data-wp]').forEach((b) =>
          b.addEventListener('click', () => {
            setWaypoint(placeOf(b.dataset.wp));
            closeModal();
            log(`Waypoint set: ${esc(orgById[b.dataset.wp].site || orgById[b.dataset.wp].name)}.`);
          })
        );
      }
    );
  }

  // ---- J: achievements ----
  function openAchievements() {
    const live = defs.length;
    const earned = defs.filter((d) => S.ach[d.id]).length;
    const sections = cats.map((cat) => {
      const mine = defs.filter((d) => d.cat === cat.id);
      const items = mine.map((d) => {
        const got = S.ach[d.id];
        if (d.shame && !got) return `<div class="ach hidden">??? <span class="sub">hidden until earned</span></div>`;
        const need = d.n || 1;
        const prog = need > 1 && !got ? ` <span class="sub">${Math.min(progressOf(d), need)}/${need}</span>` : '';
        const pay = d.shame ? `cosmetic: ${esc(d.cosmetic)}` : `${d.reward || T13} scrap`;
        return `<div class="ach ${got ? 'got' : ''}">${got ? '■' : '□'} <b>${esc(d.name)}</b>${prog} <span class="sub">· ${esc(d.desc)} · ${pay}</span></div>`;
      }).join('');
      const unannounced = Math.max(0, T13 - mine.length);
      const gotHere = mine.filter((d) => S.ach[d.id]).length;
      return `<h3><img src="assets/sprites/ach_${cat.id}.png" width="22" height="22" alt="" style="vertical-align:middle;margin-right:6px" onerror="this.remove()"/>${esc(cat.name)} <span class="sub">${gotHere}/${T13}</span></h3>${items}${unannounced ? `<div class="ach hidden">+${unannounced} unannounced</div>` : ''}`;
    }).join('');
    openModal(
      `<h2>ACHIEVEMENTS</h2>
       <div class="sub">${earned} earned · ${live} live of ${cats.length * T13} known · plus ${cats.length * T13} hidden. Shame ones stay hidden until you earn them, and pay a cosmetic.</div>
       ${S.cosmetics.length ? `<div class="sub">Cosmetics: ${S.cosmetics.map(esc).join(', ')} <i>(shown on your skiff later)</i></div>` : ''}
       <div class="achlist">${sections}</div>
       <div class="buttons"><button id="card">Residency card (C)</button><button class="primary" id="x">Close</button></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#card').addEventListener('click', openCard);
      }
    );
  }

  // unstamped orgs that have a place to go (for the gig board)
  const openStamps = () => BLOCK_ORDER.filter((id) => !S.stamps[id] && orgById[id] && placeOf(id)).map((id) => ({ org: id, name: orgById[id].name, site: orgById[id].site, how: STAMPS[id].how, ...placeOf(id), desk: !!desks.find((d) => d.org === id) }));
  return { openStamps, emit, stamp, stampCount, processed, nearDesk, openDesk, openCard, openAchievements, drawWorld, desks };
}
