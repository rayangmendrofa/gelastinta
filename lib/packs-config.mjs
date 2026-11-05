// GelasTinta study packs: what is sold, at what price, and which Ko-fi shop item sells it.
// Prices are in USD only. Ko-fi sends the item's code (the part after ko-fi.com/s/) in its
// webhook, so each item here must have its Ko-fi code filled in before sales unlock packs
// automatically. Until a code is set, its Buy button opens the Ko-fi shop instead.
export const KOFI_SHOP = 'https://ko-fi.com/rayanmendrofa/shop';

// One entry per pack page at /packs/<key>/. `prefix` is the sheet code prefix (T1.01 ...).
export const PACKS = {
  maths:       { name: 'Engineering Maths', prefix: 'EM', price: 9, item: 'maths' },
  mechanics:   { name: 'Mechanics', prefix: 'T', price: 9, item: 'mechanics' },
  materials:   { name: 'Materials', prefix: 'M', price: 9, item: 'materials' },
  electronics: { name: 'Electronics', prefix: 'E', price: 9, item: 'electronics' },
  fea:         { name: 'Computational Engineering', prefix: 'FE', price: 12, item: 'fea' },
  advmat:      { name: 'Advanced Materials', prefix: 'AM', price: 12, item: 'advmat' },
  thermo:      { name: 'Thermodynamics', prefix: 'TH', price: 12, item: 'thermo' },
  control:     { name: 'Control', prefix: 'CE', price: 12, item: 'control' },
  vib:         { name: 'Vibration and Acoustics', prefix: 'VA', price: 12, item: 'vib' },
  robotics:    { name: 'Robotics and Digital Control', prefix: 'RB', price: 12, item: 'robotics' },
  library:     { name: 'The whole library', prefix: '', price: 49, item: 'library', library: true },
};

// Everything that can be bought. `grants` lists the pack keys it opens.
// `kofi` is the Ko-fi shop item code: ko-fi.com/s/<code>.
export const ITEMS = {
  maths:       { name: 'Engineering Maths study pack', price: 9, grants: ['maths'], kofi: '438839fc1f' },
  mechanics:   { name: 'Mechanics study pack', price: 9, grants: ['mechanics'], kofi: '40214c36ee' },
  materials:   { name: 'Materials study pack', price: 9, grants: ['materials'], kofi: '620a2a6211' },
  electronics: { name: 'Electronics study pack', price: 9, grants: ['electronics'], kofi: '' },
  fea:         { name: 'Computational Engineering study pack', price: 12, grants: ['fea'], kofi: '4aaf3043f5' },
  advmat:      { name: 'Advanced Materials study pack', price: 12, grants: ['advmat'], kofi: '0edd5ed322' },
  thermo:      { name: 'Thermodynamics study pack', price: 12, grants: ['thermo'], kofi: '02167fce88' },
  control:     { name: 'Control study pack', price: 12, grants: ['control'], kofi: '64b1346111' },
  vib:         { name: 'Vibration and Acoustics study pack', price: 12, grants: ['vib'], kofi: 'e853f19745' },
  robotics:    { name: 'Robotics and Digital Control study pack', price: 12, grants: ['robotics'], kofi: '46b31e547b' },
  foundations: { name: 'Foundations set (4 packs)', price: 29, grants: ['maths', 'mechanics', 'materials', 'electronics'], kofi: 'e716e459e9' },
  advanced:    { name: 'Advanced set (6 packs)', price: 39, grants: ['fea', 'advmat', 'thermo', 'control', 'vib', 'robotics'], kofi: 'bc20534bc3' },
  library:     { name: 'The whole library (all 10 packs)', price: 49, grants: Object.keys(PACKS), kofi: '90e9b3142e' },
};

export const itemByKofiCode = (code) => Object.entries(ITEMS).find(([, it]) => it.kofi && it.kofi.toLowerCase() === String(code || '').toLowerCase());
export const buyUrl = (item) => (ITEMS[item] && ITEMS[item].kofi ? `https://ko-fi.com/s/${ITEMS[item].kofi}` : KOFI_SHOP);
