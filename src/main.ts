// Bootstrap only. Per ARCHITECTURE.md section 1 this file never grows game logic:
// it reads config, mounts the canvas, constructs Game and starts it.
//
// The real bootstrap lands incrementally:
//   T-1.2  renderer + scene + camera        (rendering/)   <- done
//   T-1.3  Game runtime, systems, context   (core/)        <- done
//   T-1.5  loop + scheduler                 (core/)        <- done
//   T-1.7  capability gate + loading screen (core/errors.ts, ui/)

import { Game } from './core/Game';
import { createConfig } from './core/config';
import { createInitialState } from './core/state';
import { detectCapabilities } from './core/capabilities';
import { Renderer } from './rendering/Renderer';
import { createCamera } from './rendering/camera';
import { createScene } from './rendering/Scene';
import { addValidationScene } from './rendering/validationScene';

/** `performance.memory` is non-standard; narrowed here rather than cast to any. */
interface PerformanceWithMemory extends Performance {
  readonly memory?: { readonly usedJSHeapSize: number };
}

const boot = document.getElementById('boot');
const bootStatus = document.getElementById('boot-status');
const canvas = document.getElementById('game');

if (!(canvas instanceof HTMLCanvasElement) || !boot || !bootStatus) {
  // index.html and this file are edited together; a mismatch is a build-time mistake,
  // not a runtime condition to recover from.
  throw new Error('main: index.html is missing #game, #boot or #boot-status');
}

const caps = detectCapabilities();

if (!caps.webgl2 || !caps.requestAnimationFrame) {
  // Placeholder for the fatal panel, which T-1.7 owns along with the real copy.
  bootStatus.textContent =
    'This game needs WebGL2. Try Chrome or Edge, and make sure hardware acceleration is on.';
} else {
  const scene = createScene();
  const camera = createCamera(canvas.clientWidth / canvas.clientHeight);

  // Temporary Phase-1 validation content, retired by T-2.4 / T-3.10.
  addValidationScene(scene, camera);

  // Renders on demand until T-1.5 owns the loop; without this a resize would leave a
  // stretched frame on screen.
  const renderer: Renderer = new Renderer(canvas, camera, {
    onResized: () => renderer.render(scene),
  });

  const game = new Game({
    scene,
    camera,
    config: createConfig(window.location.search),
    state: createInitialState(),
    // The renderer belongs to `rendering` (T-1.2); the loop calls this once per frame.
    onRender: () => renderer.render(scene),
    // Dev-only diagnostics for the debug overlay (T-1.6). Production drops the overlay,
    // so these are never read there. Feature detection stays in core/capabilities.ts.
    diagnostics: {
      render: () => {
        const info = renderer.three.info;
        return {
          calls: info.render.calls,
          triangles: info.render.triangles,
          programs: info.programs?.length ?? 0,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
        };
      },
      heapBytes: () => {
        if (!caps.performanceMemory) return null;
        return (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? null;
      },
    },
    // T-1.7 routes this into the loading screen's progress bar.
    onProgress: ({ completed, total, systemId }) => {
      bootStatus.textContent = `Starting ${systemId} (${completed}/${total})`;
    },
  });

  // No systems are registered yet — each Phase 1/2 task registers its own. Top-level
  // await needs ES2022, so the async boot is a function (target is ES2020).
  const start = async (): Promise<void> => {
    await game.initSystems();

    // First render happens before the loading screen is hidden (WEB_ARCHITECTURE
    // section 2, step 6), so the canvas is never shown empty.
    renderer.render(scene);

    // T-1.7 replaces this with the real loading sequence and its progress reporting.
    boot.hidden = true;

    game.start();

    if (__DEV__) {
      console.info(
        `[mow] game ready · phase=${game.phase} · running=${String(game.isRunning)} · dpr=${renderer.three.getPixelRatio()} · e2e=${String(__E2E__)}`,
        caps,
      );
    }
  };

  void start().catch((error: unknown) => {
    // Placeholder for the fatal panel and its error tiers, which T-1.7 owns.
    console.error('[mow] boot failed', error);
    bootStatus.textContent = 'The game failed to start. Please reload.';
  });
}
