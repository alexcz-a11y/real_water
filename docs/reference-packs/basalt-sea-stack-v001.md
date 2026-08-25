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
  change colour only and leave every column and joint untouched, produced a **level** boundary at
  the foot, and that is the anchor all three elevations derive from. The pre-edit image is retained
  in the album as `fe3f7368`.

  **Corrected 2026-08-24 — this record previously called that edit "the level stain".** It is level,
  but it is not a stain. The `#49` reconstruction measured colour across the boundary and I verified
  it independently on the same four files:

  | View | luma | R−B | saturation | reads as |
  |---|---|---|---|---|
  | Anchor | −19.9 | +1.6 → +0.1 (**−1.4**) | −0.003 | shading |
  | Front elevation | −33.8 | +3.9 → **+11.1 (+7.2)** | **+0.112** | a stain |
  | Back elevation | −24.7 | −0.5 | +0.001 | shading |
  | Side elevation | no boundary found | — | — | absent |

  Only the **front elevation** carries a chromatic waterline stain; it generated one on its own. The
  anchor, back and side lose warmth across their boundary, which is a lit rock face turning away
  from the light, not a deposit. The Spotlight edit changed luminance, not hue — so the anchor still
  shows geology-following tonality of the kind this record elsewhere describes as rejected, merely
  levelled.

  All eight sha256 prefixes were re-verified against the table above before this correction, so the
  measured files are the approved ones and not a stale export.

  **This changes nothing about the model.** Bible §10 outranks any approved view and already requires
  a single level chromatic band running unbroken around the whole stack. The reconstruction takes the
  waterline from the Bible, as it was always going to. What changed is that this record no longer
  claims the pixels show something they do not.

  This mattered more here than a cosmetic fix would: Bible §10 makes the waterline the part the
  reflection reads from, so a stain that wandered with the geology would have propagated a wandering
  reflection line into every derived view.

## Rejections and why

- One anchor candidate was a smooth fluted cylinder with a domed top — it read as a machined column,
  not as columnar basalt with broken tops.
- Two anchor candidates had usable geology but no distinguishable waterline band at all.

## Known differences from the specification

- **The side elevation is rejected for proportion.** This entry used to say only that "one reads
  noticeably more conical than the others"; it is the side elevation, measured 2026-08-25 against
  `.scratch/REFPACK-RATIO-CHECK.md`.

  **This asset cannot be checked the way that procedure checks a box.** Its step 3 cross-derivation
  needs three views spanning three independent axes; the stack is near-radial and Bible §6 gives it
  no top view, so front, side and back all report the same two axes and none can predict another.
  Every ratio that mixes a vertical dimension in is also unusable here — the summit is ragged and
  each view composes it differently, so three such measures disagreed with each other about which
  view was the outlier, one of them reversing when only the mask threshold changed.

  **A purely horizontal ratio settles it.** Width at one height divided by width at another touches
  no vertical quantity and is immune to framing:

  | ratio | anchor | front | side | back |
  |---|---|---|---|---|
  | w@0.90 / w@0.15 | −4.7 % | −0.1 % | **+36.9 %** | +0.1 % |
  | w@0.75 / w@0.30 | +1.3 % | −2.3 % | **+17.5 %** | −1.3 % |
  | w@0.60 / w@0.20 | −4.8 % | +0.4 % | **+14.6 %** | −0.4 % |
  | w@0.95 / w@0.25 | −4.2 % | +0.9 % | **+32.8 %** | −0.9 % |

  Front and back hold to each other within 2.3 % on every pair and the anchor within 4.8 %; the side
  elevation stands 14–37 % apart on all four.

  **The ruling was re-tested against the segmentation itself on 2026-08-25**, after `#38` showed that
  a one-sided luma threshold is blind to anything brighter than the backdrop. Swept across seven
  settings — one-sided at −8, −12, −20, −30 and −40.8 luma, and two-sided at 20 and 40.8 — the outlier
  is the side elevation every time, at **+36.8 % to +37.8 %**. Two further settings, two-sided at 8
  and 12, name the back elevation instead, **and those two are provably contaminated rather than
  alternative readings**: this backdrop is not flat, varying by 12–13 luma across a single frame, so a
  threshold below that necessarily classifies backdrop as object. Every threshold above the
  backdrop's own range agrees.

  Recorded because a ruling that moved when the mask moved is what this record refused to make
  earlier on the same asset, using three bounding-box measures that disagreed with each other. **The
  difference now is not confidence — it is that the disagreeing settings can be shown to be broken.** That is the procedure's unambiguous case — a tight
  cluster and one view outside it — so **the side elevation tapers far more sharply than the object
  does, and is evidence for column arrangement only, not for taper.**

  Two limits on using this ruling, both from the procedure's step 6: it says nothing about the shape
  of any individual column drawn in that view, and fractional positions read off it stay valid while
  absolute distances do not.

- **Two files in the navigation buoy pack carry a full-width border strip, and this pack does not.**
  Recorded here because the scan covered all forty-four approved images at once: see
  `navigation-buoy-v001.md`. Every sea stack view is clean to its last row.
- **The base is shown terminating, and what it terminates on is not.** This entry said the base was
  "never shown terminating" until 2026-08-25. The anchor shows it plainly: the columns run straight
  down and end on a flat plane, each foot visible, with no plinth and no skirt of debris — which is
  exactly what Bible §10 specifies, so the specification is corroborated here rather than merely
  asserted. What no view shows is how that base meets an actual seabed, because every view stands the
  stack on a studio floor. **The distinction matters because the reconstruction needs the first fact
  and not the second**, and the old wording denied it the one it needed.
- The material studies show the column faces and the summit tops at a scale no elevation reaches;
  treat their part shapes as indicative and their materials as authoritative.
