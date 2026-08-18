# real-water

This alpha package exposes versioned minimal-water Quality Profiles, their
canonical eight-unit Prewarm Manifests, the Startup Interface, normalized Core
WebGPU capabilities, structured startup/runtime errors, and Memory and Three
r185 Host Adapters.

The Three Adapter borrows the Host renderer, scene, and main camera to prepare a
TSL NodeMaterial and RenderPipeline. Before readiness it renders eight hidden
stabilization frames, performs completion readbacks for the prepared route and
main-camera guard frame, and reports progress only as manifest work completes.
The Reference Experience reveals the prepared canvas on the next refresh.

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

Disposal releases the plane and other Real Water-owned resources without
disposing Host-owned objects. This minimal surface makes no Native Quality
claim.
