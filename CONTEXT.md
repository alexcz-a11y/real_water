# Real Water

Real Water defines the language for a reusable real-time open-water experience whose behavior and appearance remain coherent across rendering, interaction, and host integration.

## Language

**Open Water**: A large continuous body such as an ocean or great lake whose enclosing basin is outside the intended experience. _Avoid_: General-purpose water, river, pool

**Open Water Domain**: The single active ocean-scale water space owned by one Real Water runtime, with one sea level and one Interaction Anchor at a time. _Avoid_: Water collection, multiple water bodies

**Perceptual Fidelity**: Observable agreement with how open water is expected to look and move, without claiming that its controls correspond to measurable physical quantities. _Avoid_: Physical accuracy, true physics

**Aesthetic Authority**: The rule that visual composition and gameplay feel decide whether water behavior is accepted; physical models are supporting tools rather than goals. _Avoid_: Physics-first, simulation purity

**Artistic Control**: A deliberate control over presentation that does not claim to represent a physical measurement and may override simulated behavior to improve aesthetics or gameplay. _Avoid_: Physical parameter

**Water Preset**: A versioned named snapshot of Artistic Controls that describes a reusable authored sea appearance without encoding UI-library state. _Avoid_: Tweakpane state, renderer dump

**Environment Preset**: A versioned named snapshot of sun, weather, atmosphere, and referenced environment resources. _Avoid_: Water Preset, inferred scene lighting

**Quality Profile**: A versioned structural configuration whose resource layouts and effect routes must pass the Readiness Gate before use. _Avoid_: Artistic Control, live quality mutation

**Showcase Preset**: A deterministic presentation recipe that combines Water, Environment, and Quality presets with camera and event timelines. _Avoid_: Screen recording, ad-hoc demo state

**Reference Bible**: The shared visual identity, scale, material, palette, lighting, and framing rules used to keep generated demonstration assets coherent. _Avoid_: One-off prompt, mood board without constraints

**Reference Pack**: An approved canonical identity sheet and its identity-preserving multi-view derivatives used as evidence for one procedural model reconstruction. _Avoid_: Independent angle generation, cinematic beauty shot

**Demonstration Subject**: A code-only procedural model reconstructed from an approved Reference Pack in order to populate the Reference Experience. _Avoid_: Reference Pack, proxy geometry, third-party art asset

**Scene Participation**: The declared set of Reference Experience modes a Demonstration Subject is composed into, together with the water behavior it carries in each. _Avoid_: Present in the repository, visible on a preview page

**Gameplay Coupling**: A bidirectional interaction in which water influences an object while the object creates wakes or disturbances, optimized for responsiveness and plausibility rather than physical conservation. _Avoid_: Full fluid–structure coupling, physically exact coupling

**Interaction Shape**: A simplified, closed representation of a visible object used to calculate its interaction with water. _Avoid_: Render mesh, arbitrary triangle mesh

**Disturbance**: A bounded gameplay or visual event that perturbs the local water state, such as an impact, wake, foam burst, or Hero Breaker. _Avoid_: New water simulation, structural effect toggle

**Gameplay Query**: A continuous observation of the water state used to drive gameplay and expected to agree perceptually with the rendered surface, without claiming real-world measurement accuracy. _Avoid_: Scientific measurement, exact GPU readback

**Interaction Anchor**: The world-space focus around which high-detail water interactions are maintained, usually the primary playable vessel or object. _Avoid_: Camera position, global simulation origin

**Local Interaction Field**: The bounded, Interaction Anchor-centred field of active Disturbances that perturbs the Open Water Domain's surface, faded out at its own edge so that it blends into the spectral ocean rather than ending. _Avoid_: Global disturbance list, coupled fluid domain

**Prepared Surface**: The composed water surface a frame presents, being the spectral ocean and the Local Interaction Field together at one sample position and time. Every observation expected to agree with what is drawn resolves against it. _Avoid_: Spectral ocean alone, displaced render mesh

**Waterline**: The classification of an observer as above, crossing, or below the Prepared Surface, held stable across frames by hysteresis so that layers keyed to it do not oscillate. _Avoid_: Sea level, surface plane, camera depth sign

**Hero Breaker**: An art-directed, localized breaking-wave event used where silhouette and drama matter most, without implying a general volumetric fluid simulation. _Avoid_: Full fluid solve, generic whitecap

**Reference Experience**: The controlled demonstration scene in which Real Water's visual-quality and whole-frame performance claims are evaluated. _Avoid_: Any host application, arbitrary integration

**Native Quality**: The highest-fidelity Reference Experience rendered at its output resolution without temporal upscaling and with every in-scope visual effect enabled. _Avoid_: Upscaled quality, integration quality

**Cinematic Maximum**: A screenshot-oriented Reference Experience mode that may maximize auxiliary effects beyond the Native Quality contract and carries no real-time performance guarantee. _Avoid_: Native Quality, performance preset

**Loading Experience**: The pre-entry presentation shown while the Reference Experience is not yet ready, responsible for truthful progress and failure communication. _Avoid_: First game frame, decorative splash

**Readiness Gate**: The startup condition that every effect path and resource declared by the active manifest must pass before the first visible Reference Experience frame. _Avoid_: Best-effort warmup, background compilation

**Prewarm Manifest**: A versioned declaration of every effect state, resource, and conditional path that must be prepared before a Real Water runtime can become ready. _Avoid_: Feature wishlist, runtime discovery

**Declaration Seed**: The authored, arbitrary, permanently stable starting value carried by one Prewarm Manifest declaration, which exists only to keep that declaration distinguishable from another and asserts nothing on its own. _Avoid_: Fingerprint, salt, content hash

**Declaration Fingerprint**: The published identity of one Prewarm Manifest declaration under its structural inputs, composed from that declaration's Declaration Seed. Equal fingerprints do not claim that the code preparing the work is unchanged. _Avoid_: Label hash, content hash, declaration checksum

**Radiance Credential**: The digest of the canonical Host environment radiance bytes that a Host Integration asserts and Real Water verifies without ever reading those bytes back. _Avoid_: Radiance fingerprint, environment fingerprint

**Host Integration**: A third-party Three.js experience that uses Real Water while retaining responsibility for its own composition, lighting, assets, frame budget, and final visual quality. _Avoid_: Reference Experience
