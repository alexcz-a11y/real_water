# real-water

This alpha package exposes versioned minimal-water Quality Profiles, their
canonical twelve-unit Prewarm Manifests, versioned Calm, Swell, and Storm Water
Presets, the Startup and ready Runtime Interfaces, normalized Core WebGPU and
Gameplay Query capabilities, structured errors, and Memory and Three r185 Host
Adapters.

The Three Adapter borrows the Host renderer, scene, and main camera to prepare a
TSL NodeMaterial, four coherent spectral wave bands, a camera-relative clipmap,
and RenderPipeline. Before readiness it renders eight hidden stabilization
frames, performs completion readbacks for the prepared route and main-camera
guard frame, and reports progress only as manifest work completes. The Reference
Experience reveals the prepared canvas on the next refresh.

`minimal` and `minimal-high-detail` are immutable structural Quality Profiles.
Changing between them produces a different manifest hash and requires a full new
preparation. A ready lease accepts only effect variants declared by its
manifest; undeclared requests fail with `EFFECT_NOT_PREWARMED` before the
runtime revision changes.

Ready leases expose one-shot runtime invalidation. A Host Integration calls
`invalidateForLongSuspension()` when its own lifecycle classifies a suspension
as long, while the Three Adapter observes device loss for the lease lifetime and
preserves the Host callback. Core does not choose a rebuild policy: Host
Integrations dispose, recreate their own Host objects when needed, and prepare
again. The Reference Experience performs one bounded automatic device rebuild
and repeats preparation after a confirmed long suspension.

Every Host explicitly supplies a Host Simulation Adapter as the authoritative
source of seed, tick, simulation time, and pause state. The same state drives
the prepared TSL vertex displacement and the CPU spectral evaluator. Calm,
Swell, and Storm Water Presets are versioned Artistic Control snapshots;
applying one updates existing uniforms without replacing geometry, nodes,
materials, or pipelines.

`queryGameplay(...)` is synchronous and performs no GPU readback. It writes up
to 2,048 points per simulation tick into caller-owned typed arrays for height,
normal, three-dimensional surface velocity, a zero foam placeholder, tick,
Artistic Control revision, and zero-tick local snapshot age. Capacity and input
failures are detected before output buffers are changed.

Disposal releases the clipmap and other Real Water-owned resources without
disposing Host-owned objects. This four-band Open Water Domain makes no Native
Quality claim.
