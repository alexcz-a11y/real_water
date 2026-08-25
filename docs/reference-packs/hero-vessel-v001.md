# Reference Pack — hero vessel, v001

Approved 2026-08-23. Approver: the project owner, view by view, in a live session.

Nine approved views. The pixels live outside the repository at
`~/rw/reference-packs/hero-vessel/v001/` so that every reconstruction worktree can read them;
this file is their in-repo evidence. See ADR-0022 for why the pixels stay out.

**These images are not reproducible from their prompts alone.** Four of the nine were produced or
repaired by direct manipulation in the generating tool — a canvas extension and two region edits —
and those operations are described here in words because no prompt reproduces them. Auditability,
not reproducibility, is what this record provides.

## Provenance

| Field | Value |
|---|---|
| Service | Reve, model 2.1, via `app.reve.com` |
| Operated by | Claude Opus 5 through the ego-browser agent browser |
| Album | Offshore Research Workboat Study, `2edff8ad-0419-469e-84af-94fc4f73ec13` |
| Reference object | `@hero-vessel`, type Object, holding the approved views as Ingredients |
| Settings | 1:1 aspect · Count 4 · attachments interpreted Literally |
| Output | 4096 × 4096 PNG, every view |

The Reference Bible's prompt-invariant block was set once as the album's persistent Guidelines
rather than repeated per prompt, so every generation in this pack carried it.

## Approved views

| File | View | Reve image id | sha256 (first 16) |
|---|---|---|---|
| `hero-vessel-anchor-3q-v001.png` | Identity anchor, port bow three-quarter | `819409ea-b3c8-46ff-b9a1-5a2c5df4e04e` | `885bd16eda6936c6` |
| `hero-vessel-elev-front-v001.png` | Front elevation | `85bcc5f2-b53a-4ce5-b783-0af9238f4522` | `55ce065cfdb73ce5` |
| `hero-vessel-elev-port-v001.png` | Orthographic port elevation | `9c154aba-447a-4746-a114-d65c8cba0189` | `bff9b80b2ccc2031` |
| `hero-vessel-elev-stern-v001.png` | Orthographic stern elevation | `0415525d-40d2-4399-9107-120c7ab8b34b` | `18bdb15ef210383b` |
| `hero-vessel-plan-top-v001.png` | Orthographic top view | `d49c15c9-1327-4601-8788-58366982204a` | `7c6b979a02fbbf72` |
| `hero-vessel-mat-hull-paint-v001.png` | Material — topside paint, orange stripe, waterline | `faa10bf6-8bec-4d6b-9e20-5db2e0f04a7c` | `bf6cb48399d5ac03` |
| `hero-vessel-mat-fender-rope-v001.png` | Material — rubber fender, rope, graphite cleat | `582f4008-f7c3-4b3b-be2d-528cb128618b` | `6fde4d4c93e68ca8` |
| `hero-vessel-mat-deck-winch-v001.png` | Material — deck non-slip, stanchion base, winch | `bfb77c35-96e7-4914-82f7-c7fc1b02fc3b` | `c92b6be3ddbc6964` |
| `hero-vessel-lookdev-wet-v001.png` | Wet look-dev | `4998bfc2-cfa5-47d8-b57c-a163d84d4c95` | `802cec9e78ef37cf` |

The five geometric views are Ingredients of `@hero-vessel`. The three material studies and the wet
look-dev are deliberately **not** Ingredients: a tight surface crop carries no identity information
and pulls later generations toward close-up framing. They are material evidence, held in this pack
and cited from here.

## Manual operations that no prompt reproduces

**Identity anchor.** All four first-round candidates cropped the stern at the frame edge. Rather
than re-rolling, the chosen candidate was extended with the tool's Reframe in Literal mode at 0.70
scale, which paints new canvas around the original pixels. The vessel's identity survived exactly —
wheelhouse, window count, single orange stripe, graphite fittings, bow anchor all unchanged — but
**the stern in this anchor is generated, not observed**. It is the only invented region of the
vessel, and it is where the stern, propeller and wake sockets attach. Hold it to a higher standard
than the rest.

**Top view, twice.** The first plan carried six fenders, three per side. A region edit replaced the
forward pair with plain hull plating. A second region edit removed the remaining odd fender on the
starboard side. The result is two per side, which agrees with the port elevation.

## Decisions forced by generation

Two parts appeared that the anchor could not show, both functionally necessary. Each was settled at
the moment it appeared — written into the Reference Bible as specification — rather than left
undecided, because an undecided part drifts differently in every later view.

- **Bronze propellers.** Twin four-bladed bronze propellers on exposed shafts with A-bracket struts,
  either side of a central skeg. Bronze was absent from the Bible's palette, which made a correct
  image look like a violation. The Bible now permits bronze for propellers only.
- **Graphite horn cleats.** The fenders must hang from something. The Bible now fixes a graphite
  horn cleat at each fender position.

## Rejections and why

- A stern view whose boarding ladder had moved to the transom — a part relocated, not added.
- A material study whose winch drum read as brass, which would have broken the bronze scope on the
  day it was written.
- A wet look-dev with rain-like streaking across the whole frame: rain is weather in this project,
  not a material property, and reading it as wetness would bias the reconstruction.
- A starboard three-quarter look-dev: no approved view covers that side, so nothing could check it.

## Two approved views that should have been rejected

Found 2026-08-24 by the `#37` reconstruction through cross-view checking, and verified here against
the same files before recording. **Both are defects in this pack's approval, not in the model.**

**1. The port elevation lost every part below the waterline.** Bible §10 fixes "two four-bladed
bronze propellers on exposed shafts with A-bracket struts, set either side of a central skeg" as
parts of this vessel. The port elevation draws the black bottom terminating in a smooth unbroken
curve: no propellers, no shafts, no A-brackets, no skeg, no rudder. **Bible §8 invariant 2 — no part
gained, no part lost — should have rejected this view and did not.**

**2. The port elevation and the top view disagree on the deck-box arrangement.** The top view shows
three deck boxes side by side in one transverse row across the beam, aft of the winch. The port
elevation strings them out fore-and-aft at three different longitudinal stations. They cannot both
be right.

Take the deck-box arrangement from the **top view**, which sees the athwartships axis directly and
is the only approved view that can resolve a fore-aft-versus-athwartships question at all. Take the
running gear from **the stern elevation**, corrected below.

**Why the review missed both.** Every derivative view was checked against the identity anchor for
silhouette, part count, proportion, material and palette — but **pairwise between derivative views
only where a part was visibly disputed**. A part that is simply *absent* from one view raises nothing
to dispute: the anchor is a port-bow three-quarter and its running gear is below the frame, so
"absent here too" read as consistent. The check that would have caught it is the one this pack
never ran — **every fixed part in §10 against every view that should show it**, driven from the
specification rather than from what the images happened to argue about.

## The stern elevation shows the running gear, and this record said nothing did

Corrected 2026-08-25. The entry above used to end *"take the running gear from Bible §10, since no
approved view now shows it"*, and that clause was reached by inference rather than by looking: the
port elevation had lost everything below the waterline, and **"absent from the view that should have
had it" was carried straight through to "absent from the pack"**. The stern elevation was never
opened.

It shows the whole assembly — two four-bladed bronze propellers, exposed shafts, A-bracket struts and
the central skeg — and it shows them measurably. Normalised to the beam (2037 px):

**Use the ratios, not the beam fractions.** The first version of this table normalised against the
silhouette's bounding box, which on a stern elevation is the **fender outer edge** — the fenders hang
12.42 % outboard of the hull. Worse, the hull's own deck-edge beam cannot be recovered from this view
at all, because the fenders overlap exactly the line you would measure. So beam is the wrong
denominator here twice over, and these quantities are given as ratios among themselves instead:

| quantity | measured |
|---|---|
| propeller diameter | 322.5 px, the two discs agreeing to 0.3 % |
| shaft spacing ÷ propeller diameter | **2.6713** |
| running gear depth ÷ propeller diameter | **1.0822** |
| pair symmetry about the centreline | 0.06 % |

For reference only, and not to be built from: fender outer edge 2037 px, hull at the lowest
fender-free station 1812 px.

**Two independent self-checks say the reading is sound**: the two propeller discs agree with each
other to 0.3 %, and the pair is symmetric about the centreline to 0.06 %. Neither was imposed by the
measurement.

**One caveat for anyone re-measuring**: the starboard propeller's blades fall partly into shadow, and
a bronze-hue mask splits it into two clusters of 0.084 and 0.041 beam. Merged, it is 0.1581. Taken
separately it reads as two small discs that do not exist.

**What the stern elevation still cannot give is longitudinal station.** It is an end-on view, so the
fore-and-aft position of the propellers remains unconstrained by any approved view and comes from the
proxy vessel's socket, exactly as `#37` reported. **The axis that was genuinely unconstrained was
one; this record claimed it was all of them.**

That is this record's fourth absence claim of the kind — with the underwater structure's soffit, the
sea stack's base, and the marine crate's hinge, all found the same day by three different sessions.
The cost is not symmetric across them: **the soffit and the base merely understated evidence, while
this one sent an active reconstruction to build from prose when pixels were available.**

## The propeller sockets and the stern elevation disagree by 6 %, and it is not a units error

The `#37` reconstruction placed its propeller hubs against `#25`'s frozen sockets at x = ∓1.05 m, as
its ticket requires — it replaces the appearance, not the interface. Measured off the stern
elevation, the hubs sit further outboard than that.

**The disagreement survives removing every shared denominator.** Expressed as a pure ratio, shaft
spacing over propeller diameter is **2.6713** in the approved pixels and **2.5089** in the model
built to the socket — 6.08 % apart. `#37` reached −6.1 % from the opposite direction, converting the
pixels into metres against its own beam; two routes with nothing in common converged.

So this is not a normalisation artefact, and it forces a choice between two things rather than
leaving three possibilities open:

- **The socket position is what should move.** Taking the sockets as correct implies a propeller
  diameter of **0.786 m** from the pixel ratio. Three independent sources say 0.845: Bible §10's
  text, `#37`'s model built from that text without reference to the pixels, and this pack's own
  measurement at 0.8453. Those three agree to 0.3 mm.
- **The stern elevation is stretched athwartships by 6 %.** This cannot be ruled out from inside the
  image, and it is worth stating why the usual test does not settle it: the two propeller discs agree
  with each other to 0.3 % and the pair is symmetric to 0.06 %, but **a uniform horizontal scale
  preserves both of those**. Internal consistency is evidence against a local defect and no evidence
  at all against a global one.

**Not ruled here.** Moving a socket is an interface renegotiation between `#25` and `#37`, which is
outside what a pack owner decides. Recorded so that whoever does rule has both branches and the
number that separates them.

**Depth is not comparable yet and no figure is offered.** This record's "below the hull" is a
threshold — the lowest row where the hull silhouette is still wider than half its maximum — while
`#37`'s is a station in its model. A stern elevation is end-on and flattens every longitudinal
station onto one outline, so the deepest point of the whole hull wins. The two numbers measure
different things and their 18 % gap means nothing until a landmark both can locate replaces them.

## Known differences from the specification

- The stern geometry is self-consistent across the stern elevation and the top view but descends
  from the Reframe extension rather than from any observed view.
- The material studies show a cleat and a winch in more detail than any geometric view does; treat
  their part shapes as indicative and their materials as authoritative.

## Generating service and output terms

Retrieved 2026-08-24 from `https://app.reve.com/terms` (redirected from `https://reve.com/terms`)
and `https://app.reve.com/usage`. The Terms of Service carry **LAST UPDATED: 10/28/25**; the Usage
Policy carries **LAST UPDATED: 9/15/25**. An archived earlier version is published at
`/terms/archive/20250915.html`, so the version in force is identifiable after the fact.

Quotations below are verbatim. They are recorded, not interpreted — the compatibility judgement
against ADR-0008 belongs to the project owner and is recorded separately at the end of this section.

### Ownership of output — Terms §2.2

> To the extent permitted by applicable law and subject to the license you grant to Reve (and, in
> some cases, other users) in Section 2.3 below, you (a) retain any ownership rights you may have
> in your Input, and (b) own the rights to any Output you create using the Services.

> Reve hereby assigns to you all right, title, and interest held by Reve, if any, in and to Output
> you create, subject to the license you grant to Reve in Section 2.3 below.

> Reve does not represent or warrant that Outputs are protectible by intellectual property rights
> under applicable law or free from any third-party intellectual property rights.

### Commercial use

The Terms and the Usage Policy contain **no clause restricting commercial use of Output**. The
nearest restriction is Terms §1.3(c), which is narrower than commercial use in general:

> use Output to develop models that compete with Reve

### Redistribution — Terms §1.3(a) and §2.3

Terms §1.3(a) prohibits redistributing **the Services**, not Output:

> license, sublicense, sell, rent, lease, transfer, assign, reproduce or distribute, any of the
> Services

Terms §2.3 attaches a licence that runs the other way, and its scope depends on account tier:

> Output that you create using a Free Account may be made available (but Reve has no obligation)
> to and/or searchable by other users, including on Reve's Inspiration page, and Free Account users
> (or Paid Account users who choose to share Content with other users through Reve's Services)
> hereby grant a perpetual license to Reve and other users to reproduce, distribute, create
> derivative works of and publicly display such Output for this purpose.

> You agree that Reve may use Your Content to improve and promote the Services, including by
> training its artificial intelligence models. If you are using a Paid Account, you may opt-out of
> the use of Your Content for model training by selecting the opt-out option on your Account page.

### Facts this record cannot settle

1. ~~The account tier of the generating account is not recorded here.~~ **Settled 2026-08-24: the
   generating account was on the Reve **Free plan** at the time of this pack, read from the account
   page.** The account's own identity is deliberately not recorded: §2.3 turns on the *tier*, and the
   conclusion below is identical for any Free account, so an identifier here would carry no
   information and a permanent cost. Terms §2.3 therefore applies in full to these nine views: they
   "may be made available ... to and/or searchable by other users, including on Reve's Inspiration
   page", and a "perpetual license to Reve **and other users** to reproduce, distribute, create
   derivative works of and publicly display such Output" has been granted. Ownership is retained
   regardless; what a Free Account grants alongside it is a licence to third parties. The model
   training opt-out in §2.3 is available to Paid Accounts only, and by its own wording applies only
   to Content created *after* the opt-out is selected — so it could not be applied retroactively to
   this pack even if the account were upgraded.
2. **The nine files were downloaded by an agent driving the site's own download control.** Terms
   §1.3(b) prohibits "automatically or programmatically extract or scrape data or Outputs from the
   Services". Whether an agent operating the published UI falls inside that phrase is not settled
   by the text, and §1.4 addresses agents acting on a user's behalf without resolving it either way.

   Searched again on 2026-08-24 across the Reve help centre, whose "Download & share your content"
   article (`help.reve.com/hc/en-us/articles/46802994402836`) is the only published guidance on
   saving Output. It says: "Select any image and click the download button to save it to your
   device, then share it anywhere you'd like." That settles **what may be done with a downloaded
   file** — the documented path endorses saving and onward sharing, which is what this pack does.
   It says nothing about **who or what may press the button**, which is the half §1.3(b) turns on.
   The published text does not resolve it; the question stays open rather than being closed by an
   absence of prohibition.

Item 1 is closed; item 2 remains an open fact, not a finding. The heading carries no count, so
closing the rest will not date it again.

### Owner's determination

On 2026-08-24 the project owner determined that copyright in the Output belongs to them, that
commercial use is licensed, and that the Output may be redistributed, and stated that they will not
put it to commercial use. Recorded as the owner's decision; the quotations above are the material
it was taken on.

On 2026-08-24, after reading the Free-plan finding above, the owner decided to continue generating
the remaining packs on the Free account, knowing that Terms §2.3 grants Reve and other users a
perpetual licence over the Output and that the training opt-out is unavailable on this tier. The
decision covers every pack in this series, not this one alone.
