# Talk 16 figures and models

Source for the two anatomy figures in Talk 16 (served from `src/static/figures/`) and the gas model behind the
teardown and Chart B.

- `model.mjs` · my own derivation, from the Lecture 15 notes of Zac Manchester's rigid body dynamics course, of the
  flying car in two demos: the inverted half loop (tyre load, fan suction, the half roll and braked landing) and the
  kickflip (minimum jerk roll on a four nozzle mixer). Course parameters, no course code.
- `shared.mjs` · the car drawn from anatomy kit prisms and discs in any pose, and the kit inlined for the page.
- `ramp.mjs`, `flip.mjs` · the two figures. `node ramp.mjs --light` and `node flip.mjs --light` write
  `ramp-light.html` and `flip-light.html`. They import the anatomy kit from `/home/claude/anatomy` (clone of
  github.com/wheresryan22/anatomy, MIT), so change that path if it lives elsewhere.
- `embed.py` · copies the light pages into `src/static/figures/` with tighter margins, `noindex`, the favicon and a
  height message for the talk's frame.
- `blowdown.py` · the real gas blowdown of a 200 L and a 600 L nitrogen tank (CoolProp), whose output feeds
  `teardowns/gt-copv-shared/data.js` and Chart B.

Checks run before publishing: `scripts/lines.mjs` from the anatomy kit reports 0 floating line ends on both figures,
in both themes.
