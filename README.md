# Real Water

Real Water is an ESM-only TypeScript Module for a reusable native Three.js Open
Water Domain. The repository now includes a four-band, camera-relative Open
Water Domain with a complete basic optical path, versioned Calm, Swell, and
Storm Water Presets, and the prewarm, reveal, reprepare, and recovery path.

Issue #20 shades that domain with a Host-owned basic optical path:

- Fresnel, Host environment reflection, depth-aware refraction, absorption,
  scattering, and crest transmission are visible and art-directable through
  perceptual Artistic Controls;
- environment radiance and finite sun come from a public Host Environment
  Adapter, never from `scene.environment` or guessed sky or weather; the
  radiance fingerprint is the Host verification credential (SHA-256 of the
  canonical 8x4 RGBA bytes); identity, size, format, type, and color space must
  agree with the borrowed Three texture, whose bytes, sampler, and identity stay
  alive through the lease; pre-water scene color and opaque depth are sampled
  from the Host viewport after opaque geometry;
- the test-only QA Harness captures color, depth, normal, and named optical
  intermediates after explicit reset, ticks, camera, and present.

Issue #19 keeps the four-band Open Water Domain stable across distance and host
floating-origin shifts:

- Host Simulation state includes `originX` and `originZ`; Gameplay Queries
  remain continuous after an origin rebase, including large cumulative origins,
  and the lightweight snapshot counts `originRevision` from runtime creation,
  incrementing only when the origin actually changes;
- non-periodic spectral blending prevents obvious repeating patches;
- near geometry, middle normal detail, and far slope or BRDF detail transition
  without a visible seam;
- filtered slope detail and optical glints stay stable under camera motion;
- the test-only QA Harness exposes `setOrigin` and origin-tagged receipts.

Issue #18 extended the coherent spectral runtime and deterministic QA
foundation:

- an accessible Loading Experience appears before preparation begins;
- the canonical minimal-water Prewarm Manifest declares exactly sixty-one work
  units: a texture, Host equirect environment radiance, viewport scene color,
  viewport scene depth, 6-attachment MRT, camera-relative clipmap, four spectral
  bands, double-sided TSL NodeMaterial, waterline/underside optical route,
  stable camera-medium state, shared waterline history reset, deterministic
  lens-wetness handoff, planar reflection target/route, environment fallback,
  planar probe, current-frame SSR raw/blur/composite targets and routes plus
  probe, dedicated TemporalReproject history and resolve targets, beauty input
  target/route, resolved diagnostics copy target/route, previous depth/normal,
  seed/resolve/accumulate/reset/probe routes, reset-velocity target/route, one
  Core main scene render plus one auxiliary planar scene render when facing,
  procedural motion, velocity, independent inverse-linear depth conversion,
  packed view-normal RGB plus water roughness A, optical factors, optical
  diagnostics A/B, Core final-color and current-color targets, stock TRAA
  color+depth history, resolve/jitter route, shared no-allocation TRAA+SSR reset
  route, current-color conversion, twenty-five named diagnostics output routes,
  eight hidden temporal stabilization frames, named-output completion probes,
  and main-camera guard frame. Version 3 binds the physical drawing buffer into
  that work plan; a viewport change creates a new manifest and lease;
- the Three r185 Host Adapter borrows the Host renderer, scene, and main camera,
  restores their state after preparation, and never disposes them;
- progress advances monotonically only when declared manifest work completes;
- the prepared route and guard frame receive GPU completion readbacks before the
  ready lease resolves;
- the prepared TSL material displaces a camera-relative clipmap with four
  deterministic spectral wave bands;
- every Host explicitly supplies a Host Simulation Adapter whose seed, tick,
  time, pause state, and floating origin drive both rendering and the CPU
  evaluator without any wall-clock read;
- every Host also supplies a Host Presentation Adapter whose camera-cut revision
  is visible on the lightweight snapshot and whose `bind(route)` accepts the
  receipt-only Core presentation route without calling or scheduling
  `present()`; explicit sea-state cuts increment `seaStateCutRevision` even when
  Artistic Controls are unchanged; Hosts that drive frames start after bind, and
  Core never owns RAF;
- the ready Runtime Interface applies complete hot Artistic Controls, including
  versioned Calm, Swell, and Storm Water Presets, and revisions them only when
  the snapshot changes;
- synchronous Gameplay Queries fill caller-owned height, normal, velocity, foam,
  tick, control-revision, and snapshot-age buffers with no GPU readback;
- query capacity is fixed at 2,048 points per simulation tick and fails with a
  structured error before output mutation when exceeded;
- production Hosts bind the receipt-only Core presentation route, which owns
  stock r185 current-frame SSR before stock TRAA, the 6-attachment 32-byte scene
  MRT, and optional `real-water/diagnostics` CPU readbacks of that same bound
  frame;
- the test-only QA Harness is an explicit `?qa=1` facade over that Core route:
  it resets a fixed seed by incrementing Host `simulationResetRevision`,
  advances explicit 60 Hz ticks, applies a camera with an explicit continuous or
  camera-cut transition, presents once, and addresses final color, linear depth,
  view-space normal, and named optical intermediate captures including Fresnel,
  metric refraction thickness, scattering, and crest transmission; production
  builds do not install the QA Harness global;
- seed, tick, time, origin, and Artistic Control revision feed the prepared
  surface; Playwright verifies repeatability, ocean-scale horizon coverage,
  non-periodic blending, distance LOD, distant-detail stability, origin-shift
  continuity, and bounds fixed-point render/query height disagreement without
  wall-clock sleeps or animation-frame polling;
- the Reference Experience keeps the canvas hidden through preparation and
  reveals it on the next refresh after readiness;
- immutable version-5 `minimal` and `minimal-high-detail` Quality Profiles pin
  the Native temporal policy (TRAA at render scale 1; TAAU, dynamic resolution,
  frame generation, and MSAA samples off) and the implemented reflection layer
  (Host-adapter environment, drawing-buffer-exact planar, current-frame SSR, and
  dedicated specular TemporalReproject history), and derive distinct manifest
  hashes and geometry structures;
- applying a changed Quality Profile, or resuming after a confirmed long
  suspension, conceals the stage and repeats the complete Readiness Gate;
- ready leases expose long-suspension and device-loss invalidation through the
  public Runtime Interface so Host Integrations can run the same policy;
- undeclared effect variants fail with `EFFECT_NOT_PREWARMED` before ready
  runtime state changes;
- post-ready device loss invalidates the lease while preserving the Host's Three
  callback; the Reference Experience recreates its owned renderer for one
  automatic rebuild and leaves any later loss on the accessible error screen;
- WebGL fallback, Compatibility Mode, missing limits, device loss, failure,
  cancellation, and disposal paths stay behind the Loading Experience with
  structured diagnostics;
- lease disposal is idempotent and releases only Real Water-owned resources.

This milestone keeps the four-band Open Water Domain stable across distance and
origin shifts, shades it with a complete basic optical path, and ships stock
r185 current-frame SSR, dedicated specular TemporalReproject history, plus TRAA
on the Core presentation route after ready. Issue #22 and Native certification
are not complete until the final slice audit. TRAA regression acceptance is
work-in-progress. It does not claim production whitewater or underwater systems.

## Required toolchain

- Node 24.19.0
- pnpm 11.22.0

## Verification

Run these commands from the repository root:

1. pnpm install --frozen-lockfile
2. pnpm lint
3. pnpm format:check
4. pnpm typecheck
5. pnpm build
6. pnpm test
7. pnpm test:package
8. pnpm api:check
9. pnpm check:licenses
10. pnpm check:boundaries

The complete local gate is also available as pnpm run verify.

The public package is under packages/real-water. The private browser
demonstration is under apps/reference-experience.
