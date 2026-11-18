// Build the private "seal" page: it holds the staged plain pack files (from
// `PACKS_STAGE=<dir> node scripts/build-packs.mjs <built packs>`) and encrypts them in the owner's
// own browser with PACKS_KEY (AES 256 GCM, the same format as scripts/build-packs.mjs: 12 byte iv,
// 16 byte tag, ciphertext). It downloads one bundle file that scripts/import-sealed.mjs unpacks
// into packs-data/. The key is typed into the page on the owner's computer and never sent anywhere.
// The page contains the full paid packs in plain form: keep it private, delete it after use.
//   node tools/make-seal-page.mjs <stage dir> <out.html>
import fs from 'node:fs';
import path from 'node:path';
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: node tools/make-seal-page.mjs <stage dir> <out.html>'); process.exit(1); }
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.plain')).sort();
const data = Object.fromEntries(files.map((f) => [f.replace(/\.plain$/, ''), fs.readFileSync(path.join(dir, f)).toString('base64')]));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seal the study packs</title><meta name="robots" content="noindex">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#10131C;background:#F6F4EE}h1{font-size:24px}
input{width:100%;font:15px ui-monospace,monospace;padding:10px;border:1px solid #10131C;box-sizing:border-box}button{margin-top:12px;font:600 15px system-ui;padding:10px 18px;background:#2B44C8;color:#fff;border:0;cursor:pointer}
button:disabled{opacity:.5}#log{font:13px ui-monospace,monospace;white-space:pre-wrap;margin-top:16px}.muted{color:#5B6273;font-size:14px}</style></head><body>
<h1>Seal the GelasTinta study packs</h1>
<p>This page locks the new study packs with your <b>PACKS_KEY</b> so only buyers can open them. Everything happens here in your browser: the key is not sent anywhere.</p>
<p class="muted">${files.length} files to seal. Use the same PACKS_KEY that is set on Netlify right now (if you change it on Netlify later, run this page again with the new one).</p>
<label for="k"><b>PACKS_KEY</b></label><input id="k" type="password" autocomplete="off" spellcheck="false" placeholder="paste the PACKS_KEY value from Netlify">
<button id="go" type="button">Seal and download</button>
<div id="log" aria-live="polite"></div>
<script>
const DATA = ${JSON.stringify(data)};
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const log = (m) => { document.getElementById('log').textContent += m + '\\n'; };
document.getElementById('go').addEventListener('click', async () => {
  const btn = document.getElementById('go'); document.getElementById('log').textContent = '';
  let raw; try { raw = b64(document.getElementById('k').value.trim()); } catch (e) { log('That does not look like the key (it should be base64).'); return; }
  if (raw.length !== 32) { log('That key is ' + raw.length + ' bytes; PACKS_KEY must be 32 bytes. Copy it again from Netlify.'); return; }
  btn.disabled = true;
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const out = {};
  for (const name of Object.keys(DATA)) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, b64(DATA[name])));
    const tag = ct.subarray(ct.length - 16), body = ct.subarray(0, ct.length - 16);
    const sealed = new Uint8Array(12 + 16 + body.length); sealed.set(iv, 0); sealed.set(tag, 12); sealed.set(body, 28);
    out[name] = toB64(sealed); log('sealed ' + name);
  }
  const blob = new Blob([JSON.stringify({ sealed: out, made: new Date().toISOString() })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gelastinta-sealed-packs.json'; document.body.appendChild(a); a.click();
  log('\\nDone. Send gelastinta-sealed-packs.json back to Claude, then delete this page.');
  btn.disabled = false;
});
</script></body></html>`;
fs.writeFileSync(out, html);
console.log(`${out}: ${files.length} files, ${(html.length / 1e6).toFixed(1)} MB`);
