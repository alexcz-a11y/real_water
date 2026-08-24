# Reference Pack — underwater structure, v001

Generated 2026-08-24. Selected view by view by the agent under `docs/reference-bible.md`; the
project owner reviews the pack as a whole.

Nine approved views. The pixels live outside the repository at
`~/rw/reference-packs/underwater-structure/v001/`; this file is their in-repo evidence. See ADR-0022
for why the pixels stay out.

Every view came straight from generation — no region edit, no canvas extension.

## Provenance

| Field | Value |
|---|---|
| Service | Reve, model 2.1, via `app.reve.com` |
| Plan | Reve Lite (paid) |
| Operated by | Claude Opus 5 through the ego-browser agent browser |
| Album | Submerged Receiver Structure Inspection, `da55e07f-7d6e-4a4b-a021-c6c9fcafb24f` |
| Reference object | `@sub-structure`, type Object |
| Settings | 1:1 aspect · Count 4 · attachments interpreted Literally |
| Output | 4096 × 4096 PNG, every view |

The account's identity is deliberately not recorded — `hero-vessel-v001.md` sets out why, and its
record of the service's output terms applies to this pack too.

## Approved views

| File | View | Reve image id | sha256 (first 16) |
|---|---|---|---|
| `sub-structure-anchor-3q-v001.png` | Identity anchor, three-quarter | `95708e10-c0a4-4dae-aaac-f110cc648147` | `2a25df31c2d30d47` |
| `sub-structure-elev-front-v001.png` | Front elevation | `60d323f5-8510-4e18-8a22-200eac283f68` | `62cee261a3b90f28` |
| `sub-structure-elev-side-v001.png` | Side elevation | `36b92261-5af4-4cf9-9fed-99045d9b68d6` | `46b28f52a10d12be` |
| `sub-structure-elev-back-v001.png` | Back elevation | `cd493f3c-e92c-4a78-98a5-19b3bf16999d` | `5a8ec1eb46ae2928` |
| `sub-structure-plan-top-v001.png` | Top view | `7e208c1f-3ec9-41bc-8a8d-92fb0657c177` | `261ba2bd7c6299a4` |
| `sub-structure-mat-deck-concrete-v001.png` | Material — bare deck concrete | `56ec731e-e72d-4a63-8750-4f47a635978c` | `ef79454aa30ecb24` |
| `sub-structure-mat-growth-boundary-v001.png` | Material — growth meeting bare concrete | `c02ec6a7-5509-4bda-b731-6f7d33797ccf` | `59142eb9acfaff1a` |
| `sub-structure-mat-bay-rim-v001.png` | Material — instrument bay rim | `859d85a4-fb6d-49e0-8954-a9cc51ae908c` | `1b120fecdcac5ee3` |
| `sub-structure-lookdev-wet-v001.png` | Wet look-dev | `32700a27-f5d7-4418-a750-cf53b0ff6bfd` | `12f9231093599aaf` |

## Decisions forced by generation

- **The semantic regions were fixed before the album opened**, because "clear semantic regions" is an
  acceptance criterion of `#39` and generation would otherwise invent a different set per view. Bible
  §10 now names four: the broad flat deck, the recessed instrument bay, four square corner legs, and
  one continuous footing slab.
- **The deck stays bare.** Growth on it would break the continuous receiver surface the asset exists
  to provide, so the Bible states that growth stops clear of the deck, and every approved view holds
  to that.

## Rejections and why

- Two anchor candidates let the biological growth spread across the footing slab's upper face and up
  toward the deck, leaving no clean band and no bare receiver surface.
- One anchor candidate carried the growth asymmetrically, present on two legs and absent on the
  others, which no derivative view could then reproduce consistently.

## Known differences from the specification

- **The three elevations are equivalent by construction.** The structure has four-fold symmetry, so
  the front, side and back elevations differ only in generation noise — grain, growth boundary height,
  footing edge. They are kept because Bible §6 requires them and because their agreement is itself
  evidence, but they carry no independent geometry. The service titled two of them identically; the
  filenames here, not the service's titles, are authoritative.
- **My front-elevation prompt asked for the far legs to be visible in the gap between the near legs.**
  That is impossible in a true orthographic elevation: the far legs sit exactly behind the near ones.
  The generation was right to leave the gap empty and the prompt was wrong. Recorded because the same
  mistake would look like a lost part to anyone auditing the view against its prompt.
- **The deck soffit is never shown.** Bible §11 fixes it as a flat unbroken concrete plane, and no
  approved view sees it. It is the volume half of "caustic and volume receiver", so the
  reconstruction takes it from the Bible, not from these images.
