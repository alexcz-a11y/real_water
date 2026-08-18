# Native Quality Baseline Research

> **Status: Quality and benchmark definitions confirmed; performance target unverified**  
> Research note only. This document records evidence and a candidate acceptance contract; it does not claim that the implementation has passed the benchmark.

## Outcome

The quality and whole-frame performance claim should apply only to the controlled **Reference Experience** on the sanitized local reference device below. It must not imply that arbitrary **Host Integrations** inherit the same image quality or frame rate.

This is an **unverified target**, not a measured guarantee. The external sources support the rendering and measurement methods; none can prove that Real Water will meet them on this device. Only a completed demo passing the frozen benchmark can promote the target to a quality claim.

For this note, **Native** means exactly:

- output and main scene render: `2560 × 1440` physical pixels;
- `renderScale = 1.0`;
- TAAU disabled;
- dynamic resolution and frame generation disabled;
- every in-scope Native Full subsystem enabled, with conditional effects exercised by the benchmark route.

The following interpretation is confirmed:

1. **Auxiliary-pass resolution.** Native does not require planar reflection, SSR, foam history, caustics, volumetrics, or every helper buffer to be `2560 × 1440`. Each pass reports a fixed documented size chosen by final-image quality gates; runtime dynamic resolution remains disabled.
2. **Native-resolution TRAA.** Native uses Three.js TRAA at output resolution. TAAU and MSAA remain disabled [R11][R12].
3. **Presentation and color.** The user-facing Native mode targets evenly paced 30 FPS in SDR sRGB; an uncapped run measures headroom. Chrome 151 is the certification browser and Safari 27 is measured separately.

“All effects on” therefore means that every enabled algorithm is active and every conditional algorithm is deterministically triggered somewhere in the route. It does not require mutually exclusive camera states—above water and underwater, for example—to run in the same frame.

## Sanitized local reference-device profile

Captured on 2026-08-18 using read-only local system reporting. This is sufficient to name the performance target without storing a device identity.

| Field | Reference value |
| --- | --- |
| Device class | MacBook Pro notebook |
| SoC | Apple M5 |
| CPU | 10 cores: 4 performance + 6 efficiency |
| GPU | Integrated Apple GPU, 10 cores; Metal supported |
| Memory | 16 GB |
| Operating system | macOS 27.0 |
| Browser | Google Chrome 151.0.7922.138 |
| Power state for capture | AC connected; Low Power Mode off |
| Certification display mode | Confirmed fixed 60 Hz; normal adaptive/ProMotion mode rerun separately |

Intentionally omitted: model identifier and part number, hostname, username, serial numbers, UUID/UDID, firmware identifiers, battery serial, and account data. The benchmark manifest should retain only the fields above plus non-identifying software versions needed to reproduce a run.

## 1% low is not frame pacing

The user's intuition is directionally correct: evenly paced 30 FPS can look smoother than a frame rate oscillating between 30 and 50 FPS. The correction is that **1% low does not measure that regularity**.

NVIDIA FrameView distinguishes “1% Low FPS,” an average over the slowest one percent of frames, from “1% FPS percentile,” the boundary separating the slowest one percent from the rest [P1]. PresentMon has also had to clarify percentile direction and whether the percentile is applied to FPS or frame time [P2]. The project must therefore name its tool, version, population, and formula instead of writing only “1% low.”

Let the benchmark contain `N` displayed-frame intervals `Δᵢ` in milliseconds, ordered in time. Sort a copy from slowest to fastest so that `d₁ ≥ d₂ ≥ … ≥ dₙ`, and let `k = ceil(0.01N)`.

```text
tailMean1LowFrameTimeMs = (1 / k) × Σ[j=1..k] dⱼ
tailMean1LowFPS         = 1000 / tailMean1LowFrameTimeMs

p99DisplayedFrameTimeMs = 99th percentile of { Δᵢ }
```

This is the confirmed normative definition for Real Water. It follows FrameView's slow-tail-mean concept but calculates from displayed-frame intervals so the population is explicit.

Sorting destroys temporal order. Two runs can have identical averages, 1% lows, and p99 values while one scatters slow frames and the other clusters them into visible stutters. **Frame pacing** instead concerns synchronization between the render loop, the operating-system compositor, display refresh, and the sequence in which frames are actually presented. Google's frame-pacing documentation shows that a nominal 30 FPS stream can still produce irregular `49 / 16 / 33 ms` presentation intervals; ideal 30 FPS on 60 Hz presents a new image every two refreshes [P3]. Apple's hitch model likewise separates intentional 30 FPS operation from frames that miss their expected presentation time [P4].

For a 30 FPS floor, define the target cadence `c = 1000 / 30 = 33.333… ms` and keep the original ordered interval series:

```text
cadenceMissᵢ       = 1 when Δᵢ > c + ε, otherwise 0
longestMissRun     = longest consecutive run of cadenceMissᵢ = 1
worst1sMissCount   = maximum Σ cadenceMissᵢ in any rolling one-second window
```

The confirmed trace tolerance is `ε = 0.667 ms`. These sequence metrics, dropped/partially presented frames, and platform hitch evidence express “does not frequently jump.” The 1% low retains its separate numerical floor.

## Confirmed target acceptance contract

All thresholds in this table are project proposals unless the evidence column says otherwise. Apple notes that a 30 FPS game has roughly a 33 ms frame budget [P5]; the tighter 28 ms CPU/GPU tails below reserve integration and compositor headroom rather than claiming an industry standard.

| Metric | Confirmed pass condition | Purpose |
| --- | --: | --- |
| Average displayed FPS | `≥ 30` | Sustained throughput |
| `tailMean1LowFPS` using the formula above | `≥ 30` | Slow-tail throughput |
| p99 displayed-frame interval | `≤ 34.0 ms` | 30 FPS presentation cadence with trace tolerance |
| p99.9 displayed-frame interval | `≤ 50 ms` | Extreme tail guardrail |
| p99 total GPU frame time | `≤ 28 ms` | GPU headroom |
| p99 CPU frame-production time | `≤ 28 ms` | Main-thread/worker headroom |
| Apple-style hitch ratio, where available | `< 5 ms/s` | Apple identifies below 5 ms/s as good; 5–10 becomes perceptible [P4] |
| Dropped + partially presented active frames | `≤ 0.1%` | Displayed-result integrity |
| Consecutive dropped frames | none | Reject clustered stutter |
| Runtime stalls | no interval `> 100 ms` after warmup | Reject visible freezes |
| Worst rolling one-second window | at most one cadence miss | Reject local instability hidden by global percentiles |
| Five-run `tailMean1LowFPS` spread | `≤ 3%` relative | Detect thermal/background instability |

The `0.1%`, `100 ms`, one-miss window, 28 ms, and 3% repeatability gates are Real Water engineering proposals, not values standardized by NVIDIA, Apple, Google, Chrome, or WebGPU.

## Confirmed benchmark methodology

### Controlled conditions

1. Pin exact Three.js, Chrome, and macOS versions in the result manifest; record the sanitized hardware profile above.
2. Run on AC power with Low Power Mode disabled. Close unrelated foreground applications, extensions, extra tabs, and visible DevTools UI.
3. Verify the actual drawing buffer and main scene pass are `2560 × 1440`; CSS size is not evidence.
4. Load the Native Full preset: `renderScale = 1.0`, TAAU off, dynamic resolution off, frame generation off. Record every auxiliary target's dimensions and format.
5. Use a fixed ocean seed, fixed weather timeline, fixed input/ship path, fixed camera path, and fixed interaction-source schedule.
6. Compile and allocate all pipelines/resources before measurement, then warm for 60 seconds. Cold startup and first activation of each conditional effect are separate hitch tests.
7. Run a deterministic ten-minute route five times. All five runs must pass; report every run rather than selecting the best or median run.
8. Use fixed 60 Hz as the certification mode so 30 FPS maps to two refreshes. Rerun once under the normal adaptive/ProMotion display mode as a user-experience check; do not merge its samples with the certification population.

### Route coverage

| Segment | Required stress |
| --- | --- |
| Open-sea establishing pass | Four spectral bands, horizon, sun glitter, environment/planar/SSR reflection blend, refraction, fine distant wave detail |
| High-speed hero vessel | Gameplay Coupling, bow/stern/Kelvin wake, propeller wash, local interaction field, floating objects and queries |
| Storm | Dense whitecaps, persistent foam, Hero Breaker, GPU spray/mist, rain, cloud shadow, lightning response |
| Waterline crossing and underwater | Stable waterline, underside/TIR, absorption/scattering, volumetrics, caustics, particles/bubbles, lens wetness transition |
| Fast lateral camera and impacts | Motion-vector stress, SSR disocclusion, fine foam/glints, projectile/explosion rings and crown splash, distant island reflection/fog |

### Three evidence layers

1. **Presented-result layer — acceptance authority.** Capture a Chrome performance trace and use the Frames track's normal, partially presented, and dropped-frame classifications [P6]. Derive displayed intervals and ordered cadence metrics from presentation events, not from an on-screen FPS counter.
2. **GPU-work layer — attribution.** When `timestamp-query` is available, bracket every render/compute subsystem and asynchronously read a ring of query buffers. The WebGPU feature is optional, and the specification defines timestamp queries and queue-completion behavior [P8]. Do not await `queue.onSubmittedWorkDone()` every frame because that waits for preceding queue work and changes pipeline behavior. A/B-test the profiler itself over the full route: Three r185 has an open report of timestamp-query-related memory growth during sustained use [R14], so telemetry must not be assumed observer-free.
3. **Application layer — diagnostic only.** Record `requestAnimationFrame` intervals, CPU update time, long tasks/GC, active particle counts, and resource state. Chrome's own smoothness guidance warns that rAF polling alone can misrepresent what reached the display, particularly with variable refresh and compositor behavior [P7].

Preserve raw traces and per-pass timings. A summary without the interval series cannot prove frame pacing.

## Native Full effect catalog

There is no universal, authoritative “all AAA water effects” list. The tables below are the confirmed exhaustive manifest for this project's first Reference Experience; future claims must cite a version of this manifest rather than the marketing phrase “all effects.”

### Legend

- **E — Enabled:** always active in the relevant benchmark view.
- **C — Conditional:** part of Native Full and must be triggered by the route, but only when its input/state exists.
- **X — Excluded:** deliberately outside the first Reference Experience or contrary to its visual contract.
- **O — Open:** not yet decided; used only where this research note is required to preserve an open decision.
- `†` means the effect is in scope but its auxiliary-buffer resolution is still open.
- **Relative cost** is a pre-profile engineering estimate: `L` local shader/existing-buffer work; `M` one local field or limited pass; `H` one or more full-screen/large compute passes; `VH` an extra scene render, large particle workload, or multilayer volumetric integration. It is not measured evidence.
- **Temporal sensitivity** predicts susceptibility to shimmer, ghosting, disocclusion, history rejection, or incorrect motion vectors under any temporal subsystem. `Extreme` is the highest risk.

The ocean-scale techniques are grounded in primary rendering research on continuous geometry/normal/BRDF scales, spectral displacement, non-periodic tiling, flow, LEAN filtering, and distance LOD [R1][R2]. Sparse baked Hero Breakers follow Guerrilla's published production method rather than a general real-time multiphase solver [R3].

### A. Ocean geometry and waves

| Effect | Status | Cost | Temporal sensitivity | Evidence / scope note |
| --- | --- | --: | --- | --- |
| Camera-relative projected grid / clipmap | E | M | Medium | [R1][R2] |
| Four-band/cascade spectral ocean | E | H | High | [R1] |
| Horizontal choppiness and art-directed crest sharpening | E | L | High | [R1] |
| Non-periodic tile rotation/blending | E | M | Medium | [R1] |
| Directional flow-map deformation | E | M | Medium | [R1] |
| Gravity-to-capillary continuous wave scales | E | M | High | [R2] |
| Near geometry displacement → mid normal → subpixel slope/BRDF transition | E | M | High | [R2] |
| LEAN/slope-statistics normal filtering for distant highlights | E | M | High | [R1][R2] |
| Unified height, gradient, normal, and surface-velocity outputs | E | M | High | Required for rendering/queries coherence |
| Previous/current procedural vertex positions and motion vectors | E | M | Extreme | [R12][R13] |
| Floating-origin / host origin-shift support | C | L | Medium | Triggered when the host/demo shifts origin |
| Earth-curvature / very-long-horizon deformation | C | L | Low | Triggered only at the configured world scale |
| Calm, swell, and storm art presets with smooth transitions | E | L | Medium | Aesthetic Authority control |
| Local baked Hero Breaker deformation instances | C | H | Extreme | [R3] |
| General real-time 3D overturning/multiphase ocean solver | X | — | — | Explicitly outside Gameplay Coupling |

### B. Surface shading, reflection, and refraction

Epic's Single Layer Water documentation directly identifies scattering, absorption, reflection, refraction, shadowing, and composition from lit scene color/depth as production water inputs [R4]. Three r185 provides narrower primary examples for planar reflection/Fresnel [R5], reflection/refraction/flow [R6], and SSR inputs/history [R7]; those examples are evidence of primitives, not a complete AAA solution.

| Effect | Status | Cost | Temporal sensitivity | Evidence / scope note |
| --- | --- | --: | --- | --- |
| Dielectric microfacet water BRDF | E | L | Medium | [R2][R4] |
| Fresnel reflection/transmission and grazing-angle response | E | L | High | [R4][R5] |
| Finite sun disc and sun glitter/glints | E | M | Extreme | [R1][R2] |
| Sky/environment radiance reflection | E | M | Medium | [R4] |
| Planar scene reflection | E† | VH | High | [R5]; resolution open |
| Near-field screen-space reflection | E† | H | Extreme | [R7]; resolution/step budget open |
| SSR edge/miss fallback to planar/environment | E | L | High | [R4][R7] |
| Depth-aware screen-space refraction | E† | M–H | Extreme | [R4][R6] |
| Wavelength-dependent Beer–Lambert absorption | E | L | Low | [R4] |
| Single scattering and phase response | E† | M | Medium | [R4] |
| Thin-crest transmission / subsurface appearance | E | M | High | [R3][R4] |
| Surface receipt of vessel/cloud shadows | E | M | Medium | [R4][R8] |
| Foam overrides for reflection, transmission, roughness, and micro-normal | E | L | High | [R3][R8] |
| Subpixel filtering for reflection/refraction slopes | E | M | Extreme | [R1][R2] |
| Decorative chromatic dispersion/rainbow water edges | X | — | — | Not part of perceptually credible open water |

### C. Waterline and underwater rendering

Wargaming's original production presentation separates surface, underwater lighting, subsurface/foam, bubbles, and shadow terms, and discusses lower-resolution evaluation for slowly varying effects [R8]. Auxiliary scales below remain open for this project.

| Effect | Status | Cost | Temporal sensitivity | Evidence / scope note |
| --- | --- | --: | --- | --- |
| Camera above/below classification and stable waterline | C† | M | Extreme | Triggered at crossing |
| Underside shading, Fresnel, and total internal reflection | C | M | High | Underwater [R4][R8] |
| Underwater distance absorption/fog | C† | M | Medium | Underwater [R8] |
| Underwater volumetric scattering/turbidity | C† | H | High | Underwater [R8] |
| Sun shafts / god rays | C† | H | Extreme | Requires visible sun/volume [R8] |
| Dynamic surface caustics on bounded receivers | C† | H | Extreme | Requires sun and receiver depth [R8] |
| Underwater volumetric shadowing | C† | H | High | Underwater [R8] |
| Depth-dependent seabed/object coloration | C | M | Medium | Underwater [R4][R8] |
| Suspended particles / plankton motes | C | M | High | Underwater [R8] |
| Subsurface foam / bubble cloud layer | C† | M | High | Foam present [R8] |
| Independent rising bubble particles | C | M | High | Local emitters [R8] |
| Camera water film/droplets after waterline crossing | C† | M | Extreme | Art-directable and disableable |
| Underwater exposure adaptation and color grade | C | L | Medium | Reference Experience integration |

### D. Whitewater, breaking waves, spray, and mist

The Native Full route adopts the “2+” production stack evidenced by Wargaming's surface foam, low-resolution subsurface bubbles, microdetail, and GPU spray [R8], plus Guerrilla's art-directed baked breaker deformation and foam attributes [R3].

| Effect | Status | Cost | Temporal sensitivity | Evidence / scope note |
| --- | --- | --: | --- | --- |
| Whitecap generation from steepness/Jacobian/curvature and wind bias | E | M | Extreme | [R1][R8] |
| Persistent foam history: generation/advection/diffusion/decay | E† | H | Extreme | [R8] |
| Unified foam composition: whitecaps, wakes, impacts, Hero Breakers | E | M | High | [R3][R8] |
| Macro foam breakup pattern | E | L | High | [R8] |
| Foam micro-normal, roughness, and thickness response | E | M | Extreme | [R8] |
| Subsurface foam/bubble layer | E† | M | High | [R8] |
| Hero Breaker-specific foam/deformation age | C | M | Extreme | [R3] |
| GPU crest/impact spray and water droplets | C | H | Extreme | [R8] |
| Storm aerosol, sea mist, and distant spray | C† | M–H | High | Storm segment [R8] |
| Short-lived splash sheets/sprites/ribbons | C | M | Extreme | Impact/breaker event |
| General particle-resolved water breakup and air–water exchange | X | — | — | Not a real-time multiphase solver |
| Shore surf foam and wet/dry-boundary foam | X | — | — | Coastline simulation excluded |

### E. Object interaction and Gameplay Coupling

Three r185's compute-water example is primary evidence for TSL compute, ping-pong height storage, disturbance injection, normal reconstruction, and a responding surface object [R9]; it is a local-field primitive, not an ocean solver. The original _Atlas_ presentation treats surface waves, wakes, explosions, gameplay/physics, and network state as connected but separable systems [R10].

| Effect | Status | Cost | Temporal sensitivity | Evidence / scope note |
| --- | --- | --: | --- | --- |
| Interaction-Anchor-following local 2D height/velocity field | E† | H | High | [R9][R10] |
| Vessel/object disturbance injection through Interaction Shapes | E | M | High | [R9][R10] |
| Bow wave, stern wave, and Kelvin wake | E | M | High | [R10] |
| Propeller wash, vortical appearance, and cavitation foam | C | M–H | Extreme | Requires authored propeller sockets [R10] |
| Explosion/projectile/fall impact ring waves | C | M | High | Scheduled route event [R10] |
| Impact crown splash and droplets | C | H | Extreme | Scheduled route event [R10] |
| Gameplay buoyancy, drag, slamming, and stabilizing torque | E | M | Low | Perceptual/gameplay contract, not scientific validation |
| Batched water height/normal/velocity/foam Gameplay Queries | E | M | Low | Must agree perceptually with rendered state |
| Host rigid-body `BodyAdapter` | E | L | None | Host owns integration |
| GLB render model separated from closed Interaction Shape | E | L | None | Native Three host contract |
| Interaction-source priority and count budget | E | L | Low | Keeps hero response stable |
| Whole-world high-resolution interaction field | X | — | — | Detail follows Interaction Anchor |
| Arbitrary render triangles as exact fluid boundaries | X | — | — | Simplified closed proxies required |
| General conservative two-way fluid–structure solve | X | — | — | Gameplay Coupling is the accepted level |

### F. Weather, horizon, and environment integration

| Effect | Status | Cost | Temporal sensitivity | Evidence / scope note |
| --- | --- | --: | --- | --- |
| Dynamic wind/gusts and smooth sea-state transition | E | M | High | [R1][R10] |
| Rain impact ripples | C† | M | Extreme | Rain segment |
| Rain splash particles and near-camera rain mist | C | M–H | Extreme | Rain segment |
| Mip-aware distant whitecap persistence | E | M | Extreme | [R1][R2] |
| Horizon haze / aerial perspective | E† | M | Low | [R1][R2] |
| Continuous water-to-atmosphere fog composition | E† | M | Medium | Reference atmosphere adapter |
| Cloud-shadow modulation of glints, foam, reflection, and underwater light | C | M | Medium | Cloud-bearing segment [R8] |
| Lightning transient response | C | L | High | Storm segment |
| Distant island reflection, shadow, and atmospheric integration | C† | M–VH | High | Reference scene only |
| Shore shoaling, refraction, and surf generation | X | — | — | First release is offshore open water |
| Wet/dry lines, beach wetness, and terrain erosion | X | — | — | Coastline simulation excluded |
| River, waterfall, flood, and lake-basin solvers | X | — | — | Outside Open Water scope |
| Network lockstep/server-authoritative ocean state | X | — | — | First release has no network determinism claim |

### G. Post-processing and temporal stability

Three r185 defines TAAU as a beauty/depth/velocity temporal resolve from lower-resolution inputs, requires MSAA off, and exposes upstream resolution scaling [R11]. Its VelocityNode tracks previous model/view/projection matrices [R12]; procedurally displaced water therefore needs the previous wave state in addition to ordinary object transforms. Unity's production water documentation independently warns that missing water motion vectors produces TAA/DLSS blur and ghosting [R13].

| Effect | Status | Cost | Temporal sensitivity | Evidence / scope note |
| --- | --- | --: | --- | --- |
| Native-resolution TRAA | E | H | Itself | Confirmed Native policy [R12] |
| MSAA policy for Native | X | — | — | Disabled because Native uses TRAA [R11][R12] |
| TAAU | X | — | Itself | Explicitly off in Native [R11] |
| Dynamic resolution | X | — | High | Explicitly off in Native |
| Frame generation | X | — | Extreme | Explicitly off in Native |
| Custom procedural-water motion vectors | E | M | Required | [R12][R13] |
| Waterline/foam/particle responsive mask or custom history weight | E | M | Required | [R7][R13] |
| Depth/velocity/normal/luminance history rejection | E | M | Required | [R7][R11] |
| History reset on teleport, origin shift, or sea-state discontinuity | E | L | Required | Temporal correctness requirement |
| SSR temporal denoise/reprojection | E† | H | Extreme | [R7] |
| Controlled HDR bloom for sun glints and bright spray/foam | E† | M | High | Reference Experience only |
| HDR tone mapping, exposure, and color grade | E | L | Medium | Reference Experience only |
| Volume/depth-correct fog and god-ray composition | E† | H | High | Waterline/underwater/environment integration |
| Full-resolution transparent-spray composition after TRAA | E | M | Extreme | Confirmed Native composition policy |
| Output-resolution UI composition | E | L | None | Demo overlay only |
| General motion blur | X | — | — | Smears foam/glints; not in Native Full |
| Depth of field, chromatic aberration, and decorative lens flare | X | — | — | Optional screenshot/cinematic mode, excluded from benchmark |
| Strong sharpening used to hide temporal artifacts | X | — | — | Rejected quality strategy |
| Simultaneous MSAA plus TRAA/TAAU | X | — | — | Disallowed by Three temporal nodes [R11][R12] |

## Required non-visual instrumentation

These are not effects and do not count toward “all effects on,” but the acceptance claim is not auditable without them:

- WebGPU Core capability report, including formats, MRT, texture limits, and `timestamp-query` availability;
- CPU, total GPU, and per-pass p50/p95/p99 timings;
- separate accounting for water, reference scene, atmosphere, and post-processing;
- debug views for spectral cascades, displacement/slope/normal/velocity, every foam source/history, interaction field, SSR hit/confidence, refraction thickness, absorption/scattering, motion vectors/history rejection, and particle overdraw;
- Gameplay Query versus visible height/normal/velocity comparisons;
- Interaction Shape, buoyancy sample, force, and torque visualization;
- GPU resource inventory with target dimensions and formats;
- shader/pipeline warmup report and device-lost structured error handling;
- raw Chrome traces and fixed-route manifest for every benchmark run.

## Explicit exclusions from the first quality claim

The Reference Experience does not promise coast shoaling/surf/wet-dry boundaries; rivers, waterfalls, floods, or arbitrary water topology; full 3D Navier–Stokes/multiphase breakup; arbitrary Blender triangle meshes as exact fluid boundaries; a whole-open-world high-resolution interaction solve; network determinism; mobile, WebGL fallback, or WebGPU Compatibility Mode parity; or any Host Integration's final image quality and application frame rate.

## Primary-source index

No secondary articles are used as evidence in this note.

### Performance and presentation

- **[P1]** NVIDIA, [FrameView 1.9 User Guide](https://images.nvidia.com/content/geforce/technologies/frameview/frameview-1-9-user-guide-web-version.pdf) — distinguishes 1% Low from FPS percentile reporting.
- **[P2]** Intel PresentMon, [Issue #238: Presented FPS percentile semantics](https://github.com/GameTechDev/PresentMon/issues/238) — primary project discussion and correction of percentile direction/quantity.
- **[P3]** Google, [Android Frame Pacing](https://developer.android.com/games/sdk/frame-pacing) — render/display synchronization and irregular 30 FPS cadence examples.
- **[P4]** Apple, [WWDC20 Session 10077: Hitch-time presentation metrics](https://developer.apple.com/videos/play/wwdc2020/10077/) — official session and transcript defining hitch time/ratio, perceptibility guidance, and intentional 30 FPS framing.
- **[P5]** Apple, [Improving your game's graphics performance and settings](https://developer.apple.com/documentation/metal/improving-your-games-graphics-performance-and-settings) — 30/60 FPS budgeting and Metal performance workflow.
- **[P6]** Chrome, [Performance panel reference: Frames](https://developer.chrome.com/docs/devtools/performance/reference#frames) — normal, partially presented, and dropped frames.
- **[P7]** Chrome, [Animations and performance / smoothness](https://web.dev/articles/smoothness) — limitations of rAF-derived smoothness/FPS evidence.
- **[P8]** W3C GPU for the Web Community Group, [WebGPU timestamp queries](https://gpuweb.github.io/gpuweb/#timestamp) — optional feature, query contract, and GPU timing semantics.

### Water rendering and temporal systems

- **[R1]** Ubisoft La Forge, [Making Waves in Ocean Surface Rendering Using Tiling and Blending](https://www.ubisoft.com/en-us/studio/laforge/news/5WHMK3tLGMGsqhxmWls1Jw/making-waves-in-ocean-surface-rendering-using-tiling-and-blending) — authors' production research summary and paper links.
- **[R2]** Bruneton and Neyret, [Real-time Realistic Ocean Lighting using Seamless Transitions from Geometry to BRDF](https://inria.hal.science/inria-00443630/PDF/article-1.pdf) — primary paper on continuous scale transitions and ocean lighting.
- **[R3]** Guerrilla Games, [Water Rendering in Horizon Forbidden West, SIGGRAPH 2022](https://advances.realtimerendering.com/s2022/SIGGRAPH2022-Advances-Water-Malan.pdf) — original slides on baked localized breaking-wave deformation, foam data, runtime instancing, and art direction.
- **[R4]** Epic Games, [Single Layer Water Shading Model](https://dev.epicgames.com/documentation/unreal-engine/single-layer-water-shading-model-in-unreal-engine) — official production water material/composition contract.
- **[R5]** Three.js r185, [`WaterMesh.js`](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/objects/WaterMesh.js) — planar reflection, Fresnel, sunlight, and normal perturbation implementation.
- **[R6]** Three.js r185, [`Water2Mesh.js`](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/objects/Water2Mesh.js) — reflection/refraction, flow map, and dual normal-map implementation.
- **[R7]** Three.js r185, [`SSRNode.js`](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/tsl/display/SSRNode.js) — depth/normal/roughness inputs, stochastic mode, resolution scale, history, and velocity integration.
- **[R8]** Wargaming, [The Sea Up to the Horizon: Rendering Techniques in _World of Warships_, GDC 2018](https://media.gdcvault.com/gdc2018/presentations/Kryachko_Yury_SeaUpToHorizon.pdf) — original production presentation on ocean lighting, underwater terms, foam, bubbles, and GPU spray.
- **[R9]** Three.js r185, [`webgpu_compute_water.html`](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_compute_water.html) — TSL compute local height field, disturbance, normal reconstruction, and object response.
- **[R10]** Studio Wildcard / NVIDIA, [Advanced Graphics Techniques Tutorial: Wakes, Explosions and Physics in _Atlas_, GDC 2019](https://www.gdcvault.com/play/1025819/Advanced-Graphics-Techniques-Tutorial-Wakes) — original production presentation.
- **[R11]** Three.js r185, [`TAAUNode` documentation](https://github.com/mrdoob/three.js/blob/r185/docs/pages/TAAUNode.html.md) — lower-resolution beauty/depth/velocity input, temporal reconstruction, resolution scaling, and MSAA restriction.
- **[R12]** Three.js r185, [`TRAANode` documentation](https://github.com/mrdoob/three.js/blob/r185/docs/pages/TRAANode.html.md) and [`VelocityNode.js`](https://github.com/mrdoob/three.js/blob/r185/src/nodes/accessors/VelocityNode.js) — native temporal resolve contract and previous transform tracking.
- **[R13]** Unity HDRP 17, [Water System capabilities](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/water-capabilities-of-the-water-system.html) — official warning about water motion vectors and temporal upscaler/TAA artifacts.
- **[R14]** Three.js, [Issue #34241: timestamp-query memory growth report](https://github.com/mrdoob/three.js/issues/34241) — primary r185 report motivating a profiler-overhead/memory-growth control run; an open report is risk evidence, not proof of root cause.

## Empirical follow-up after the first prototype

The cold- and warm-start loading-time ceiling is intentionally derived from the first end-to-end prototype rather than guessed during design. Measuring it does not reopen the requirement that preparation completes behind the Loading Experience before the first visible 3D frame.
