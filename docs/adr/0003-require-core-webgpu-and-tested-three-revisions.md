# Require Core WebGPU and tested Three revisions

Real Water runs only on a verified Core WebGPU backend and fails explicitly after initialization if Three selected WebGL2 or WebGPU Compatibility Mode. The package may use Three's public `WebGPURenderer` even though its dependency graph contains an unused WebGL fallback, declares Three as an external peer dependency, and supports only narrowly tested Three revisions starting with `0.185.1` because the official WebGPU API remains experimental.
