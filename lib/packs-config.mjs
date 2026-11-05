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
  fea:         { name: 'Computational Engineering', prefix: 'FE', price: 9, item: 'fea' },
  advmat:      { name: 'Advanced Materials', prefix: 'AM', price: 9, item: 'advmat' },
  thermo:      { name: 'Thermodynamics', prefix: 'TH', price: 9, item: 'thermo' },
  control:     { name: 'Control', prefix: 'CE', price: 9, item: 'control' },
  vib:         { name: 'Vibration and Acoustics', prefix: 'VA', price: 9, item: 'vib' },
  robotics:    { name: 'Robotics and Digital Control', prefix: 'RB', price: 9, item: 'robotics' },
  library:     { name: 'The whole library', prefix: '', price: 49, item: 'library', library: true },
};

// Everything that can be bought. `grants` lists the pack keys it opens.
// `kofi` is the Ko-fi shop item code: ko-fi.com/s/<code>.
export const ITEMS = {
  maths:       { name: 'Engineering Maths study pack', price: 9, grants: ['maths'], kofi: '' },
  mechanics:   { name: 'Mechanics study pack', price: 9, grants: ['mechanics'], kofi: '' },
  materials:   { name: 'Materials study pack', price: 9, grants: ['materials'], kofi: '' },
  electronics: { name: 'Electronics study pack', price: 9, grants: ['electronics'], kofi: '' },
  fea:         { name: 'Computational Engineering study pack', price: 9, grants: ['fea'], kofi: '' },
  advmat:      { name: 'Advanced Materials study pack', price: 9, grants: ['advmat'], kofi: '' },
  thermo:      { name: 'Thermodynamics study pack', price: 9, grants: ['thermo'], kofi: '' },
  control:     { name: 'Control study pack', price: 9, grants: ['control'], kofi: '' },
  vib:         { name: 'Vibration and Acoustics study pack', price: 9, grants: ['vib'], kofi: '' },
  robotics:    { name: 'Robotics and Digital Control study pack', price: 9, grants: ['robotics'], kofi: '' },
  foundations: { name: 'Foundations set (4 packs)', price: 29, grants: ['maths', 'mechanics', 'materials', 'electronics'], kofi: '' },
  advanced:    { name: 'Advanced set (6 packs)', price: 39, grants: ['fea', 'advmat', 'thermo', 'control', 'vib', 'robotics'], kofi: '' },
  library:     { name: 'The whole library (all 10 packs)', price: 49, grants: Object.keys(PACKS), kofi: '' },
};

export const itemByKofiCode = (code) => Object.entries(ITEMS).find(([, it]) => it.kofi && it.kofi.toLowerCase() === String(code || '').toLowerCase());
export const buyUrl = (item) => (ITEMS[item] && ITEMS[item].kofi ? `https://ko-fi.com/s/${ITEMS[item].kofi}` : KOFI_SHOP);
