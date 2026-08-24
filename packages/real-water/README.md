# real-water

This alpha package exposes versioned minimal-water Quality Profiles, their
canonical one-hundred-forty-unit Prewarm Manifests, versioned Calm, Swell, and
Storm Water Presets, Reference and Storm Front Environment Presets, and
deterministic Showcase Preset v2 recipes that pin Storm segment identities,
camera timeline, and both Hero events, plus a pure JSON import/export and
migration codec. It also exposes the Startup and ready Runtime Interfaces,
normalized Core WebGPU and Gameplay Query capabilities, structured errors, and
Memory and Three r185 Host Adapters.

`importPresetJson(...)` recognizes all four schema discriminators, validates
current data, and migrates only exact historical Water, Environment, Quality,
and Showcase snapshots. Invalid, unknown, unsupported, and future JSON is
returned unchanged as a recovery result. `exportPresetJson(...)` emits validated
current canonical JSON. The package performs no persistence; local record
identity, display names, and browser storage belong to the private Reference
Experience.

The Three Adapter borrows the Host renderer, scene, main camera, and a Host
Environment Adapter to prepare a TSL NodeMaterial, four coherent spectral wave
bands, a camera-relative clipmap, and one logical fixed-tick unified foam field.
Its original RGBA16F spectral attachment preserves separate generation, history,
advection, diffusion, and decay stages; a second anchor-local ping-pong
attachment carries source-resolved wake and impact history without ocean-tile
repetition. The prepared surface also includes a stable three-state waterline,
and a double-sided optical path with water-to-air total internal reflection and
a fixed-size horizontal planar reflection composed over Host environment
fallback, stock r185 non-stochastic current-frame SSR, dedicated specular
TemporalReproject history, stock r185 TRAA, and RenderPipeline. Dedicated SSR
history is prepared before ready and updated per Host present, independent of
TRAA. Before readiness it compiles and hidden-executes the planar single-target
path even when the prepare camera is below the water, then clears any forced
warm so it cannot leak into a ready below-sea-level frame. Ready diagnostics
expose planar-color and planar-target-alpha occupancy from that auxiliary
target; they do not claim a screen-space planar-confidence mask. Whitecap
generation, carried history, advected history, and final decay are packed into
one prepared target and read back as four scalar captures with one GPU transfer.
A separate canonical anchor-local source-identity capture maps the prepared
96-metre Interaction Field and packs spectral whitecap, wake or propeller wash,
impact, and their saturating union into RGBA without camera-jitter ambiguity.
Hero Breaker foam occupies its own third anchor-local history channel before it
joins that union, and a dedicated drawing-buffer-exact scalar capture preserves
its identity without changing the established source-identity RGBA contract.
Current-frame SSR exposes ssr-hit from the stock raw target, ssr-confidence from
the compose-target alpha used by the shader, linear Float32 ssr-color from the
raw RGB, ssr-roughness from view-normal alpha, reflection-base-color from the
scene-pass output RGB, and ssr-composite-color from the compose-target RGB.
Stock roughness blur is current-frame spatial only. Dedicated TemporalReproject
history RGB and inverse accumulated frame-count weight are capturable from the
resolved texture. TRAA and SSR, including SSR history, update on each Host
present. A render-stage-neutral 131,072-slot secondary-particle pool arbitrates
four predeclared consumers before their pre- or post-TRAA render phases; the
spray, droplet, and mist consumer renders through an ordered output-resolution
post-TRAA accumulation/composite stage. Suspended particles, subsurface foam and
bubble clouds, and rising bubbles render through separate soft-depth pre-TRAA
accumulations after the same global allocation. Allocation-time depth visibility
is CPU-known output-frustum coverage, not GPU scene-depth occlusion, so an
opaque-hidden particle can still retain a slot; using a previous-frame occlusion
estimate would add one frame of latency and remains a documented future option
rather than part of this contract. A second ordered post-TRAA stage applies
coherent cloud shadow, horizon haze, storm aerosol, and lightning after shared
rain/spray accumulation. A third stage applies emergence-only lens wetness,
decays it to exact zero within 180 fixed ticks, and preserves at least 78% QA
visibility. Rain adds a bounded current/previous correction to the spectral
surface while near-camera rain and aerosol remain stable partitions of
`spray-droplet-mist`; no second pool or ocean solver is created. Four normalized
Storm captures expose rain ripples, aerosol, cloud shadow, and lightning from
one RGBA16F diagnostics target. The Core main scene render remains one
6-attachment 32-byte MRT pass, plus one auxiliary planar scene render when
facing. Current-frame SSR, history, and compose are fullscreen passes after that
single main scene and before TRAA. Before readiness it also renders a
no-allocation TRAA and SSR-history reset frame, eight full temporal hidden
stabilization frames, performs completion readbacks of every named diagnostics
output route and the main-camera guard frame, then blits the probed final color
through a transform-free presentation pipeline. Progress advances only as
manifest work completes. Optional `real-water/diagnostics` reads CPU DTOs from
the same bound Core frame. The underwater route projects deterministic
prepared-surface caustics only onto non-sky, non-water, upward-facing visible
receivers inside 48 metres and exposes that contribution as its own named scalar
capture. Local-interaction response is sampled from a preallocated current
RGBA16F height/slope/velocity field at the unified-foam resolution, with at most
one fixed tick of snapshot age, so the drawing-buffer pass never scans all
Disturbances per receiver pixel. Independent scalar captures expose caustics,
suspended particles, bubbles, and lens wetness; QA does not own a second scene
or TRAA. The Host must supply a perspective camera. The Reference Experience
reveals the prepared canvas on the next refresh. The Host retains ownership of
environment radiance and supplies one atomic hot lighting, weather, and
atmosphere snapshot each fixed tick. The prepared radiance fingerprint is the
Host verification credential: the SHA-256 of the canonical 8x4 RGBA8 sRGB
pixels. Identity, size, format, type, and color space are structural and must
agree with the borrowed Three texture. Texture bytes, sampler, and identity stay
unchanged and alive through the lease; Core does not dispose the Host texture or
read back its pixels. Scene-behind-water color and depth are sampled from the
Host viewport after opaque geometry. Real Water never reads `scene.environment`
or guesses sky or weather. The water material is an unlit public NodeMaterial
whose color and MRT come from the same optical path.

Each Prewarm Manifest is version 12 and binds an immutable drawing buffer. The
factory hashes that complete work plan synchronously. Memory Host tests may omit
the buffer and receive 320x180; Three Host fails closed if the renderer buffer
does not match. Changing the physical drawing buffer creates a new manifest and
requires a full conceal, dispose, prewarm, and reveal.

`minimal` and `minimal-high-detail` are immutable version-15 structural Quality
Profiles. Both pin the Native temporal policy and the implemented reflection
layer: TRAA at render scale 1 with a drawing-buffer-exact resolution policy and
TAAU, dynamic resolution, frame generation, and MSAA samples off, plus
Host-adapter environment radiance, a drawing-buffer-exact RGBA8 sRGB planar pass
at samples 0, current-frame SSR, and dedicated specular TemporalReproject
history. A ready lease publishes that same TRAA, planar, current-frame SSR, and
SSR history evidence, plus 128- or 256-square spectral and anchor-local
ping-pong foam attachments and their drawing-buffer-exact diagnostics resolves.
The unified field also preallocates a 128-tick foam-state timeline so Artistic
Controls, 60 Hz Body socket poses, and manual source lifetimes replay
identically when presentation is batched at 30 Hz. Amount and persistence remain
hot Artistic Controls; field resolution, layout, format, cadence, timeline
capacity, and routes remain structural. Prepared-surface caustic receiver
bounds, underwater tracer layouts, Storm Front source budgets and atmosphere
stage, lens-wetness stage order, and diagnostics layouts are structural;
presentation coefficients are not. The lease includes RG16F motion and stock
Three revision 185 only after prewarm succeeds. Changing between them produces a
different manifest hash and requires a full new preparation. A ready lease
accepts only effect variants declared by its manifest; undeclared requests fail
with `EFFECT_NOT_PREWARMED` before the runtime revision changes. Playwright
Regression acceptance does not constitute headed Native certification.

Both profiles also pin one 48-metre local interaction field with an 8-metre
Hermite edge fade, one Interaction Anchor, 128 shared preallocated Disturbance
slots, an eight-Hero-Breaker sub-capacity, current/previous snapshot banks, and
a fixed 60 Hz Body coupling policy. The Prewarm Manifest compiles and
hidden-executes radial-impact, directional-wake, art-directed Hero Breaker, Body
socket emission, local-foam reprojection/resolve, and source-identity
descriptors with scratch state, clears that state, and stabilizes the normal
ready route before reveal. At runtime, `updateInteractionAnchor({ x, z })` moves
only that current Host-frame world-space focus (the same coordinate frame used
by Gameplay Queries); `submitDisturbances(...)` accepts caller-owned
radial-impact, directional-wake, or Hero Breaker typed arrays. A Hero batch
authors its direction, radius, deformation amplitude, foam and spray amounts,
one-to-600-tick lifetime, and priority. When capacity is full, the lowest visual
priority is dropped and identified by the receipt without resizing the prepared
buffers or clearing already-generated foam. Radial-impact radii are bounded to
0.0001–48 metres and signed peak amplitudes to -4–4 metres so every accepted
128-source composition remains finite. Registered Body sockets upsert their
directional wake or propeller-wash source in place after each fixed-step query;
they do not require a caller to submit a new Disturbance every tick.

Ready leases expose one-shot runtime invalidation. A Host Integration calls
`invalidateForLongSuspension()` when its own lifecycle classifies a suspension
as long, while the Three Adapter observes device loss for the lease lifetime and
preserves the Host callback. Core does not choose a rebuild policy: Host
Integrations dispose, recreate their own Host objects when needed, and prepare
again. The Reference Experience performs one bounded automatic device rebuild
and repeats preparation after a confirmed long suspension.

Every Host explicitly supplies a Host Simulation Adapter as the authoritative
source of seed, tick, simulation time, pause state, one finite sea level in
metres, and Host-owned floating origin. Gameplay Query positions are in the
current Host frame; the runtime samples Host-local coordinates plus wrapped
origin phase so queries stay continuous across origin shifts, including large
cumulative origins. The lightweight snapshot exposes a monotonic
`originRevision` that starts at 0 from the verified Host origin at runtime
creation and increments only when the Host origin actually changes. Spectral
wave state, seed, tick, time, and Artistic Controls are retained. Every Host
also supplies a Host Presentation Adapter as the authoritative source of
camera-cut revisions and the bind seam for the receipt-only Core presentation
route. `bind(route)` must only accept or store that route; it must not call
`present()` or schedule a frame. Static Hosts publish revision 0 and return a
no-op binding that does not retain or drive the route. The live Core route
begins from the eight-frame prewarmed TRAA and SSR history, and Hosts that drive
frames start their own scheduler after bind. The lightweight snapshot exposes
`cameraCutRevision` from that Adapter and a monotonic `seaStateCutRevision` that
increments only on an explicit `sea-state-cut` Artistic Control update,
including when control values are unchanged. Continuous control updates change
the current sea without advancing that cut revision. Core resets TRAA and
dedicated SSR history on the same present for Host `simulationResetRevision`
changes, seed change or tick/time rewind, camera-cut, origin-shift, and
sea-state-cut. The QA Harness forwards those same domain revisions plus
committed waterline crossings through the bound Core diagnostics route; captured
motion stays the authoritative RG16F AOV. The same Host state drives the
prepared TSL vertex displacement and the CPU spectral evaluator. Calm, Swell,
and Storm Water Presets are version 5 Artistic Control snapshots that include
the optical controls plus whitecap amount and foam persistence, and accept
authored values within the Runtime ranges; applying one updates existing
uniforms without replacing geometry, field textures, nodes, materials, or
pipelines. The preset import seam explicitly migrates the exact known historical
built-ins while the current normalizer remains fail-closed.

The prepared surface uses non-periodic spectral blending, camera-distance
transitions from near geometry through middle normal detail into far slope and
filtered BRDF response, world-locked distant highlight and filtered optical
glints, and a Host-owned basic optical path: Fresnel, environment reflection
with explicit planar composition, depth-aware refraction from pre-water color
plus opaque and water-surface depth, absorption, scattering, and crest
transmission, with a continuous above/crossing/below blend and correct underside
Fresnel/TIR response. Distant detail is filtered so it remains stable under
camera motion. Stock r185 TRAA is on the Core presentation route; TRAA
regression acceptance is work-in-progress. This four-band Open Water Domain
still makes no Native certification claim.

`queryGameplay(...)` is synchronous and performs no GPU readback. It writes up
to 2,048 points per simulation tick into caller-owned typed arrays for height,
normal, three-dimensional surface velocity, deterministic spectral foam plus a
bounded local wake/impact envelope, tick, Artistic Control revision, and
zero-or-one-tick local snapshot age. Spectral state is evaluated on the CPU
while the latest published local correction is composed without waiting for GPU
work. Capacity and input failures are detected before output buffers are
changed.

`attachBody(...)` binds a Host-owned rigid body through the public Body Physics
Adapter seam and an immutable sphere, box, capsule, convex-hull, or flat
compound Interaction Shape. Optional copied-and-frozen Body-local sockets have
stable bow, stern, propeller, wake, and Interaction Anchor roles. The ready
lease prepares 32 Body slots; a thirty-third active attachment fails with the
structured `BODY_CAPACITY_EXCEEDED` error. A production Adapter registers the
opaque `beforeIntegrate()` route with its own 60 Hz physics loop. On each fixed
tick, that route samples the synchronous Gameplay Query state, applies the
resulting aggregate force and stabilizing torque through the Adapter, updates
stable wake sources, and returns query tick, Artistic Control revision, and
zero-or-one-tick snapshot age before the Host integrates its body. Core never
steps or disposes the Host rigid body. The deterministic Memory Body Physics
Adapter exercises the same route and retains previous and current poses for
Host-owned presentation interpolation; reading an interpolated pose never
advances physics. The non-QA Reference Experience instead supplies a Host-owned
controllable proxy-vessel Adapter with a four-child compound shape, twin
propellers, and authored sockets. Its physics runs at 60 Hz while the Host
Presentation controller renders an interpolated pose at 30 FPS.

Disposal releases the clipmap and other Real Water-owned resources without
disposing Host-owned objects.
