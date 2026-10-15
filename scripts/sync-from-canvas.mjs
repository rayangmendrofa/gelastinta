// Copy pages exported from the Claude Design canvas into src/pages, re-applying the
// live-site changes (real comments backend, darker dissertation card text).
//   node scripts/sync-from-canvas.mjs <folder with the canvas .dc.html files>
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const from = process.argv[2];
if (!from) { console.error('usage: node scripts/sync-from-canvas.mjs <canvas folder>'); process.exit(1); }
const comment = fs.readFileSync(path.join(ROOT, 'scripts', 'comment-logic.js'), 'utf8').replace(/\s+$/, '') + '\n';

for (const f of fs.readdirSync(from).filter((x) => x.endsWith('.dc.html'))) {
  let s = fs.readFileSync(path.join(from, f), 'utf8');
  if (s.includes('commentVals() {')) {
    // replace only the commentVals() method: it ends where the next method of the class starts
    // (pages can have their own methods after it, e.g. the Project Hail Mary sound player)
    const a = s.indexOf('  commentVals() {');
    const next = /\n  [A-Za-z_$][\w$]*\([^)]*\) \{/g;
    next.lastIndex = a + 1;
    const m = a < 0 ? null : next.exec(s);
    const b = m ? m.index + 1 : -1;
    if (a < 0 || b < 0) throw new Error(`${f}: comment block not found`);
    s = s.slice(0, a) + comment + s.slice(b);
    s = s.replace(/componentDidMount\(\) \{ this\.gtStart\(0\);( this\.gtMedia\(0\);)? \}/,
      (m, media) => `componentDidMount() { this.gtStart(0);${media || ''} this.cmMount(); }`);
    if (!s.includes('this.cmMount(); }')) throw new Error(`${f}: componentDidMount hook not found`);
  }
  if (f === 'Projects.dc.html') {
    for (const t of ['Soft silicone limbs modelled', 'A low-cost, 3D-printed five-finger hand'])
      s = s.replace(`<p class="muted small">${t}`, `<p class="muted small" style="color:#3A4152">${t}`);
  }
  fs.writeFileSync(path.join(ROOT, 'src', 'pages', f), s);
  console.log('synced', f);
}
