# 3D teardowns for the site

Source of the interactive 3D pages served from `src/static/teardowns/`.

- `gt-hand-*`: the BEng prosthetic hand (Thesis-BEng page, section 04). `gt-hand-shared/kin.js` holds every number and
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
