# Real Water

Real Water is an ESM-only TypeScript Module for a reusable native Three.js Open
Water Domain. The repository now includes a complete, fail-closed water prewarm,
reveal, structural reprepare, and bounded recovery path.

Issue #15 extends the minimal water plane and startup foundation:

- an accessible Loading Experience appears before preparation begins;
- the canonical minimal-water Prewarm Manifest declares exactly eight work
  units: a texture, render target, plane geometry, TSL NodeMaterial,
  RenderPipeline route, eight hidden stabilization frames, completion readback,
  and main-camera guard frame;
- the Three r185 Host Adapter borrows the Host renderer, scene, and main camera,
  restores their state after preparation, and never disposes them;
- progress advances monotonically only when declared manifest work completes;
- the prepared route and guard frame receive GPU completion readbacks before the
  ready lease resolves;
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

This milestone renders a deliberately minimal water surface. It does not yet
claim Native Quality or production water behavior.

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
