# real-water

This alpha package exposes versioned minimal-water Quality Profiles, their
canonical sixteen-unit Prewarm Manifests, versioned Calm, Swell, and Storm Water
Presets, the Startup and ready Runtime Interfaces, normalized Core WebGPU and
Gameplay Query capabilities, structured errors, and Memory and Three r185 Host
Adapters.

The Three Adapter borrows the Host renderer, scene, main camera, and a Host
Environment Adapter to prepare a TSL NodeMaterial, four coherent spectral wave
bands, a camera-relative clipmap, a basic optical path, and RenderPipeline.
Before readiness it renders eight hidden stabilization frames, performs
completion readbacks for the prepared color route and the main-camera guard
frame, and reports progress only as manifest work completes. QA Frame Prewarm
owns optical-factor capture. The Host must supply a perspective camera. The
Reference Experience reveals the prepared canvas on the next refresh. The Host
retains ownership of environment radiance and finite sun. The prepared radiance
fingerprint is the Host verification credential: the SHA-256 of the canonical
8x4 RGBA8 sRGB pixels. Identity, size, format, type, and color space are
structural and must agree with the borrowed Three texture. Texture bytes,
sampler, and identity stay unchanged and alive through the lease; Core does not
dispose the Host texture or read back its pixels. Scene-behind-water color and
depth are sampled from the Host viewport after opaque geometry. Real Water never
reads `scene.environment` or guesses sky or weather. The water material is an
unlit public NodeMaterial whose color and MRT come from the same optical path.

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
source of seed, tick, simulation time, pause state, and Host-owned floating
origin. Gameplay Query positions are in the current Host frame; the runtime
samples Host-local coordinates plus wrapped origin phase so queries stay
continuous across origin shifts, including large cumulative origins. The
lightweight snapshot exposes a monotonic `originRevision` that starts at 0 from
the verified Host origin at runtime creation and increments only when the Host
origin actually changes. Spectral wave state, seed, tick, time, and Artistic
Controls are retained. The same Host state drives the prepared TSL vertex
displacement and the CPU spectral evaluator. Calm, Swell, and Storm Water
Presets are version 2 Artistic Control snapshots that include the optical
controls; applying one updates existing uniforms without replacing geometry,
nodes, materials, or pipelines. Version 1 presets are rejected instead of being
silently reshaped.

The prepared surface uses non-periodic spectral blending, camera-distance
transitions from near geometry through middle normal detail into far slope and
filtered BRDF response, world-locked distant highlight and filtered optical
glints, and a Host-owned basic optical path: Fresnel, environment reflection,
depth-aware refraction from pre-water color plus opaque and water-surface depth,
absorption, scattering, and crest transmission. Distant detail is filtered so it
remains stable under camera motion. This four-band Open Water Domain still makes
no Native Quality claim.

`queryGameplay(...)` is synchronous and performs no GPU readback. It writes up
to 2,048 points per simulation tick into caller-owned typed arrays for height,
normal, three-dimensional surface velocity, a zero foam placeholder, tick,
Artistic Control revision, and zero-tick local snapshot age. Capacity and input
failures are detected before output buffers are changed.

Disposal releases the clipmap and other Real Water-owned resources without
disposing Host-owned objects.
