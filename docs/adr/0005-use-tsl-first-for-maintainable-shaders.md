# Use TSL first for maintainable shaders

Real Water expresses materials, render passes, and compute work through public Three.js TSL and NodeMaterial APIs by default so typed TypeScript, Three integration, and AI-assisted maintenance remain straightforward. Isolated WGSL is allowed only when TSL cannot express a required operation or repeatable profiling proves a material quality or performance benefit, and it must not depend on Three's private renderer backend.
