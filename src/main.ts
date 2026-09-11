// Bootstrap only. Per ARCHITECTURE.md section 1 this file never grows game logic:
// it reads config, mounts the canvas, constructs Game and starts it.
//
// The real bootstrap lands incrementally:
//   T-1.2  renderer + scene + camera        (rendering/)   <- done
//   T-1.3  Game runtime, systems, context   (core/)        <- done
//   T-1.5  loop + scheduler                 (core/)        <- done
//   T-1.7  capability gate + loading screen (core/errors.ts, ui/)  <- done
//   T-1.8  input snapshot                   (input/)       <- done
//   T-1.9  e2e read-only hook               (guarded by __E2E__)  <- done
//   T-2.4  collision world owner + grey-box playground (physics/, world/)  <- done

import { Game } from './core/Game';
import { ErrorReporter, type ErrorReport } from './core/errors';
import { createConfig } from './core/config';
import { createInitialState } from './core/state';
import { detectCapabilities } from './core/capabilities';
import { InputSystem } from './input/InputSystem';
import { PhysicsSystem } from './physics/PhysicsSystem';
import { formatInputState } from './input/InputState';
import { Renderer } from './rendering/Renderer';
import { createCamera } from './rendering/camera';
import { createScene } from './rendering/Scene';
import { addValidationScene } from './rendering/validationScene';
import { FatalPanel } from './ui/FatalPanel';
import { LoadingScreen } from './ui/Loading';

/** `performance.memory` is non-standard; narrowed here rather than cast to any. */
interface PerformanceWithMemory extends Performance {
  readonly memory?: { readonly usedJSHeapSize: number };
}

/** BROWSER_COMPATIBILITY.md section 2. Guidance only — no external request or link. */
const NO_WEBGL2_MESSAGE =
  'This game needs WebGL2. Try the latest Chrome or Edge, and make sure hardware ' +
  'acceleration is switched on in your browser settings.';

const NO_RAF_MESSAGE =
  'This browser is too old to run the game. Please use the latest Chrome, Edge or Firefox.';

/**
 * Wrapped in a function so nothing here is module-level mutable state
 * (ARCHITECTURE.md section 4, "Forbidden").
 */
function bootstrap(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('main: index.html is missing the #game canvas');
  }

  const loading = new LoadingScreen();
  const fatalPanel = new FatalPanel();

  // The loop must stop before the panel appears, per ARCHITECTURE.md section 8. `game`
  // may still be null here — a capability failure happens before it is constructed.
  let game: Game | null = null;
  const presentFatal = (report: ErrorReport): void => {
    game?.stop();
    loading.hide();
    fatalPanel.show(report);
  };

  const errors = new ErrorReporter({ presentFatal });
  errors.installGlobalHandlers();

  loading.setPhase('Checking your browser');
  const caps = detectCapabilities();

  if (!caps.webgl2) {
    errors.fatal('capability.webgl2', NO_WEBGL2_MESSAGE, { webgl2: false });
    return;
  }
  if (!caps.requestAnimationFrame) {
    errors.fatal('capability.raf', NO_RAF_MESSAGE, { requestAnimationFrame: false });
    return;
  }

  loading.setPhase('Starting renderer');
  const scene = createScene();
  const camera = createCamera(canvas.clientWidth / canvas.clientHeight);

  // Temporary Phase-1 validation content, retired by T-2.4 / T-3.10.
  addValidationScene(scene, camera);

  // Renders on demand until the loop starts; without this a resize before start would
  // leave a stretched frame on screen.
  const renderer: Renderer = new Renderer(canvas, camera, {
    onResized: () => renderer.render(scene),
  });

  // Pointer lock can be refused or dropped at any time; the drag-to-look fallback takes
  // over and the degraded tier carries the notice, which becomes a visible HUD hint once
  // T-10.5 lands the notice sink.
  const input = new InputSystem(canvas, {
    onPointerLockUnavailable: (reason) => {
      errors.degraded(
        'input.pointer-lock',
        'Mouse capture is off — click the game to capture the mouse, or drag to look around.',
        { reason },
      );
    },
  });

  const config = createConfig(window.location.search);

  game = new Game({
    scene,
    camera,
    config,
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
      inputSummary: () => formatInputState(input.state),
    },
    // Once per frame, before any consumer (WEB_ARCHITECTURE section 3).
    onFrameStart: () => {
      input.snapshot();
    },
    onProgress: ({ completed, total }) => {
      loading.setProgress(completed, total);
    },
  });

  // Registered first, so it initialises before anything that reads its snapshot.
  game.register(input);

  // Owns the one collision world (T-2.4). Registered before anything that queries it,
  // since systems initialise in registration order.
  game.register(new PhysicsSystem());

  const started = game;

  // Top-level await needs ES2022, so the async boot is a function (target is ES2020).
  const start = async (): Promise<void> => {
    // Grey-box playground (T-2.4): dev and e2e only, behind `?testworld=1`. Dynamically
    // imported inside the guard so production drops the module graph, the same way the
    // debug overlay is kept out. `__E2E__` is in the gate because the smoke test asserts
    // the render path drew something and this is now the only content in the scene.
    if ((__DEV__ || __E2E__) && config.flags['testworld'] !== undefined) {
      const { TestWorld } = await import('./world/TestWorld');
      started.register(new TestWorld());
    }

    loading.setPhase('Starting systems');
    await started.initSystems();

    // First render happens before the loading screen is hidden (WEB_ARCHITECTURE
    // section 2, step 6), so the canvas is never shown empty.
    loading.setPhase('Waking up Mysuru');
    renderer.render(scene);

    loading.hide();
    started.start();

    // The one permitted `window` global (ARCHITECTURE.md section 4). Read-only, and
    // absent from the deployed build because __E2E__ is false there — asserted by
    // tests/static/e2e-hook-absent.mjs.
    if (__E2E__ && config.flags['e2e'] !== undefined) {
      Object.defineProperty(window, '__mow', {
        value: {
          get render() {
            const info = renderer.three.info.render;
            return { calls: info.calls, triangles: info.triangles };
          },
          get canvas() {
            return { width: canvas.width, height: canvas.height };
          },
          get phase() {
            return started.phase;
          },
          get running() {
            return started.isRunning;
          },
        },
      });
    }

    if (__DEV__) {
      console.info(
        `[mow] game ready · phase=${started.phase} · running=${String(started.isRunning)} · dpr=${renderer.three.getPixelRatio()} · e2e=${String(__E2E__)}`,
        caps,
      );
    }
  };

  void start().catch((cause: unknown) => {
    errors.fatal(
      'boot.failed',
      'The game could not finish starting up.',
      { phase: 'initSystems' },
      cause,
    );
  });
}

bootstrap();
