// Runs the real GH-1 PLC program (greenhouse.st in the ST interpreter, one copy per greenhouse) and the
// plant model in Pyodide, with the progress layer on top.
importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js");

let py = null, farm = null, speed = 20, lastPost = 0, lastSave = 0, simAt = 0, wallAt = 0, achieved = 0;
let saved = null;                                       // the page sends its save before Python is ready

async function boot() {
  postMessage({status: "Loading Python (Pyodide)…"});
  py = await loadPyodide();
  postMessage({status: "Loading the PLC program and the plant model…"});
  const files = (await (await fetch("py/files.txt")).text()).trim().split(/\r?\n/);
  for (const f of files) {
    py.FS.mkdirTree("/gh1/" + f.split("/").slice(0, -1).join("/"));
    py.FS.writeFile("/gh1/" + f, await (await fetch("py/" + f)).text());
  }
  postMessage({status: "Compiling greenhouse.st…"});
  py.runPython("import sys, json; sys.path.insert(0, '/gh1')\nfrom farmsim.progress import Farm, meta");
  newFarm(saved);
  postMessage({meta: JSON.parse(py.runPython("meta()"))});
  wallAt = performance.now();
  simAt = 0;
  loop();
}

function newFarm(save) {
  py.globals.set("save_json", save || "");
  try {
    py.runPython("farm = Farm('07:00', save=json.loads(save_json) if save_json else None)");
  } catch (err) {                                       // a broken or old save: start fresh
    postMessage({status: "Save could not be read, starting a new farm."});
    py.runPython("farm = Farm('07:00')");
  }
  farm = py.globals.get("farm");
}

function loop() {
  const t0 = performance.now();
  if (speed === "max") { while (performance.now() - t0 < 40) farm.run(20); }
  else if (speed > 0) farm.run(speed);                 // `speed` scans of 50 ms per 50 ms of wall time
  const now = performance.now();
  if (now - lastPost > 100) {
    lastPost = now;
    const s = JSON.parse(farm.state());
    if (now - wallAt > 2000) {                         // achieved speed over the last ~2 s
      achieved = (s.sim_s - simAt) / ((now - wallAt) / 1000);
      simAt = s.sim_s; wallAt = now;
    }
    s.achieved = achieved;
    postMessage({state: s});
  }
  if (now - lastSave > 5000) { lastSave = now; postMessage({save: farm.save()}); }
  setTimeout(loop, Math.max(0, 50 - (performance.now() - t0)));
}

onmessage = e => {
  const m = e.data;
  if (m.cmd === "speed") { speed = m.value; return; }
  if (m.cmd === "init") { saved = m.save; return; }
  if (!farm) return;
  if (m.cmd === "new_farm") { newFarm(null); simAt = 0; postMessage({save: farm.save(), reply: {ok: true}, cmd: m}); return; }
  const reply = JSON.parse(farm.command(JSON.stringify(m)));
  postMessage({reply, cmd: m});
};

boot().catch(err => postMessage({error: String(err)}));
