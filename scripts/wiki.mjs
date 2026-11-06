// Renders data/lore.json -> docs/WIKI.md (the same content the in-game wiki shows on L).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const w = JSON.parse(readFileSync('data/lore.json', 'utf8'));
const out = [`# ${w.title}`, '', `_${w.subtitle}_`, '', `> ${w.note}`, '', '## The 13 organizations', ''];
const TYPES = { corp: 'Corporation', government: 'Government', 'quasi-government': 'Quasi-government' };
out.push('| # | Organization | Type | Runs | Motto |', '|---|---|---|---|---|');
w.organizations.forEach((o, i) => out.push(`| ${i + 1} | ${o.name} | ${TYPES[o.type] || o.type} | ${o.site} | ${o.motto} |`));
out.push('');
for (const o of w.organizations) {
  out.push(`### ${o.name}`, '', `**${TYPES[o.type] || o.type}** · _“${o.motto}”_`, '', o.does, '', o.lore, '',
    `- **Residency stamp:** ${o.site}: ${o.stamp}`, `- **Rumour:** ${o.rumour}`);
  if (o.renameNote) out.push(`- **Note:** ${o.renameNote}`);
  out.push('');
}
out.push('## Places', '');
for (const p of w.places) out.push(`- **${p.name}:** ${p.text}`);
out.push('', '## Glossary', '');
for (const g of w.glossary) out.push(`- **${g.term}:** ${g.text}`);
out.push('');
mkdirSync('docs', { recursive: true });
writeFileSync('docs/WIKI.md', out.join('\n'));
console.log(`docs/WIKI.md: ${w.organizations.length} organizations`);
