# Real Water

**A native Three.js WebGPU open-water runtime.** A four-band spectral ocean that
stays coherent across distance and floating-origin shifts, a bounded local
interaction field for wakes and impacts, and synchronous gameplay queries that
agree with what is drawn — with no GPU readback on the query path.

[![CI](https://github.com/alexcz-a11y/real_water/actions/workflows/ci.yml/badge.svg)](https://github.com/alexcz-a11y/real_water/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Three.js r185](https://img.shields.io/badge/three.js-r185-black.svg)](https://threejs.org)
[![TypeScript ESM](https://img.shields.io/badge/TypeScript-ESM--only-3178c6.svg)](https://www.typescriptlang.org)

> **Status: `0.1.0-alpha.1`, pre-release.** The runtime is real and verified by
> a ten-step gate on every push. Public `0.1.0` is deliberately blocked behind
> the release gates in
> [ADR 0025](docs/adr/0025-stage-delivery-and-gate-the-first-public-release.md);
> see [Project status](#project-status) for what is claimed and what is not.

## Why this exists

Most real-time water is either a shader you cannot query or a simulation you
cannot art-direct. Real Water takes a third position, recorded as
[ADR 0001](docs/adr/0001-aesthetics-and-gameplay-govern-simulation.md):

> **Aesthetic Authority** — visual composition and gameplay feel decide whether
> water behavior is accepted. Physical models are supporting tools, not goals.

That single decision explains most of the architecture. The surface a frame
draws and the surface gameplay reads are _the same_ Prepared Surface, so a boat
floats on the wave you can see. Artistic Controls are declared to be perceptual
rather than physical, so an artist may override the simulation without anyone
having to defend it as "wrong." And because nothing is allowed to appear that
was not prepared, the first visible frame is complete rather than progressively
correct.

## What it does

**Spectral open water, stable at ocean scale.** Four coherent wave bands on a
camera-relative clipmap, non-periodic blending so no repeating patch is visible,
and continuity across host floating-origin rebases — including large cumulative
origins.

**Gameplay coupling in both directions.** One immutable Interaction Shape —
sphere, box, capsule, convex hull, or flat compound — samples the water and
receives its load _before_ host fixed integration. Buoyancy, drag, slamming
response, and stabilizing torque come out; wakes and propeller wash go back in.
The host stays authoritative for 60 Hz integration throughout.

**Queries that agree with the picture.** `queryWater(...)` fills caller-owned
height, normal, velocity, and foam buffers synchronously — 2,048 points per
tick, no GPU readback, snapshot age of zero or one tick. The same analytic
correction drives TSL vertex height, fragment normal, and the CPU query, so
render and query cannot silently disagree.

**Bounded local interaction.** A 48-metre anchor-local field with an 8-metre
Hermite fade back into the spectral surface. 128 preallocated disturbance slots,
never reallocated; overflow returns a deterministic receipt instead of growing.

**An art-directed Hero Breaker.** An asymmetric crest-and-hollow profile with a
forward curl for the focal silhouette, a dedicated foam channel, and a
fixed-tick lifetime — without a general fluid solve.

**A complete Storm Front route.** Rain ripples, aerosol, cloud shadow, horizon
haze, and bounded lightning transients, all sharing one 131,072-slot secondary
particle pool with the Hero spray and the three underwater consumers, resolved
in a single global allocation transaction.

**Optics.** Fresnel, host environment reflection, depth-aware refraction,
absorption, scattering, crest transmission, total internal reflection from
below, planar reflection, stock r185 current-frame SSR with dedicated specular
TemporalReproject history, a per-ray depth-aware underwater volume, bounded
caustics on visible receivers, and finite post-TRAA lens wetness.

Every stage is inspectable. After conversion, forty-five named diagnostics
output routes expose the intermediates — Fresnel, metric refraction thickness,
scattering, crest transmission, packed underwater transmittance, light-shaft and
shadow factors, and independent caustics — as CPU readbacks of the same bound
frame the host presented.

## Two ideas worth stealing

Even if you never use this package, two of its mechanisms generalise.

### The Prewarm Manifest, and the lease it issues

A Quality Profile does not describe _what to render_; it declares **every**
effect state, resource, and conditional path that must exist before a runtime
may become ready — currently **140 named work units**. Preparation walks that
declaration, executes each path once (including hidden paths the camera does not
currently see), takes GPU completion readbacks, and only then resolves a **ready
lease**.

Two consequences fall out for free:

- Requesting an effect variant that was never declared fails with
  `EFFECT_NOT_PREWARMED` **before** any ready-runtime state changes — a shader
  compile can no longer surprise you mid-scene.
- Progress is monotonic and truthful, because it advances only when declared
  work actually completes. There is no fake progress bar.

The lease is also the invalidation channel: long suspension and device loss
invalidate it through the public interface, so a host integration runs the same
policy the Reference Experience does.

### Gates that cannot be satisfied by editing the gate

The CI failure message for the profile-hash check does not say "hashes differ."
It says the mismatch **cannot distinguish** between a value that should have
been re-minted and was not, and a value legitimately re-minted whose committed
anchor was not re-baked — then instructs you to determine which case applies and
explicitly forbids updating the anchor to make CI pass.

That framing runs throughout. Reconstruction reports are required to have
**three** columns — passed, not passed, and not-applicable-with-a-citation —
because with only two, a real defect ships looking like a scoping decision.

## Architecture at a glance

```
Host application  (owns renderer, scene, camera, RAF, physics integration)
   │
   ├── Host Simulation Adapter     seed · tick · time · pause · sea level · origin
   ├── Host Environment Adapter    radiance (SHA-256 fingerprinted) · finite sun
   ├── Host Presentation Adapter   camera-cut revision · bind(route)
   └── Host Body Adapter           interaction shapes · sockets · water load
   │
Real Water runtime  ── Startup Interface ──▶ Readiness Gate ──▶ ready lease
   │                                            ▲
   │                                   Prewarm Manifest (140 units)
   │
   ├── Prepared Surface       spectral ocean + local interaction field
   ├── Presentation route     SSR → underwater volume → TRAA → post-TRAA stages
   └── Gameplay Query         synchronous, caller-owned buffers, no readback
```

Real Water never owns the render loop, never touches `scene.environment`, never
guesses sky or weather, and never disposes anything it borrowed. Environment
radiance arrives through the adapter with a SHA-256 fingerprint of its canonical
8×4 RGBA bytes as the host's verification credential.

## Install

```bash
npm install real-water three
```

**Requires WebGPU.** Three.js r185, Node 24.19.0 and pnpm 11.22.0 for
development. ESM only — no CommonJS build is planned
([ADR 0017](docs/adr/0017-use-a-minimal-pinned-typescript-esm-workspace.md)).

## Usage sketch

```ts
import {
  createMinimalWaterPrewarmManifest,
  createThreeHostLifecycleAdapter,
  prepareRealWater,
} from "real-water";

const run = prepareRealWater({
  manifest: createMinimalWaterPrewarmManifest(),
  host: createThreeHostLifecycleAdapter({
    renderer,
    scene,
    camera,
    environment, // HostEnvironmentAdapter — radiance + finite sun
    presentation, // HostPresentationAdapter — camera-cut revision, bind(route)
    simulation, // HostSimulationAdapter — seed, tick, pause, sea level, origin
  }),
  loading: {
    present(snapshot) {
      if (snapshot.status === "preparing") {
        const { completedWork, totalWork } = snapshot.progress;
        showLoading(completedWork / totalWork);
      }
    },
  },
});

const lease = await run.ready; // resolves only after the full Readiness Gate
lease.updateArtisticControls(calmSunrise);

// synchronous, no GPU readback, caller-owned buffers
lease.queryGameplay({
  count,
  positions, // Float32Array
  results, // { heights, normals, velocities, foam, ticks, snapshotAges, ... }
});
```

The authoritative surface is the API Extractor report at
`packages/real-water/etc/`; see
[`packages/real-water/README.md`](packages/real-water/README.md) for the
complete exported set.

## Repository layout

| Path                         | What it is                                                       |
| ---------------------------- | ---------------------------------------------------------------- |
| `packages/real-water/`       | The public package — 62 source files, ~37k lines                 |
| `apps/reference-experience/` | Private demonstration app; where every quality claim is measured |
| `docs/adr/`                  | 28 architecture decision records                                 |
| `CONTEXT.md`                 | The domain glossary — every term, with what _not_ to call it     |
| `docs/reference-bible.md`    | Visual identity contract for demonstration assets                |
| `docs/agents/`               | Working agreements for AI agents contributing to this repo       |

## Verifying

```bash
pnpm install --frozen-lockfile
pnpm verify        # the complete local gate
```

`verify` runs lint, format, typecheck, committed-hash checks, production build,
Vitest (**77 test files**), packed-package smoke, both API Extractor reports,
the license inventory, and Core boundary checks. Browser acceptance is separate:

```bash
pnpm test:browser  # 23 Playwright specs; needs a WebGPU-capable machine
```

Playwright runs single-worker by design — one WebGPU device per machine, and
parallel workers perturb each other's timing.

## Project status

**What is verified.** The four-band domain, the complete basic optical path, the
prewarm/reveal/reprepare/recovery lifecycle, gameplay coupling through the proxy
vessel, bounded local interaction, merged whitewater sources, the Hero Breaker,
the Storm Front route, Artist and Engineering control presenters, and Director /
Sandbox / deterministic QA modes. CI is green on every push.

**What is not claimed yet.** Native visual certification, five-run M5
performance certification, Safari regression, and public `0.1.0` — all gated by
[ADR 0025](docs/adr/0025-stage-delivery-and-gate-the-first-public-release.md).
Underwater particle output has GPU evidence still pending. The first Reference
Experience targets desktop keyboard and mouse only; mobile, touch, controller,
XR, split-screen, and audio are outside the release claim.

**Open defects are tracked as issues, not hidden.** Several are instrumentation
defects — a silhouette masker that is blind to bright object regions against a
bright backdrop, a gate whose evidence file is not the file it validates — and
are recorded as _undetermined_ rather than pass or fail, because a broken
instrument gives neither result.

Integration work is on the `pr/spec-11` branch tracked by
[PR #44](https://github.com/alexcz-a11y/real_water/pull/44).

## How this was built

Real Water is developed by a human author directing multiple AI coding agents in
parallel — one ticket per agent, each in its own git worktree, merged through a
dedicated merge session that re-verifies rather than trusting the report it was
handed.

That arrangement produced the repository's most unusual artifact: `docs/agents/`
and the reconstruction reports record **methodology defects** alongside code
defects. A guard that checks a summary statistic instead of the structure it
guards. A test that returns zero and is believed without ever being shown to
return non-zero on a known positive. A reading whose range is smaller than the
state space it must distinguish — `ahead=0` means merged, or branch swapped, or
no upstream at all, and they are not the same thing.

Those findings are in the repository because they were expensive to learn and
they transfer.

## Contributing

Issues and specs live in GitHub Issues; see
[`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md). Start with
[`CONTEXT.md`](CONTEXT.md) — the vocabulary is deliberate, and using the wrong
word for something usually means proposing the wrong change. Architectural
decisions belong in `docs/adr/` before the code that implements them.

## License

[MIT](LICENSE) © Real Water contributors.
