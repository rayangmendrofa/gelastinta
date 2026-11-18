# gt-ori: the bistable origami robot (Talk 11)

`gt-ori-*` is the bistable origami robot from Huang et al., "Bistable origami robot for adaptive multimodal motion
actuated by nonuniform magnetic fields" (Nature Communications, article in press, 2026, CC BY 4.0), served as
`src/static/teardowns/origami-robot.html` for Talk 11 (section 03). One input, the coil command (a small oscillating
nudge at 1 to 4 Hz, or one big pulse), drives the fold angle through a torque balance against the elastic torque read
from the paper's Fig. 1D; the energy curve matches Fig. 1C (hill 0.21 mJ, closed valley 0.12 mJ). Open and nudged it
crawls at the Fig. 2F speeds; closed and nudged it rolls; a pulse snaps it shut (or open) in about 0.06 s. The fold
dynamics, the nudge and pulse torques and the robot's drawing are my own model; every number and assumption is listed
at the top of `gt-ori-shared/kin.js`. The panels follow the Fig. 1A gripper pattern in simplified form (slanted mountain creases, hexagonal tips, 0.8 mm slabs with film creases); field lines and an arrow show the field while the coils are on, a dotted trail shows where the robot has been, and the coil rig (wound coils with iron cores, the electromagnet, a 600 mm platform on posts, X and Y rails) follows Fig. 1G loosely.
Build as in `README.md` (copy `gt-ori-*` into the kit's `sims/`, `node sims/build.mjs gt-ori-live gt-ori-film`), then
put the title, `noindex` and favicon back in the head. Poster: `node sims/capture.mjs gt-ori-film --config
nocursor.json --size 1600x900 --dpr 1 --still 15.05` → `src/assets/3aa76ef4c11f906b84696c1d1475866a.png`.
