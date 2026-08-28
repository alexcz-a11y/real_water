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

Every view is produced by the same three-step chain. Approval happens at the **end** of the chain,
never in the middle.

```
1  generate the subject in chat             -> the render that carries the identity
2  Remove the background entirely. Output the subject on a fully transparent background.
                                            -> the RGBA cut-out; this is the view's ground truth
3  alpha-composite the cut-out onto the asset's background colour, LOCALLY
                                            -> the pack image
```

Approve the step-3 image. **Do not generate any other view until it is approved.** Every later view
derives from it, uses the same background, and runs the same three steps. A later view that
contradicts the anchor is regenerated, never reconciled.

Step 2 is safe because `remove_background` is a **separate, non-generative model**. Measured on the
hero-vessel anchor, the cut-out's pixels inside `alpha > 200` match the source render at mean
|Δ| **0.39**, median **0**, with 97.7 % of pixels within 4 levels — the outliers are edge
antialiasing. The cut-out is the same render, matted. That is what makes it ground truth.

Step 3 is a **local** composite, not a chat instruction, and this is the point the whole chain turns
on. Asking the service to change the background re-renders the whole subject. Measured on the
hero-vessel: the returned pure-black image had a perfect background (four-corner spread 0.00, 77.96 %
of pixels exactly (0,0,0)) but its silhouette had moved off the cut-out — bounding box shifted 21 px,
foreground coverage 0.219 → 0.181, 93.8 % of shared subject pixels changed by more than 4 levels,
silhouette IoU **0.823**. The same operation on a different subject gave IoU 0.715. A service-side
background swap therefore produces a *different vessel* that happens to sit on the right colour, and
it cannot be checked against its own cut-out.

The local composite has none of that: it keeps the approved render's pixels exactly, delivers a
four-corner spread of 0.00, and scores silhouette IoU **0.990** through the real foreground mask.

### Step 1b — build the reference, and grow it one image at a time

As soon as the anchor is approved, create a reference from it: `@<asset>`, class **Object**, with the
approved anchor as its first ingredient and the asset's fixed identity written into the
per-reference instructions. Every later prompt is `@<asset>` plus the camera or material instruction
— never a bare description, and never a chat follow-up that relies on conversation context.

**Then generate one image at a time, and feed each confirmed image back into the same reference.**

```
1  generate the next view with @<asset>
2  check it part by part against the images already in the reference
3  if it agrees, ADD IT to the same reference's ingredient list (max 20)
4  if it does not, regenerate that view — never carry a disagreement forward
5  only then generate the next view
```

The check in step 2 is a parts inventory, not an aesthetic judgement: is every component present,
and is it in the same place? For a vessel that means the davit and its hook, the propeller shaft
positions fore-and-aft, the anchor pocket, the mast antennas, where the rail breaks.

This is not optional bookkeeping — it is what keeps the set coherent. Generating every view against
a single-image reference produces views that each agree with the anchor and disagree with each
other. Observed on hero-vessel v1: the plan view dropped the aft-deck davit entirely, and the two
side elevations put the propellers at different points along the hull. The reference has to
accumulate into a mutually-consistent multi-view set, so each new image is generated against
everything already confirmed.

Steps 2, 3 and 4 all run this loop.

### Step 2 — geometric views, as many as the subject's symmetry actually earns

The view list is **not fixed**. `check_reference_admission.py` rejects any view whose pHash is
within 6 of an already-admitted one — *"adds no information"* — and
`grimoire/intake/validation_rubric.md` lists **"one view only but object has rotational symmetry"**
as an acceptable *Conditional* case. A subject that looks the same from four azimuths does not get
four elevations.

Choose from the subject's symmetry, then prove it with the gate rather than assuming:

```
no symmetry / bilateral only          elev-front, elev-port, elev-back, plan-top
  (hero-vessel, marine-crate,         elev-starboard generated for the GLB service only — Step 5
   underwater-structure)
body of revolution                    elev-profile ONLY — one orthographic elevation defines the
  (navigation-buoy)                   entire revolve curve; a second azimuth is the same picture
no top view                           basalt-sea-stack
```

**Run the gate, do not assume.** Before a view enters the pack, check it against the pHashes of
everything already admitted:

```bash
python3 forge/stage1_intake/check_reference_admission.py <view>.png \
    --viewpoint <slug> --against <comma-separated pHashes of the admitted set> --json
```

`"admitted": false` is blocking, and there are two different causes that must be told apart before
reacting:

- the view genuinely **is** redundant → drop it and shorten the matrix for this subject
- the view **should** have been distinguishable → the lighting or the projection is flattening the
  subject into a silhouette. That is the failure documented under *Lighting*; fix that, do not
  paper over it by lowering the bar

**Run the admission check on the pack image, never on the step-1 render.** Under the lit standard
the render's background is a lit backdrop, not a flat colour — the first buoy anchor generated this
way came back on dark navy `(9,12,19)` with a gradient, and `check_reference_admission.py` rejected
it at `foregroundCoverage 0.9995` with *"no background to segment against"*. That is not a defect in
the image; it is step 1 of a three-step chain being checked as if it were step 3. Cut out, composite
locally onto the asset's background colour, and check **that** file.

One at a time, each confirmed and added to the reference before the next is generated.

### Step 3 — material close-ups

Only after every geometric view exists and every one of them is in the reference. Enumerate every
distinct material the asset actually shows; request one close-up per material, running the same
one-at-a-time loop — confirm, add to the reference, then generate the next.

A close-up still has to satisfy the frame constraints, so ask for the component **detached and
alone** at roughly a third of the frame, not a tight crop that fills it. A frame-filling crop lands
at coverage ≈ 1.0 and is rejected outright.

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

The starboard elevation is not discarded — it is the GLB service's input. Put the four views that
service needs in `_glb-input/`, named for what they are, with a README saying which one is withheld
from the pack and why:

```
_glb-input/front.png   _glb-input/left.png
_glb-input/right.png   _glb-input/back.png
```

`left` is the port elevation and `right` is the starboard elevation. **No top view** — Tripo3D does
not take one; the plan view belongs to the pack, for the reconstruction agent.

`right` is the only one of the four absent from the pack (Reference Bible §5.1). Do **not** file it
under `_cutouts/` — that directory holds the RGBA ground-truth cut-outs, and burying a required
input there reads as a missing view.

For a **body of revolution** there is only one distinct elevation, so `_glb-input/` holds
`front.png` alone and the README states that the subject is a surface of revolution and that the
service should be run in single-image mode. Do **not** copy one elevation into four filenames to
satisfy the shape of the directory — four identical inputs is not four views, and it is the same
mistake the admission gate exists to catch.

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
short side              ≥ 2048 px   (native output is 4096 — no upscale step)
foreground coverage     0.15 – 0.45 of frame
subject is one piece    largest connected blob ≥ 95% of foreground
                        no detached elements, no scattered fragments
background              flat, single colour, four-corner spread ≤ 2 levels
                        NO gradient, NO vignette, NO backdrop seam
subject ↔ background    RGB Euclidean distance > 60
no text                 no watermark, no caption, no stencilled lettering, no logo
no scene                object only, no environment, no horizon, no props
lighting                ordinary soft-studio photograph — form shading present, genuine
                        speculars, no hard cast shadow across the object — see below
```

### Lighting — by image class, and the standard is the skill's, not this file's

An earlier version of this file required an **albedo pass with the lighting switched off** for
every image, no exceptions, on the grounds that a baked directional key is read back as material
colour. That rule was invented here. `/img2threejs` does not ask for it anywhere, and three of its
intake tools are built on the opposite assumption — that a reference is an ordinary lit photograph
and that *they* do the de-lighting:

```
analyze_texture.py        classifies finishClass from specularFraction (pixels > 235) and
                          gradientStrength. Source comment: "flat paint has the gradient from
                          lighting only, so low mottle." brushed-steel needs spec_frac > 0.05 or
                          anisotropy > 1.9; gem-metal needs spec_frac > 0.05. At spec_frac = 0
                          those classes are unreachable by construction.
extract_pbr_evidence.py   outputs albedo palette, DE-LIT albedo, roughness, height, normal and AO.
                          Every one of the last four is derived from shading variation.
delight_albedo.py         "A single photo bakes together albedo, direct light, ambient occlusion,
                          and specular response into one signal" — it exists to remove lighting,
                          which means lighting is expected to be there.
```

So the pipeline de-lights internally and needs the lit original to do it. Flattening at generation
time destroys evidence that the tools would have removed safely themselves, and nothing downstream
can put it back.

**What it cost.** With the lighting pass off and the projection orthographic, both cues that carry
volume — perspective convergence and shading falloff — are gone, leaving a silhouette and a texture
map. Four navigation-buoy elevations generated that way were rejected by the skill's own gate:

```
check_reference_admission.py --against <the already-admitted set>
  anchor-3q       admitted
  elev-front      REJECTED   duplicate/near-duplicate: pHash within 6 (adds no information)
  elev-port       REJECTED   same
  elev-back       REJECTED   same
  elev-starboard  REJECTED   same
```

A body of revolution photographed flat is literally the same picture from every azimuth.

**The standard.** The skill never states one positively, so keep it minimal and derived: an
**ordinary soft-studio photograph** — a large diffuse source plus fill, form shading from the
object's own curvature, genuine ambient occlusion in recesses and undercuts, honest specular
response that reaches full white on metal and glossy paint, and no hard cast shadow lying across
the object and obscuring geometry. This applies to **every** class including the material
close-ups, which need it most: they are what `analyze_texture.py` reads, and a "nothing blows out
to pure white" instruction is precisely what drives `specularFraction` to zero.

**There is no validated numeric instrument for "reads as a solid volume" — do not invent one.**
Three global luminance statistics were tried against the real assets and all three failed. `form`
(centre minus both silhouette edges) and `tilt` (right edge minus left edge) are reported by
`form.py` in the working scratchpad, and a bright-pixel fraction alongside them:

```
                                   form      |tilt|   bright>235
flat set, gate-REJECTED          +1.6..+6.0   2.5..7.1   40..86 %
lit anchor, gate-ADMITTED        +6.0        27.4       21.9 %
hero-vessel anchor (accepted)    +0.5        24.7       33.0 %
hero-vessel port elev (accepted) +2.7         2.4       20.6 %
```

`form` overlaps completely — the admitted anchor scores the same +6.0 as the worst of the rejected
set. `|tilt|` fails on the hero-vessel port elevation, which sits at 2.4 with the rejected set and
still reads as a solid object. The bright-pixel fraction runs *backwards*: the flat images score
highest, because an unshaded white surface sits uniformly at 239-244, so "many bright pixels" means
*no* highlights rather than strong ones.

The lesson is that volume lives in **local** shading — occlusion in recesses, darkening at bevels
and undercuts, material variation across a surface — and no whole-image left/right/centre statistic
sees it. So the two checks that actually caught this failure are the ones to run, and neither is a
luminance number:

```
1  check_reference_admission.py --against <admitted pHashes>
   A near-duplicate rejection between views that SHOULD differ is the machine-readable symptom of
   a flattened subject. This is what caught the buoy set.
2  a side-by-side against an accepted pack
   Crop both to the subject, scale to equal height, and look. hero-vessel next to the flat buoy
   made the defect obvious in one frame after four global metrics had all called it fine.
```

### Background colour per asset

Two colours only, chosen against the asset's dominant surface. One background colour per pack — a
pack that mixes backgrounds teaches the reference a variable it should not carry.

```
hero-vessel            PURE BLACK  (0,0,0)        white superstructure — measured, see below
navigation-buoy        PURE WHITE  (255,255,255)  graphite keel, flange and lantern — measured, see below
marine-crate           PURE WHITE  (255,255,255)
underwater-structure   PURE WHITE  (255,255,255)
basalt-sea-stack       PURE WHITE  (255,255,255)
```

**No third option.** A saturated background is not a fallback, it is a structural failure: the
foreground mask treats any pixel with `saturation > 0.16` and `luma < 0.94` as foreground, so a
saturated background classifies *itself* as subject. Measured, a saturated-blue background produced
`foregroundCoverage = 1.0000` and the admission check rejected the image outright. The service also
ignores a requested RGB triple for a saturated colour — asked for (0,64,200), delivered (24,99,185),
four-corner spread 10.98 against a limit of 2.

**Mid-range grey is excluded on measurement, not on the old reasoning.** The original argument — that
only endpoints clip residual shading — died when Step 3 became a local composite: four-corner spread
is 0.00 at *every* level now. The replacement reason is measured. Sweeping all 15 hero-vessel
cut-outs across levels 0..255 and scoring the foreground mask as silhouette IoU against each
cut-out's own alpha:

```
level:  0     24    48    72    96   118   128   140   160   180   200   224   255
mean : .983  .943  .826  .826  .908  .950  .960  .966  .967  .975  .977  .925  .984
worst: .956  .833  .512  .611  .686  .781  .814  .856  .865  .912  .912  .591  .955
```

Both endpoints beat every mid-tone. Grey 128 is also the *lowest* perceived contrast of the three
(mean |luma(subject) − luma(bg)| across the geometric views: black 84.2, grey 128 68.9, white 170.8),
because a marine asset's own palette centres near mid-grey. Grey loses on both instruments at once.

Which endpoint fails, and where:

```
on PURE WHITE   subject brighter than ~(215,215,215) starts dissolving into the background
                synthetic upper bound: (230,232,235) loses 43.3 %, (245,246,248) loses 58.4 %
on PURE BLACK   subject darker than ~(40,40,45) starts dissolving into the background
                synthetic upper bound: (28,28,32) loses 12.6 %, (12,12,14) loses 35.3 %
```

**Those two figures are upper bounds from a uniformly re-tinted synthetic solid, not asset
properties.** Measured on the real hero-vessel the direction survives and the magnitude does not:
pure white loses 3.46 % of the anchor view (~4.5 % on the worst close-up), not 43 %; pure black
loses 0.15 % of the underbody, not 12.6 %. Quote the synthetic numbers as a ceiling only; quote the
measured ones when talking about an asset.

Black versus white on hero-vessel, per view, as silhouette IoU (delta in points, positive = black
better). Verified stable at two raster scales:

```
mat-white-superstructure  .9930 / .9486  +4.44      mat-graphite-hull       .9929 / .9932  -0.04
anchor-3q                 .9670 / .9389  +2.82      mat-orange-stripe       .9916 / .9930  -0.14
elev-front                .9670 / .9393  +2.77      mat-antifoul-underbody  .9904 / .9919  -0.16
mat-rail-steel            .9711 / .9616  +0.95      mat-bronze-propeller    .9830 / .9847  -0.17
mat-glazing               .9903 / .9820  +0.84      elev-back               .9596 / .9638  -0.42
plan-top                  .9730 / .9710  +0.20      lookdev-wet             .9618 / .9671  -0.53
mat-deck-plate            .9912 / .9904  +0.08      elev-starboard          .9467 / .9538  -0.71
                                                    elev-port               .9474 / .9562  -0.87
mean  black .9751  white .9690        worst  black .9467  white .9389
```

Black wins 7 views by up to +4.44; white wins 8 by at most +0.87. Black is ahead on both aggregate
statistics, and its three large wins are exactly the white-subject views. **hero-vessel is all
black.** Per-view mixing would lift the worst cell only .9467 → .9538 and is not worth a second
background colour inside one pack.

Note the two instruments answer different questions and are allowed to disagree. Perceived contrast
is what a human reads; silhouette IoU is what `build_foreground_mask` measures — it scores RGB
distance from the sampled corner, not visual salience. On black the underbody reads poorly to the
eye (stern gear subject luma 70.7 against a black ground) while costing the mask only 0.48 %. The
mask's genuinely weak band on black is the *top*: thin dark mast, antennas and rails, 8.12 % lost on
the stern elevation.

Named residual risk, per group. Check it, do not assume it away.

```
white-background assets   chalked paint and salt bloom rendering above ~230
black-background assets   graphite recesses and cast shadow rendering below ~40
```

**The buoy moved from black to white when its identity changed.** The original entry justified
black as "matte-white subject". The regenerated buoy carries a graphite ballast keel, a graphite
flange and a graphite lantern — large near-black masses — and a near-black subject region cannot be
separated from a near-black background. Measured over all seven pack images, silhouette IoU through
the real foreground mask:

```
                       on BLACK   on WHITE
mat-ballast-iron         0.9120     0.9910
mat-graphite-flange      0.9253     0.9914
anchor-3q                0.9598     0.9898
mat-lantern-cage         0.9544     0.9795
elev-profile             0.9825     0.9885
mat-white-float          0.9913     0.9943
mat-orange-band          0.9880     0.9931
```

White wins on **every** view, and black fails the 0.95 bar on two of them. Pick the pack colour from
the subject's actual value range as it finally exists, not from the asset's original description —
and re-check it if the identity changes.

### Prompt wording for the background

A **named colour** anchors the render; a **description** does not. Say the colour by name and forbid
shadow explicitly, in the chat box, as its own instruction:

```
把背景换成纯黑色，不要有任何阴影
把背景换成纯白色，不要有任何阴影
```

Measured: a descriptive phrase ("seamless plain light neutral grey background") delivered a
four-corner spread of **53 levels**; the named-colour form delivered exactly (0,0,0) / (255,255,255)
with a spread of **0.00**.

### The render backdrop is not the pack background colour

Step 1's backdrop exists for one job: letting step 2 separate the subject. Step 3 then puts the
subject on the asset's pack colour **locally**, so the two are independent and must be chosen
independently.

Under the old flat-albedo rule the subject was uniformly bright, so a near-black backdrop was
harmless. Under the lit standard it is not: a subject with a **dark material** photographed against
a dark backdrop cannot be cut out. Measured on the buoy anchor — graphite ballast keel, backdrop
returned at RGB `(1,1,5)` — `remove_background` deleted the entire keel:

```
source render foreground   2 840 498 px   subject rows 350-3720
cut-out foreground         2 481 609 px   subject rows 348-3062
lost by the cut-out          517 861 px   = 18.2 % of the subject
```

Choose the backdrop for separability from the subject's **darkest and lightest** material at once,
name it by RGB, and forbid shadow on it. A plain mid grey `RGB 128,128,128` clears both a matte
white hull (distance ≈ 220) and graphite fittings (distance ≈ 144). The nominal
`subject ↔ background distance > 60` rule is necessary but **not sufficient** — graphite against
pure black scores ≈ 80 and still failed.

### Check that the cut-out kept the whole subject

`gate.py` reports this as **cut-out completeness**, and it is the one check nothing else can stand
in for. Every other criterion compares the pack image against *that same cut-out*, so whatever the
cut-out dropped is invisible to all of them — in the buoy case coverage, largest-blob and silhouette
IoU all passed while 18.2 % of the subject was missing. Compare the cut-out's alpha against the
**render's own** foreground instead, and reject above a couple of percent loss.

The same blind spot covers a **clipped** subject: if the subject touches the frame edge, coverage
*rises*, the largest blob stays ~1.0, and the IoU stays high because the cut-out is clipped
identically. `gate.py` reports that as **frame margin**. A local crop that raises coverage must be
checked against it — one written here clipped the keel off the bottom and every numeric criterion
still passed.

### Verify the mask yourself — the admission check cannot

Score the pack image's foreground mask against its own step-2 cut-out's alpha as a silhouette IoU.
**Accept at IoU ≥ 0.95.** Because step 3 is a local composite, the two share pixels exactly, so
render drift is zero by construction and anything below the bar is mask pathology — the background
colour is failing to separate this subject. Keep the cut-out beside the reference as evidence; it is
not part of the pack.

This step is not optional bookkeeping. The downstream admission check catches a *total* separation
failure and misses a *partial* one, which is the failure that actually happens. Measured on a
reconstruction of the v2 incident (matte white on a light neutral, distance 8.8 against a threshold
floor of 24.0):

```
subject 0–15 % non-white    coverage collapses, fallback fires, coverage → 1.0, REJECTED
subject 30 % non-white      coverage 0.0623, no warnings, ADMITTED — silhouette IoU 0.300
```

Coverage and largest-connected-blob cannot see it because the damage is interior holes, not
fragmentation. The realistic subject — white superstructure plus an orange stripe plus graphite
fittings — sits in the band that passes.

Note also that the constraints in this file are far stricter than the downstream check's own limits
(it admits coverage 0.05–0.97, short side ≥ 64 px, largest blob ≥ 0.60). Passing that check is not
evidence of meeting the constraints above.

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
Columnar basalt. Warm grey to graphite. **No beach, no shoreline, no vegetation mass.** **No
waterline band** — the requirement was retracted on 2026-08-28 because it and the columnar relief
were never achievable together; see the Reference Bible section 8. The base continues straight down
as the same columnar rock, no plinth, no debris skirt. **No top view for this asset.**

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
