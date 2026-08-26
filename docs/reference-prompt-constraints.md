# Reference pack generation — agent constraint block

Operating instructions for the agent that drives the image service. Reasons live in
`docs/reference-bible.md`; this file carries only what to do.

Work **one asset at a time**, in the order below. Do not begin an asset until the previous asset's
pack is complete and the operator has said to continue.

```
1  hero-vessel          (scale anchor — must be first)
2  navigation-buoy
3  marine-crate
4  underwater-structure
5  basalt-sea-stack
```

---

## Per asset

Open a new album. Do not reuse an existing album.

### Step 1 — identity anchor, approved before anything else

Generate `<asset>-anchor-3q-v001.png`. Get operator approval. **Do not generate any other view until
it is approved.** Every later view derives from it. A later view that contradicts it is regenerated,
never reconciled.

### Step 2 — geometric views

```
<asset>-elev-front-v001.png
<asset>-elev-port-v001.png
<asset>-elev-back-v001.png
<asset>-plan-top-v001.png        omit for basalt-sea-stack
<asset>-elev-starboard-v001.png  generate, do NOT place in the pack — see Step 5
```

### Step 3 — material close-ups

Only after every geometric view exists. Enumerate every distinct material the asset actually shows;
request one close-up per material.

```
<asset>-mat-<material>-v001.png
```

Minimum 2. **No maximum.** Split as finely as the asset warrants. Do not target a count.

### Step 4 — wet look-dev

```
<asset>-lookdev-wet-v001.png
```

### Step 5 — assemble the pack

Place in `/Users/alexnear/rw/reference-packs/<asset>-v001/`:

- every file from steps 1–4
- **except** `<asset>-elev-starboard-v001.png`, which stays out

### Step 6 — stop and ask the operator for the GLB

Post exactly this, filled in:

```
<asset> 的参考图已全部生成并放好。
GLB 生成好了吗？

放置目录：/Users/alexnear/rw/reference-packs/<asset>-v001/
文件命名：<asset>-v001.glb
```

Wait. Do not start the next asset until the operator says to.

### Step 7 — write the dispatch prompt for this asset

After the GLB is in place, write the reconstruction agent's prompt: the four-part block below with
**only the `Runtime` line rewritten** for this asset, based on what the reference images actually
show. Save it as `<asset>-v001.dispatch.md` in the pack directory.

---

## Generation constraints — every image

```
short side              ≥ 2048 px
foreground coverage     0.15 – 0.45 of frame
subject is one piece    largest connected blob ≥ 95% of foreground
                        no detached elements, no scattered fragments
background              flat, single colour, four-corner spread ≤ 2 levels
                        NO gradient, NO vignette, NO backdrop seam
subject ↔ background    RGB Euclidean distance > 60
no text                 no watermark, no caption, no stencilled lettering, no logo
no scene                object only, no environment, no horizon, no props
```

### Background colour per asset

Chosen against the asset's dominant surface, not fixed globally.

```
hero-vessel            dark or saturated   (subject is matte white — a light neutral FAILS)
navigation-buoy        dark or saturated   (subject is matte white — a light neutral FAILS)
marine-crate           light neutral
underwater-structure   light neutral
basalt-sea-stack       light neutral
```

### Elevations

Orthographic. No perspective. Every visible edge vertical or horizontal. Nothing receding.

Check before accepting: if a far element appears **inside** the near one on **both** sides of the
frame, the view is perspective — regenerate it. In a true orthographic view with a small azimuth
error, the far element swaps sides.

### Palette

```
graphite        structural and mechanical mass
warm grey       weathered neutral ground
matte white     primary superstructure
safety orange   SIGNAL ONLY — never the dominant surface
bronze          propellers only
```

An image reading as predominantly orange has failed. Regenerate.

### World

Contemporary offshore research and rescue. Working equipment, in service, used but maintained.
Documentary-photograph realism.

Excluded: military, historical sail, science fiction, cartoon, post-apocalyptic, luxury yachting.

### Wear

Chalked paint on sun-facing surfaces, salt bloom in recesses, rust bleed at fastener lines and weld
seams, scuffed rubber, sun-faded rope. Legible but never derelict.

---

## Per-asset fixed identity

Not renegotiable by any view.

**hero-vessel — ~14 m**
Hard-hulled working vessel. Wheelhouse forward. Open working aft deck. Twin propulsion with
**propellers below the waterline**. Matte white superstructure. Safety orange hull stripe. Graphite
deck fittings, rails, machinery.

**navigation-buoy — 2.4 m above water**
Spherical matte white float body on a tapered neck. Single safety orange band at its widest point.
Graphite fittings including a lifting eye on the neck. **A graphite navigation lantern in a
protective cage at the very top.** A graphite ballast keel beneath the hull on a short central
shaft, mass concentrated at the bottom.

**marine-crate — 1.2 m longest edge**
Closed marine shipping crate. Composite or timber body in warm grey. Graphite corner hardware and
banding. **No markings, no stencilled text.** Two graphite skids run the full length of the
underside.

**underwater-structure — 8 m**
Submerged receiver structure with clear semantic regions. Wet concrete and graphite. Biological
growth limited to what does not obscure the silhouette. Upper surfaces read broad and continuous. A
broad flat concrete deck across the top, unbroken except where the instrument bay opens.

**basalt-sea-stack — 250–300 m**
Columnar basalt. Warm grey to graphite. **No beach, no shoreline, no vegetation mass.** Waterline
band is a single horizontal dark stain, unbroken around the whole stack, darker than the rock above
and free of weed. Base below the waterline continues straight down as the same columnar rock, no
plinth, no debris skirt. **No top view for this asset.**

---

## The dispatch prompt (Step 7)

Reproduce verbatim. Rewrite **only** the `Runtime` line.

```
/img2threejs Rebuild the subject in this image as a procedural Three.js model.

你的参考资料就是这些。严格按照 /img2threejs 这条 skill 执行建模。

Fidelity   Hold proportions and silhouette to the reference. Enumerate the identity-defining
           details first — bevels and rounding, panel seams, fasteners, engraved or painted
           linework, gloss vs matte zones, wear — and drop any detail you cannot place on a
           real component instead of faking it.
Materials  Derive the finish class and gradient stops from the reference pixels, not from
           memory. Flag any colour that will not survive tone-mapping.
Runtime    <<< REWRITE THIS LINE FOR THIS ASSET >>>
Gates      Run --strict-quality, and do not advance a pass until the side-by-side review
           passes. Report per-region confidence for anything the image cannot show.
```

`Fidelity`, `Materials` and `Gates` are process discipline and identical for every subject — do not
touch them. `Runtime` is the only subject-dependent line; upstream it reads `for whatever should
move`, which is the slot the caller is expected to fill.

For `hero-vessel` the sockets are already fixed by `#37` and are not yours to choose:

```
Runtime    Expose bow, stern, propeller, wake and Interaction Anchor sockets with the proxy
           vessel's semantics unchanged, plus a userData.tick for a looping idle animation.
```

For the other four, derive the line from what the reference images actually show — that is why this
step happens after generation, not before.
