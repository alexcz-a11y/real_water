# Browser tooling

Classify browser work by its required evidence before selecting a tool. One artifact has one evidence class; promotion to a stronger class requires rerunning it through that class's procedure.

## Routing

| Required outcome | Tool and procedure | Evidence class |
| --- | --- | --- |
| Committed browser behavior, QA Harness control, screenshot comparison, or a CI gate | Write a Playwright Test with web-first assertions. Drive explicit QA Harness ticks and capture points instead of wall-clock sleeps or arbitrary animation-frame polling. | Regression acceptance |
| Explore a page, reproduce a bug, take an ad-hoc screenshot or video, or read rendered DOM and accessibility data | Use agent-browser in a named isolated session. Label retained artifacts as exploratory or reproduction evidence; convert behavior that should block a release into a Playwright Test. | Exploration and reproduction |
| Inspect Chrome console, network, Lighthouse, heap, runtime behavior, or performance traces | Use Chrome DevTools MCP. Treat its output as diagnostic evidence rather than a test result. | Chrome diagnostics |
| Make a Native visual, temporal, or performance claim | Follow the frozen benchmark on the reference M5 and exact headed Chrome profile. Certification may contain Playwright-driven QA Harness captures and raw Chrome diagnostic traces, but the controlled environment and procedure grant authority. | Native certification |

## Evidence controls

- Keep Playwright as the only repository-pinned browser test framework. Treat agent-browser and Chrome DevTools MCP as external operator tools and record their versions with retained artifacts.
- Record Chrome version, OS and hardware profile, headed or headless mode, drawing buffer, relevant power state, and test manifest for any profile-sensitive evidence.
- Treat agent-browser's bundled browser output as exploratory when its version or profile differs from the accepted test profile.
- For Chrome DevTools MCP evidence, disable CrUX lookup, redact sensitive network headers, and preserve profiler-on and profiler-off runs separately. Use an isolated browser profile unless the task explicitly requires an approved existing Chrome session.
- Keep authentication state, HAR files, traces, screenshots, and response bodies out of commits unless they have been reviewed and intentionally admitted as test assets.

Browser work is complete when its evidence class is named, the authoritative gate ran through the matching procedure, and the retained artifact records enough environment and tool metadata to reproduce its claim.
