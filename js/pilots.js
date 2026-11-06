// Pilot profiles: "sign in" on this device, until real accounts exist.
//
// The game keeps its saves in localStorage under 'claim-clone-space:*'. The ACTIVE pilot's save lives
// in those keys as usual; other pilots (and backups) are stored as snapshots in one profiles record.
// Switching pilots swaps the snapshots and reloads. Wiping always backs up first. Pilots can be exported
// as a code (copy / share / download) and imported on any device, which is also how they'll move into
// real accounts later. Staging notes ('spacesquat:devnotes:*') are never touched.
const PREFIX = 'claim-clone-space:';
const KEY = 'spacesquat:pilots:v1';
const MAX_BACKUPS = 5;

const ls = () => { try { return window.localStorage; } catch { return null; } };
function readStore() {
  try { return JSON.parse(ls()?.getItem(KEY)) || null; } catch { return null; }
}
function writeStore(st) {
  try { ls()?.setItem(KEY, JSON.stringify(st)); return true; } catch { return false; }
}
function liveKeys() {
  const s = ls(), out = [];
  if (!s) return out;
  for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(PREFIX)) out.push(k); }
  return out;
}
function snapshot() {
  const s = ls(), data = {};
  for (const k of liveKeys()) data[k] = s.getItem(k);
  return data;
}
function clearLive() { const s = ls(); for (const k of liveKeys()) s.removeItem(k); }
// Once a switch starts, stop the running game from writing its (old) save over the new one.
function lock() {
  window.__pilotSwitching = true;
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (String(k).startsWith(PREFIX)) return; return orig.call(this, k, v); };
}
function restore(data) { clearLive(); const s = ls(); for (const [k, v] of Object.entries(data || {})) if (k.startsWith(PREFIX)) s.setItem(k, v); }

// unicode-safe base64
const b64 = (str) => btoa(unescape(encodeURIComponent(str)));
const unb64 = (str) => decodeURIComponent(escape(atob(str)));

// Run once at boot, before anything reads its save. Makes sure there's a profile for the current save.
export function ensurePilots() {
  let st = readStore();
  if (!st) {
    st = { active: 'p1', seq: 1, list: [{ id: 'p1', name: 'Pilot 1', created: Date.now(), lastPlayed: Date.now() }], backups: [] };
    writeStore(st);
  }
  const cur = st.list.find((p) => p.id === st.active);
  if (cur) { cur.lastPlayed = Date.now(); writeStore(st); }
  return st;
}

export function summarize(data) {
  try {
    const econ = JSON.parse(data?.[`${PREFIX}v3`] || 'null');
    if (!econ) return 'fresh start';
    const stamps = Object.keys(econ.stamps || {}).length;
    return `${econ.scrap ?? 0} scrap · ${stamps}/13 stamps · warmth ${econ.warmth ?? 650}${econ.hut ? ` · home ${econ.hut.site}` : ''}`;
  } catch { return 'save'; }
}

export function createPilots({ log, esc, openModal, closeModal }) {
  const st = () => readStore() || ensurePilots();
  const active = () => { const s = st(); return s.list.find((p) => p.id === s.active); };

  function park(s) {
    // store the live save into the active pilot before leaving it
    const cur = s.list.find((p) => p.id === s.active);
    if (cur) { cur.data = snapshot(); cur.lastPlayed = Date.now(); }
  }
  function go(s, id) {
    const next = s.list.find((p) => p.id === id);
    restore(next.data || {});
    delete next.data; // the active pilot's save lives in the live keys
    s.active = id;
    next.lastPlayed = Date.now();
    if (!writeStore(s)) return log('Could not save pilots (storage full?). Nothing changed.');
    lock();
    location.reload();
  }
  function switchTo(id) { const s = st(); if (id === s.active) return; park(s); go(s, id); }
  function newPilot(name) {
    const s = st();
    park(s);
    const id = `p${++s.seq}`;
    s.list.push({ id, name: name || `Pilot ${s.seq}`, created: Date.now(), lastPlayed: Date.now(), data: {} });
    go(s, id);
  }
  function backupActive(s, why) {
    s.backups.unshift({ name: `${active()?.name || 'Pilot'} · ${why}`, at: Date.now(), data: snapshot() });
    s.backups.length = Math.min(s.backups.length, MAX_BACKUPS);
  }
  function wipe() {
    const s = st();
    backupActive(s, 'before wipe');
    clearLive();
    if (!writeStore(s)) return log('Could not save the backup (storage full?). Wipe cancelled.');
    lock();
    location.reload();
  }
  function restoreBackup(i) {
    const s = st();
    const b = s.backups[i];
    if (!b) return;
    backupActive(s, 'before restoring a backup');
    restore(b.data);
    s.backups = s.backups.filter((x) => x !== b);
    writeStore(s);
    lock();
    location.reload();
  }
  function rename(id, name) { const s = st(); const p = s.list.find((x) => x.id === id); if (p && name) { p.name = name.slice(0, 32); writeStore(s); } }
  function remove(id) {
    const s = st();
    if (id === s.active) return;
    const p = s.list.find((x) => x.id === id);
    if (!p) return;
    s.backups.unshift({ name: `${p.name} · deleted pilot`, at: Date.now(), data: p.data || {} });
    s.backups.length = Math.min(s.backups.length, MAX_BACKUPS);
    s.list = s.list.filter((x) => x !== p);
    writeStore(s);
  }
  function exportCode(id) {
    const s = st();
    const p = s.list.find((x) => x.id === id);
    const data = id === s.active ? snapshot() : p.data || {};
    return `SQ1-${b64(JSON.stringify({ v: 1, name: p.name, at: Date.now(), data }))}`;
  }
  function importCode(code) {
    const raw = String(code || '').trim().replace(/\s+/g, '');
    if (!raw.startsWith('SQ1-')) throw new Error('That isn’t a SpaceSquat pilot code (they start with SQ1-).');
    const obj = JSON.parse(unb64(raw.slice(4)));
    if (!obj || typeof obj.data !== 'object') throw new Error('The code is damaged.');
    const s = st();
    park(s);
    const id = `p${++s.seq}`;
    s.list.push({ id, name: `${obj.name || 'Imported'} (imported)`, created: Date.now(), lastPlayed: Date.now(), data: obj.data });
    go(s, id);
  }

  async function shareCode(id) {
    const code = exportCode(id);
    const name = st().list.find((x) => x.id === id)?.name || 'pilot';
    if (navigator.share) {
      try { await navigator.share({ title: `SpaceSquat pilot: ${name}`, text: code }); return 'Shared.'; } catch { /* cancelled: fall through */ }
    }
    try { await navigator.clipboard.writeText(code); return 'Code copied. Paste it somewhere safe (Notes, an e-mail to yourself).'; } catch {}
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    a.download = `spacesquat-${name.replace(/\W+/g, '-').toLowerCase()}.txt`;
    a.click();
    return 'Downloaded the code as a text file.';
  }

  function open(msg = '') {
    const s = st();
    const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const rows = s.list.map((p) => {
      const on = p.id === s.active;
      return `<tr class="${on ? 'mine' : ''}"><td><b>${esc(p.name)}</b>${on ? ' <span class="sub">· playing now</span>' : ''}
        <div class="sub" style="margin:2px 0 0">${esc(summarize(on ? snapshot() : p.data))} · last played ${when(p.lastPlayed)}</div></td>
        <td style="text-align:right;white-space:nowrap">${on ? '' : `<button data-sw="${p.id}">Play</button> `}<button data-ex="${p.id}">Export</button> <button data-rn="${p.id}">Rename</button>${on ? '' : ` <button data-rm="${p.id}">Delete</button>`}</td></tr>`;
    }).join('');
    const backups = s.backups.map((b, i) => `<tr><td>${esc(b.name)} <span class="sub">· ${when(b.at)} · ${esc(summarize(b.data))}</span></td><td style="text-align:right"><button data-rb="${i}">Restore into current pilot</button></td></tr>`).join('');
    openModal(
      `<h2>PILOTS · SIGN IN</h2>
       <div class="sub">Pilots live on this device. Export a pilot to keep it safe or move it to another phone or computer. Real accounts (Google sign-in) come later, and these codes will import into them.</div>
       ${msg ? `<div class="explain">${msg}</div>` : ''}
       <table>${rows}</table>
       <div class="buttons"><button class="primary" id="new">New pilot (fresh start)</button><button id="wipe">Wipe current pilot</button><button id="imp">Import a code</button><button id="x">Close</button></div>
       <div id="impbox" hidden><textarea id="code" rows="4" style="width:100%" placeholder="Paste a SQ1-… code"></textarea><div class="buttons"><button class="primary" id="doimp">Import and play</button></div></div>
       ${backups ? `<h3>BACKUPS (last ${MAX_BACKUPS}; made automatically before wipes and restores)</h3><table>${backups}</table>` : ''}
       <div class="err" id="err"></div>`,
      (el) => {
        const err = (m) => (el.querySelector('#err').textContent = m);
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#new').addEventListener('click', () => {
          const name = prompt('Name for the new pilot?', `Pilot ${st().seq + 1}`);
          if (name !== null) newPilot(name.trim() || undefined);
        });
        el.querySelector('#wipe').addEventListener('click', () => {
          if (confirm(`Wipe ${active()?.name}? A backup is kept here, so you can restore it.`)) wipe();
        });
        el.querySelector('#imp').addEventListener('click', () => (el.querySelector('#impbox').hidden = false));
        el.querySelector('#doimp').addEventListener('click', () => { try { importCode(el.querySelector('#code').value); } catch (e) { err(e.message); } });
        el.querySelectorAll('[data-sw]').forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.sw)));
        el.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', async () => open(esc(await shareCode(b.dataset.ex)))));
        el.querySelectorAll('[data-rn]').forEach((b) => b.addEventListener('click', () => {
          const p = st().list.find((x) => x.id === b.dataset.rn);
          const name = prompt('Rename pilot', p.name);
          if (name) { rename(p.id, name.trim()); open(); }
        }));
        el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
          const p = st().list.find((x) => x.id === b.dataset.rm);
          if (confirm(`Delete ${p.name}? A backup is kept.`)) { remove(p.id); open(); }
        }));
        el.querySelectorAll('[data-rb]').forEach((b) => b.addEventListener('click', () => {
          if (confirm('Restore this backup into the current pilot? The current save is backed up first.')) restoreBackup(Number(b.dataset.rb));
        }));
      }
    );
  }

  return { open, active, name: () => active()?.name || 'Pilot' };
}
