# Real Water

Real Water is an ESM-only TypeScript Module for a reusable native Three.js Open
Water Domain. The repository is currently at the workspace and startup
foundation stage.

Issues #12 and #13 deliver the startup and capability foundation:

- an accessible Loading Experience appears before preparation begins;
- a versioned mock Prewarm Manifest declares all work;
- Memory and Three Host Adapters report completed work without fabricated
  timing;
- the default Reference Experience initializes a Host-owned Three r185 renderer
  and accepts only Core WebGPU with the required limits;
- WebGL fallback, Compatibility Mode, missing limits, device loss, failure,
  cancellation, and disposal paths stay behind the Loading Experience with
  structured diagnostics;
- a placeholder appears only after a capability-checked ready lease resolves.

This milestone verifies renderer capabilities but does not render water or claim
Native Quality or production water behavior.

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
