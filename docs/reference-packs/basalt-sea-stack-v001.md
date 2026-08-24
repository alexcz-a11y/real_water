# Reference Pack — basalt sea stack, v001

Generated 2026-08-24. Selected view by view by the agent under `docs/reference-bible.md`; the
project owner reviews the pack as a whole.

**Eight approved views, not nine.** Bible §6 omits the top view for this asset: the stack is a
distant silhouette and reflection subject and is not reconstructed at part level. The pixels live
outside the repository at `~/rw/reference-packs/basalt-sea-stack/v001/`; this file is their in-repo
evidence. See ADR-0022 for why the pixels stay out.

**These images are not reproducible from their prompts alone.** The identity anchor was repaired by
a region edit inside the generating tool, described here in words because no prompt reproduces it.

## Provenance

| Field | Value |
|---|---|
| Service | Reve, model 2.1, via `app.reve.com` |
| Plan | Reve Lite (paid) |
| Operated by | Claude Opus 5 through the ego-browser agent browser |
| Album | The Monolith of Basalt, `0c0c1766-a613-4162-8ac2-55fae62da2cf` |
| Reference object | `@sea-stack`, type Object |
| Settings | 1:1 aspect · Count 4 · attachments interpreted Literally |
| Output | 4096 × 4096 PNG, every view |

The account's identity is deliberately not recorded — `hero-vessel-v001.md` sets out why, and its
record of the service's output terms applies to this pack too.

## Approved views

| File | View | Reve image id | sha256 (first 16) |
|---|---|---|---|
| `sea-stack-anchor-3q-v001.png` | Identity anchor, three-quarter | `1a895710-9407-4048-8c6d-aac256ee965a` | `7a85a7db5c9c9337` |
| `sea-stack-elev-front-v001.png` | Front elevation | `8815fb12-0613-4654-86c1-3d4390431361` | `0e9b33141900d380` |
| `sea-stack-elev-side-v001.png` | Side elevation | `10f776a5-4a4a-47d0-a256-7e29792bc223` | `b558aa4d53415b7e` |
| `sea-stack-elev-back-v001.png` | Back elevation | `453d1985-63d2-4db4-b614-4616663b8aa9` | `ce9eb38e0e21ea30` |
| `sea-stack-mat-column-faces-v001.png` | Material — column faces and joints | `880e10ab-ba5e-4d25-9ac5-d7c2ffb9292c` | `d4e1366a14909299` |
| `sea-stack-mat-waterline-v001.png` | Material — across the waterline stain | `f971eb25-9bb7-4bad-81e2-58ceab7db6cd` | `46da75c8d14a648f` |
| `sea-stack-mat-summit-tops-v001.png` | Material — broken column tops from above | `b39aa435-7824-4977-bd5d-abf55ee576a8` | `c8fdc5186018ac8d` |
| `sea-stack-lookdev-wet-v001.png` | Wet look-dev | `b57fe2f9-09f6-4bb9-b41b-dae82b5938f0` | `4196389438730386` |

## Manual operations no prompt reproduces

- **The anchor's waterline stain was applied by a region edit.** Of the four anchor candidates, the
  one with the best columnar geology carried only a diffuse darkening at its foot that followed the
  column steps rather than a level line. A Spotlight selection over the lower band, instructed to
  change colour only and leave every column and joint untouched, produced the level stain that all
  three elevations derive from. The pre-edit image is retained in the album as `fe3f7368`.

  This mattered more here than a cosmetic fix would: Bible §10 makes the waterline the part the
  reflection reads from, so a stain that wandered with the geology would have propagated a wandering
  reflection line into every derived view.

## Rejections and why

- One anchor candidate was a smooth fluted cylinder with a domed top — it read as a machined column,
  not as columnar basalt with broken tops.
- Two anchor candidates had usable geology but no distinguishable waterline band at all.

## Known differences from the specification

- **The three elevations drift in silhouette.** The stack has no symmetry to hold them to, so the
  front, side and back elevations differ in overall taper and summit profile by more than generation
  noise: one reads noticeably more conical than the others. Treat the anchor as authoritative for
  proportion and the elevations as evidence for column arrangement only.
- **The base below the waterline is never shown terminating.** Bible §10 fixes it as the same
  columnar rock continuing straight down without a plinth, and every view crops or fades it before
  it ends. The reconstruction takes the termination from the Bible.
- The material studies show the column faces and the summit tops at a scale no elevation reaches;
  treat their part shapes as indicative and their materials as authoritative.
