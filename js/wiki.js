// In-game wiki (L). Player-facing; reads data/lore.json (same source as docs/WIKI.md).
const TYPES = { corp: 'CORPORATION', government: 'GOVERNMENT', 'quasi-government': 'QUASI-GOVERNMENT' };

export function openWiki(lore, { openModal, closeModal, esc }, tab = 'orgs', focus = null) {
  if (!lore) {
    openModal('<h2>WIKI</h2><div class="err">data/lore.json did not load.</div><div class="buttons"><button id="x">Close</button></div>', (el) =>
      el.querySelector('#x').addEventListener('click', closeModal)
    );
    return;
  }
  const TABS = [['orgs', `the ${lore.organizations.length}`], ['rec', 'recreation'], ['places', 'places'], ['glossary', 'glossary']];
  let body = '';
  if (tab === 'orgs') {
    const list = lore.organizations
      .map(
        (o, i) => `<tr class="click" data-org="${esc(o.id)}"><td style="width:22px;color:var(--dim)">${i + 1}</td>
          <td style="width:10px;background:${esc(o.color)}"></td>
          <td style="width:30px"><img src="assets/sprites/logo_${esc(o.id)}.png" width="26" height="26" alt="" onerror="this.remove()"/></td>
          <td><b>${esc(o.name)}</b> <span class="sub">${TYPES[o.type] || esc(o.type)}</span><div class="sub" style="margin:1px 0 0"><i>“${esc(o.motto)}”</i></div></td></tr>`
      )
      .join('');
    const o = lore.organizations.find((x) => x.id === focus);
    const detail = o
      ? `<div class="explain" style="border-left:4px solid ${esc(o.color)}">
          <img src="assets/sprites/logo_${esc(o.id)}.png" width="64" height="64" alt="" style="float:right;margin:0 0 6px 10px" onerror="this.remove()"/>
          <b style="font-size:15px">${esc(o.name)}</b> · ${TYPES[o.type] || esc(o.type)}<br/><i>“${esc(o.motto)}”</i><br/><br/>
          ${esc(o.does)}<br/><br/>${esc(o.lore)}<br/><br/>
          <b>Residency stamp:</b> ${esc(o.site)}: ${esc(o.stamp)}<br/>
          <b>Rumour:</b> ${esc(o.rumour)}${o.renameNote ? `<br/><span class="sub">${esc(o.renameNote)}</span>` : ''}</div>`
      : '<div class="sub">Pick an organization.</div>';
    body = `${detail}<table>${list}</table>`;
  } else if (tab === 'rec') {
    const z = (lore.recreation || []).map(
      (r) => `<h3>${r.n}. ${esc(r.name.toUpperCase())} <span style="color:${r.status === 'suggestion' ? 'var(--dim)' : 'var(--green)'}">${esc(r.status)}</span></h3>
        <div class="sub" style="margin:0 0 4px">${esc(r.host)}</div><div><b>Do:</b> ${esc(r.activity)}</div><div class="sub" style="margin-top:4px">${esc(r.lore)}</div>`
    );
    body = `<div class="sub">${esc(lore.recreation_note || '')}</div>${z.join('')}`;
  } else if (tab === 'places') {
    body = lore.places.map((p) => `<h3>${esc(p.name.toUpperCase())}</h3><div>${esc(p.text)}</div>`).join('');
  } else {
    body = `<div class="grid">${lore.glossary.map((g) => `<span class="k">${esc(g.term)}</span><span>${esc(g.text)}</span>`).join('')}</div>`;
  }
  openModal(
    `<h2>${esc(lore.title).toUpperCase()}</h2>
     <div class="sub">${esc(lore.subtitle)} · ${TABS.map(([id, label]) => (id === tab ? `<b>${label}</b>` : `<a href="#" data-tab="${id}">${label}</a>`)).join(' · ')}</div>
     ${body}
     <div class="buttons"><button id="x">Close</button></div>`,
    (el) => {
      el.querySelector('#x').addEventListener('click', closeModal);
      el.querySelectorAll('[data-tab]').forEach((a) =>
        a.addEventListener('click', (e) => {
          e.preventDefault();
          openWiki(lore, { openModal, closeModal, esc }, a.dataset.tab);
        })
      );
      el.querySelectorAll('[data-org]').forEach((tr) =>
        tr.addEventListener('click', () => openWiki(lore, { openModal, closeModal, esc }, 'orgs', tr.dataset.org))
      );
    }
  );
}
