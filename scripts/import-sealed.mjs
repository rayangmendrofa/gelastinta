// Unpack the bundle made by the seal page (tools/make-seal-page.mjs) into packs-data/.
//   node scripts/import-sealed.mjs gelastinta-sealed-packs.json [staged public files dir]
// The optional second folder holds the samples and teardowns.json made in the same staging run;
// they are copied in too, so the samples, the sealed packs and the teardown map stay in step.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const OUT = path.join(ROOT, 'packs-data');
const [bundle, pub] = process.argv.slice(2);
const { sealed } = JSON.parse(fs.readFileSync(bundle, 'utf8'));
for (const [name, b] of Object.entries(sealed)) {
  if (!/^(td-)?[a-z]+[0-9]*\.(full\.)?bin$/.test(name)) throw new Error('unexpected file name ' + name);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(b, 'base64'));
}
if (pub) for (const f of fs.readdirSync(pub)) fs.copyFileSync(path.join(pub, f), path.join(OUT, f));
console.log(`${Object.keys(sealed).length} sealed files written to packs-data/`);
