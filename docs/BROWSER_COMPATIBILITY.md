# BROWSER_COMPATIBILITY

---

## 1. Support matrix

| Browser | Minimum | Status |
|---|---|---|
| **Chrome / Chromium** | 111+ | **Primary target.** Fully supported and CI-tested. |
| **Edge** | 111+ | Fully supported (same engine). |
| **Firefox** | 113+ | Fully supported and CI-tested. |
| **Safari / WebKit** | 16.4+ | **Best-effort.** Manually verified before release; not a merge gate. |
| Opera / Brave / Vivaldi | Chromium 111+ equivalent | Expected to work; untested. |
| Mobile browsers | — | Out of scope (`PROJECT_SPEC.md` §2). The page will load and render but controls are keyboard/mouse only. |
| Internet Explorer, legacy Edge | — | Not supported. |

**Recommended browser:** latest Chrome or Edge on desktop, hardware acceleration enabled.

Why these floors: 111/113/16.4 is the point where all of `WebGL2`, ES2020 target features, `ResizeObserver`, `structuredClone`, and modern `Intl` are available without polyfills across the three engines. Nothing in the game needs anything newer.

## 2. Hard requirements

The game refuses to start, with a clear explanatory panel, if any of these is missing:

| Requirement | Detection | Failure message |
|---|---|---|
| **WebGL2** | `canvas.getContext('webgl2')` | "This game needs WebGL2. Try Chrome or Edge, and make sure hardware acceleration is on." + a link to `get.webgl.org` guidance text (no external request) |
| ES modules | native `<script type="module">` | Legacy browsers simply do not execute the bundle; a `<noscript>`-adjacent fallback message covers it |
| `requestAnimationFrame` | presence | generic unsupported-browser panel |

Everything else degrades.

## 3. Optional, feature-detected

| Feature | Used for | If absent |
|---|---|---|
| `KHR_texture_basisu` (KTX2) | GPU-compressed textures | falls back to WebP textures from the manifest `fallback` field |
| `EXT_texture_filter_anisotropic` | sharper road textures at grazing angles | anisotropy 1 |
| `WEBGL_debug_renderer_info` | quality auto-tier hint, debug overlay | generic tier from `hardwareConcurrency` |
| `performance.memory` | heap readout in the debug overlay and perf test | omitted |
| Pointer Lock | mouse look | drag-to-look fallback with a HUD hint |
| Fullscreen API | fullscreen toggle | button hidden |
| `localStorage` | saves | **ephemeral mode** with a persistent notice (`SAVE_SYSTEM.md` §6) |
| `AudioContext` / autoplay resume | all audio | silent mode with a notice (`AUDIO_PLAN.md` §2) |
| Gamepad API | post-MVP controller support | keyboard/mouse only |
| **WebGPU** | nothing | **never required**; see §5 |
| `navigator.deviceMemory`, `hardwareConcurrency` | quality auto-tier hint | default Medium preset |

Rule: every optional feature has exactly one detection site, in `core/capabilities.ts`, evaluated once at boot and exposed as a frozen object. No scattered `if (window.foo)` checks.

## 4. Known engine-specific concerns

| Concern | Handling |
|---|---|
| Safari WebGL2 quirks (shader precision, texture limits, MSAA behaviour) | Keep shaders to Three.js built-ins; no custom GLSL beyond the sky gradient; avoid float texture reads |
| Safari/iOS memory ceilings | Not a target platform; the notice-based degraded path covers a crash-free failure |
| Firefox `AudioContext` resume timing | Resume on the first gesture only; never assume it succeeded — check `state` |
| Firefox shadow-map performance | Covered by the quality presets; Low disables shadows |
| Chrome/Firefox differences in `devicePixelRatio` reporting on zoom | dpr is re-read on the debounced resize, never cached at boot |
| Private/incognito storage restrictions | Ephemeral mode |
| Browser extensions injecting into the page | Console-error allowlist in the e2e test only; production logs the origin of unexpected errors |
| Reduced-motion and forced-colors OS settings | Honoured in UI CSS (`UI_ARCHITECTURE.md` §8) |
| WebGL context loss (GPU reset, tab backgrounding on some drivers) | Handled explicitly with a restore path (`WEB_ARCHITECTURE.md` §6) |

## 5. WebGPU policy

WebGPU is **not** used in the MVP and must never become a requirement.

- Three.js's WebGPU backend is a different renderer entry point with a different feature/robustness profile and a larger bundle. Adopting it now would risk the primary goal (it runs everywhere) for no measured benefit at our draw-call and triangle counts, which are nowhere near WebGL2's limits.
- If a future need appears (compute-driven instancing, thousands of agents), the renderer is constructed in exactly one place (`rendering/`), so an opt-in WebGPU path behind a feature detect plus a settings toggle is a contained experiment (`ARCHITECTURE.md` §7). It would ship as an *optional enhancement*, with WebGL2 remaining the default and the tested path.

## 6. Resolution and window handling

- Supported window sizes: 1280×720 up to 4K; the HUD scales with viewport height (`UI_ARCHITECTURE.md` §2). Below 1024 px wide the HUD switches to a compact layout; below 800 px wide a notice suggests a larger window.
- Ultrawide (21:9, 32:9) works: vertical FOV is fixed so wider windows reveal more horizontally.
- High-DPI: render target is `css × min(dpr, cap)`; UI is DOM and therefore always native-crisp.
- Fullscreen and window resize are handled without reloading, with a debounce (`WEB_ARCHITECTURE.md` §6).

## 7. Verification

- **CI, every push:** Playwright smoke in Chromium and Firefox (software WebGL2 in both — `TESTING_STRATEGY.md` §5).
- **Phase boundaries:** manual pass on real Chrome, Edge and Firefox on desktop.
- **Before release:** manual pass adding Safari; results recorded in the release notes with any known issues listed in the README.
- The compatibility panel text itself is verified by a test that forces `getContext('webgl2')` to return null.
