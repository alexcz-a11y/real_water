# Real Water

Real Water is an ESM-only TypeScript Module for a reusable native Three.js Open
Water Domain. The repository now includes a four-band, camera-relative Open
Water Domain with versioned Calm, Swell, and Storm Water Presets, built on the
complete prewarm, reveal, reprepare, and recovery path.

Issue #19 keeps the four-band Open Water Domain stable across distance and host
floating-origin shifts:

- Host Simulation state includes `originX` and `originZ`; Gameplay Queries
  remain continuous after an origin rebase and reset only invalid temporal
  history;
- non-periodic spectral blending prevents obvious repeating patches;
- near geometry, middle normal detail, and far slope or BRDF detail transition
  without a visible seam;
- distant highlights and white-detail placeholders stay stable under camera
  motion;
- the test-only QA Harness exposes `setOrigin` and origin-tagged receipts.

Issue #18 extended the coherent spectral runtime and deterministic QA
foundation:

- an accessible Loading Experience appears before preparation begins;
- the canonical minimal-water Prewarm Manifest declares exactly twelve work
  units: a texture, render target, camera-relative clipmap, four spectral bands,
  TSL NodeMaterial, RenderPipeline route, eight hidden stabilization frames,
  completion readback, and main-camera guard frame;
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
- the ready Runtime Interface applies complete hot Artistic Controls, including
  versioned Calm, Swell, and Storm Water Presets, and revisions them only when
  the snapshot changes;
- synchronous Gameplay Queries fill caller-owned height, normal, velocity, foam,
  tick, control-revision, and snapshot-age buffers with no GPU readback;
- query capacity is fixed at 2,048 points per simulation tick and fails with a
  structured error before output mutation when exceeded;
- test builds prewarm a private, versioned QA presentation route before reveal;
  production builds contain neither that route nor the QA Harness global;
- the QA route resets a fixed seed, advances explicit 60 Hz ticks, applies a
  fixed camera, presents once, and addresses final color, linear depth, and
  view-space normal captures by name;
- seed, tick, time, origin, and Artistic Control revision feed the prepared
  surface; Playwright verifies repeatability, ocean-scale horizon coverage,
  non-periodic blending, distance LOD, distant-detail stability, origin-shift
  continuity, and bounds fixed-point render/query height disagreement without
  wall-clock sleeps or animation-frame polling;
- the Reference Experience keeps the canvas hidden through preparation and
  reveals it on the next refresh after readiness;
- immutable `minimal` and `minimal-high-detail` Quality Profiles derive distinct
  manifest hashes and geometry structures;
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
origin shifts. It does not yet claim Native Quality or production water
behavior.

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
