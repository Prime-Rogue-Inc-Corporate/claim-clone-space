// Staging-only tools: the roadmap (R) and in-game notes (N).
// Notes are pinned to where you were standing, stamped with context, saved in this
// browser, and exportable as Markdown. Hidden on the production domain.

const KEY = 'spacesquat:devnotes:v1';
const TAGS = ['idea', 'bug', 'balance', 'art', 'copy', 'legal'];
const STATUS_COLOR = { done: '#6fae5a', now: '#e8c547', next: '#4fc3f7', later: '#8f8670' };

export function devEnabled() {
  const h = location.hostname;
  return /\.fun$/.test(h) || h === 'localhost' || h === '127.0.0.1' || h === '' || new URLSearchParams(location.search).has('dev');
}

export function createDevTools({ roadmap, costs, build, esc, log, openModal, closeModal, getContext, setWaypoint }) {
  let notes = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch {}
  };
  const items = roadmap ? roadmap.phases.flatMap((ph) => ph.items.map((it) => ({ ...it, phase: ph.name }))) : [];
  const itemText = (id) => items.find((i) => i.id === id)?.text || id;
  const fmtTime = (t) => new Date(t).toLocaleString();

  function newNote(prefillItem = '') {
    const c = getContext();
    openModal(
      `<div id="n-form"><h2>NOTE</h2>
       <div class="sub">Pinned at <b>${esc(c.sector)}</b> (${Math.round(c.x)}, ${Math.round(c.y)}) · ${esc(c.mode)} · level ${c.level} · build ${esc(build.sha)}</div>
       <div class="field"><textarea id="n-text" rows="5" placeholder="What did you notice?"></textarea></div>
       <div class="field"><span>Tag</span>
         <div class="chips">${TAGS.map((t, i) => `<label><input type="radio" name="n-tag" value="${t}" ${i === 0 ? 'checked' : ''}/> ${t}</label>`).join('')}</div>
       </div>
       <div class="field"><span>Roadmap item (optional)</span>
         <select id="n-item"><option value="">(none)</option>${items
           .map((it) => `<option value="${esc(it.id)}" ${it.id === prefillItem ? 'selected' : ''}>${esc(it.text)}</option>`)
           .join('')}</select></div>
       <div class="buttons"><button class="primary" id="n-save">Pin note</button><button id="x">Cancel</button></div>
       <div class="sub">Ctrl/⌘ + Enter to pin.</div></div>`,
      (el) => {
        const ta = el.querySelector('#n-text');
        setTimeout(() => ta.focus(), 0);
        el.querySelector('#n-form').addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) el.querySelector('#n-save').click();
        });
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelector('#n-save').addEventListener('click', () => {
          const text = ta.value.trim();
          if (!text) return ta.focus();
          notes.push({
            id: Date.now().toString(36),
            t: Date.now(),
            text,
            tag: el.querySelector('input[name=n-tag]:checked')?.value || 'idea',
            item: el.querySelector('#n-item').value || null,
            ...c,
            build: build.sha,
          });
          save();
          closeModal();
          log(`📌 Note pinned at ${esc(c.sector)}. R to see all notes.`, 'money');
        });
      }
    );
  }

  function toMarkdown() {
    const lines = [`# SpaceSquat notes`, ``, `Exported ${new Date().toISOString()} · ${notes.length} notes · build ${build.sha}`, ``];
    for (const tag of TAGS) {
      const group = notes.filter((n) => n.tag === tag);
      if (!group.length) continue;
      lines.push(`## ${tag}`, '');
      for (const n of group) {
        lines.push(`- ${n.text.replace(/\n+/g, ' ')}`);
        lines.push(`  - _${n.sector} (${Math.round(n.x)}, ${Math.round(n.y)}) · ${n.mode} · lvl ${n.level} · build ${n.build} · ${fmtTime(n.t)}${n.item ? ` · roadmap: ${itemText(n.item)}` : ''}_`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  function openRoadmap(tab = 'roadmap') {
    const countFor = (id) => notes.filter((n) => n.item === id).length;
    const releasesHtml = roadmap?.releases?.length
      ? `<h3>RELEASES</h3><table>${roadmap.releases
          .map(
            (rel) => `<tr><td style="width:62px;color:${STATUS_COLOR[rel.status] || '#8f8670'}">v${esc(rel.version)}</td>
              <td><b>${esc(rel.name)}</b> <span class="sub">${esc(rel.date)} · ${esc(rel.status)}</span>
              <ul style="margin:4px 0 2px 16px;padding:0">${rel.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></td></tr>`
          )
          .join('')}</table>`
      : '';
    const roadmapHtml = roadmap
      ? releasesHtml + roadmap.phases
          .map(
            (ph) => `<h3 style="color:${STATUS_COLOR[ph.status]}">${esc(ph.name)} · ${ph.status.toUpperCase()}</h3>
            <div class="sub">${esc(ph.goal)}</div>
            <table>${ph.items
              .map(
                (it) => `<tr><td style="width:62px;color:${STATUS_COLOR[it.status]}">${it.status}</td><td>${esc(it.text)}</td>
                <td style="width:90px;text-align:right">${countFor(it.id) ? `📌${countFor(it.id)} ` : ''}<a href="#" data-note="${esc(it.id)}">+ note</a></td></tr>`
              )
              .join('')}</table>`
          )
          .join('') +
        `<h3>PARKING LOT</h3><ul>${roadmap.parking.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
      : '<div class="err">data/roadmap.json did not load.</div>';

    const notesHtml = notes.length
      ? `<table>${[...notes]
          .reverse()
          .map(
            (n) => `<tr><td style="width:64px">${esc(n.tag)}</td><td>${esc(n.text)}<div class="sub" style="margin:2px 0 0">${esc(n.sector)} · ${esc(n.mode)} · ${fmtTime(n.t)}${n.item ? ` · ${esc(itemText(n.item))}` : ''}</div></td>
            <td style="width:110px;text-align:right"><a href="#" data-go="${n.id}">waypoint</a> · <a href="#" data-del="${n.id}">delete</a></td></tr>`
          )
          .join('')}</table>`
      : '<div class="sub">No notes yet. Press N anywhere in the world to pin one.</div>';

    const cur = costs?.currency || 'USD';
    const m = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
    let costsHtml = '<div class="err">data/costs.json did not load.</div>';
    if (costs) {
      const all = costs.versions.flatMap((v) => v.entries.map((e) => ({ ...e, version: v.version })));
      const sum = (f) => all.filter(f).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const cats = [...new Set(all.map((e) => e.category))];
      costsHtml = `<div class="explain"><b>Running total: ${m(sum(() => true))} ${esc(cur)}</b>
          (${m(sum((e) => e.basis === 'actual'))} actual · ${m(sum((e) => e.basis !== 'actual'))} estimated)<br/>
          ${cats.map((c) => `${esc(c)}: ${m(sum((e) => e.category === c))}`).join(' · ')}<br/>
          <span class="sub">${esc(costs.note || '')}</span></div>
        ${costs.versions
          .map(
            (v) => `<h3>v${esc(v.version)} · ${esc(v.date)} · ${esc(v.label || '')} · ${m(v.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0))}</h3>
            <table>${v.entries
              .map(
                (e) => `<tr><td>${esc(e.item)}<div class="sub" style="margin:2px 0 0">${esc(e.note || '')}</div></td>
                <td style="width:80px">${esc(e.category)}</td>
                <td style="width:70px;color:${e.basis === 'actual' ? '#6fae5a' : '#e8c547'}">${esc(e.basis)}</td>
                <td style="width:70px;text-align:right">${m(Number(e.amount) || 0)}</td></tr>`
              )
              .join('')}</table>`
          )
          .join('')}
        <div class="sub">Edit <code>data/costs.json</code> in the repo to change these.</div>`;
    }
    const TABS = [['roadmap', 'roadmap'], ['notes', `notes (${notes.length})`], ['costs', 'costs']];
    const titles = { roadmap: esc(roadmap?.title || 'Roadmap'), notes: `NOTES (${notes.length})`, costs: esc(costs?.title || 'COSTS') };
    openModal(
      `<h2>${titles[tab]}</h2>
       <div class="sub">Staging tools · build ${esc(build.sha)}${build.built ? ` · ${esc(build.built)}` : ''} · ${TABS.map(([id, label]) =>
         id === tab ? `<b>${label}</b>` : `<a href="#" data-tab="${id}">${label}</a>`).join(' · ')}</div>
       ${tab === 'roadmap' ? roadmapHtml : tab === 'notes' ? notesHtml : costsHtml}
       <div class="buttons">
         <button class="primary" id="new">New note here (N)</button>
         <button id="copy" ${notes.length ? '' : 'disabled'}>Copy notes as Markdown</button>
         <button id="dl" ${notes.length ? '' : 'disabled'}>Download notes.md</button>
         <button id="x">Close</button>
       </div>
       <div class="sub" id="msg"></div>`,
      (el) => {
        el.querySelector('#x').addEventListener('click', closeModal);
        el.querySelectorAll('[data-tab]').forEach((a) =>
          a.addEventListener('click', (e) => {
            e.preventDefault();
            openRoadmap(a.dataset.tab);
          })
        );
        el.querySelector('#new').addEventListener('click', () => newNote());
        el.querySelectorAll('[data-note]').forEach((a) =>
          a.addEventListener('click', (e) => {
            e.preventDefault();
            newNote(a.dataset.note);
          })
        );
        el.querySelectorAll('[data-del]').forEach((a) =>
          a.addEventListener('click', (e) => {
            e.preventDefault();
            notes = notes.filter((n) => n.id !== a.dataset.del);
            save();
            openRoadmap('notes');
          })
        );
        el.querySelectorAll('[data-go]').forEach((a) =>
          a.addEventListener('click', (e) => {
            e.preventDefault();
            const n = notes.find((x) => x.id === a.dataset.go);
            if (n) setWaypoint({ x: n.x, y: n.y });
            closeModal();
          })
        );
        el.querySelector('#copy').addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(toMarkdown());
            el.querySelector('#msg').textContent = 'Copied. Paste it into the chat.';
          } catch {
            el.querySelector('#msg').textContent = 'Clipboard blocked. Use Download instead.';
          }
        });
        el.querySelector('#dl').addEventListener('click', () => {
          const blob = new Blob([toMarkdown()], { type: 'text/markdown' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `spacesquat-notes-${new Date().toISOString().slice(0, 10)}.md`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        });
      }
    );
  }

  return {
    onKey(k) {
      if (k === 'n') { newNote(); return true; }
      if (k === 'r') { openRoadmap(); return true; }
      return false;
    },
    drawWorld(ctx, time) {
      for (const n of notes) {
        const bob = Math.sin(time / 400 + n.t) * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(n.x - 7 + 3, n.y - 26 + 3, 14, 14);
        ctx.fillStyle = n.tag === 'bug' ? '#ff5a3a' : '#ffd166';
        ctx.fillRect(n.x - 7, n.y - 26 + bob, 14, 14);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y - 12 + bob);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,230,180,0.85)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        const short = n.text.length > 34 ? n.text.slice(0, 33) + '…' : n.text;
        ctx.fillText(short, n.x, n.y - 32 + bob);
      }
    },
    drawMinimap(mctx, tx, ty) {
      for (const n of notes) {
        mctx.fillStyle = n.tag === 'bug' ? '#ff5a3a' : '#ffd166';
        mctx.fillRect(tx(n.x) - 1.5, ty(n.y) - 1.5, 3, 3);
      }
    },
  };
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}
