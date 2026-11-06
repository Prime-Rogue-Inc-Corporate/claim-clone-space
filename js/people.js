// Shuttle passengers are people: a name, a faction, an age, a job, a home and one detail.
// They exist so that when you open the doors in the void, the Registry of Skiffs & Souls can tell you who.
// Everyone aboard is an adult (18+).

const FIRST = ['Mags', 'Orrin', 'Tallow', 'Ines', 'Bram', 'Juno', 'Petra', 'Silas', 'Wren', 'Dov', 'Hale', 'Nadia', 'Ottoline', 'Rook', 'Sable', 'Teodor', 'Una', 'Vasco', 'Yusra', 'Zeke', 'Agnieszka', 'Bertrand', 'Cass', 'Delphine', 'Emeka', 'Farah', 'Gus', 'Hollis', 'Imre', 'Jessop', 'Kit', 'Lark', 'Mercer', 'Noor', 'Osric', 'Pim', 'Quill', 'Rosalind', 'Stanislav', 'Tamsin', 'Ulrich', 'Vida', 'Wolfgang', 'Xochitl', 'Yevgenia', 'Zora', 'Ansel', 'Brigid', 'Corwin', 'Dagny', 'Ezra', 'Fenna', 'Gideon', 'Hester', 'Ivo', 'Jolene', 'Kasimir', 'Ludo', 'Marisol', 'Nell'];
const LAST = ['Okafor', 'Marsh', 'Vasquez-Pell', 'Dunmore', 'Ibsen', 'Kade', 'Sorrow', 'Tull', 'Brannigan', 'Achterberg', 'Nakamura', 'Ferreira', 'Kowalczyk', 'Abernathy', 'Quist', 'Rourke', 'Szabo', 'Thistlewood', 'Underhill', 'Varga', 'Whitlock', 'Yilmaz', 'Zhou', 'Ashby', 'Blackwood', 'Castellano', 'Drummond', 'Ekwueme', 'Fairweather', 'Grieve', 'Hollander', 'Ivers', 'Jankowski', 'Kettle', 'Lindqvist', 'Moreau', 'Nwosu', 'Oyelaran', 'Pelletier', 'Rasmussen', 'Slag', 'Tithe', 'Gallows', 'Cinder', 'Ninefingers', 'Sixpence'];
const JOBS = {
  sprawl: ['scrap picker', 'tyre burner', 'unlicensed dentist', 'hut builder', 'queue sitter', 'pigeon breeder', 'barrel minder', 'between jobs since forever', 'ration-line organiser', 'part-time philosopher'],
  vanta: ['junior associate', 'debt restructurer', 'charter clerk', 'Science Centre volunteer'],
  kessler: ['shaft miner', 'debris seeder', 'refit-bay fitter', 'ore sorter'],
  ashiron: ['smelter', 'hymn leader', 'quota auditor', 'smog technician'],
  null: ['drone handler', 'impound clerk', 'off-duty officer', 'insurance assessor'],
  cinder: ['meter reader', 'air-tank refiller', 'water-ration inspector'],
  gullet: ['vat hand', 'brick presser', 'members-only waiter'],
  lastmile: ['independent contractor', 'parcel courier', 'scooter juicer', 'dispatch temp'],
  gavel: ['auction runner', 'number appraiser', 'bid caller'],
  mercy: ['nurse', 'mortician', 'race-day medic'],
  ministry: ['permit clerk', 'gentry concierge', 'form archivist'],
  assessor: ['appraiser', 'ledger keeper'],
  registry: ['soul counter', 'skiff-number clerk'],
  bureau: ['cheer officer', 'bulletin copywriter', 'smile inspector'],
};
const DETAILS = [
  'owed 13 scrap to Gavel & Rope', 'was two stamps from Fully Processed', 'had just built a lean-to', 'was on the way to a job interview',
  'survived by a goat', 'had a Civic Warmth of {w}', 'was reading the ledger for fun', 'had won a ration raffle that morning',
  'was carrying a sealed casket (contents unknown)', 'had never seen the Spine', 'was going to propose at the Central Hub', 'left a half-eaten ration brick',
  'was the Most Humane Citizen of the Day once', 'had a skiff number nobody remembers', 'was humming the Compliance Oath', 'had 4 scrap and a dream',
  'was finally going to the doctor', 'collected Spine Run ticket stubs', 'was late for their own retirement party', 'bet on you making par',
];
const HOMES = ['Lower Upper Squalor', 'Upper Lower Squalor', 'the Halfway Halt', 'a crate behind Block 7', 'the Spine (unofficially)', 'a Ministry waiting room'];

const r = (a) => a[Math.floor(Math.random() * a.length)];
export function makePerson(faction = 'sprawl') {
  const age = 18 + Math.floor(Math.pow(Math.random(), 1.4) * 74); // 18–91, skewed young-ish
  return {
    faction,
    name: `${r(FIRST)} ${r(LAST)}`,
    age,
    job: r(JOBS[faction] || JOBS.sprawl),
    home: faction === 'sprawl' ? r(HOMES) : r(HOMES.slice(2)),
    detail: r(DETAILS).replace('{w}', String(300 + Math.floor(Math.random() * 900))),
    scooter: Math.random() < 0.2, // some bring an e-scooter aboard (it takes up a place)
  };
}
