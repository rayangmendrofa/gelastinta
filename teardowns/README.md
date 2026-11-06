# 3D teardowns for the site

Source of the interactive 3D pages served from `src/static/teardowns/`.

- `gt-msc-*`: the MSc soft limb (Thesis-MSc page, section 04), served as `msc-soft-limb.html`. Numbers from the MSc thesis; assumptions listed in `gt-msc-shared/kin.js`.
- `gt-fish-*`: the hair clip fish (Talk 07, section 04), served as `hair-clip-fish.html`. Numbers from Xiong et al. (arXiv preprint 2206.14867 of the npj Robotics paper); the snap is a double well model.
- `gt-phm-*`: the Hail Mary in centrifuge mode (Talk 04, Project Hail Mary, after Fig. 1), served as `hail-mary.html`. An original drawing of the ship
  (no third party mesh: the MakerWorld model the owner supplied is under a no derivatives licence). Numbers from the book, as in the talk; every
  assumption is listed in `gt-phm-shared/kin.js`.
- `gt-hand-*`: the BEng prosthetic hand (Thesis-BEng page, section 04), served as `beng-hand.html`. `gt-hand-shared/kin.js` holds every number and
  says where each comes from (the BEng report; phalanx lengths are typical adult sizes because the report has none).

Build with the teardown kit (the `teardown/` folder of the study pack source bundle, after `npm install` there):

```
cp -r teardowns/gt-hand-* <teardown>/sims/
cd <teardown> && node sims/build.mjs gt-hand-live gt-hand-film
cp teardown-out/dist/gt-hand-live.html <site>/src/static/teardowns/beng-hand.html
```

Then put the page title, `noindex` and the favicon link back into the `<head>` (see the current file), and re-render
the poster with `node sims/capture.mjs gt-hand-film --config nocursor.json --size 1600x900 --dpr 1 --still 18.6`
(`nocursor.json` is `{"nocursor": true}`) if the look changes.
