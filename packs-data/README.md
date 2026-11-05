# packs-data

Made by `scripts/build-packs.mjs`. `*.sample.gz` are the free samples (gzipped HTML). `*.full.bin` are the full packs, gzipped and encrypted with the PACKS_KEY environment variable; they cannot be read without it. `td-*.bin` are the 3D teardown pages, encrypted the same way and fetched by the full pack when a buyer opens a 3D model; `teardowns.json` says which pack each belongs to. Do not edit by hand.
