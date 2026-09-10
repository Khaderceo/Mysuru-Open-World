// Owns the WebGL2 context, its configuration, the resolution/DPI policy and the
// resize + context-loss lifecycle. Nothing else touches WebGLRenderer.
//
// Configuration is fixed by PERFORMANCE.md section 5; lifecycle by
// WEB_ARCHITECTURE.md sections 6-7. Quality presets that mutate dprCap and shadows
// arrive in T-11.7; the loop that calls render() arrives in T-1.5.

import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  type PerspectiveCamera,
  type Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

/** WEB_ARCHITECTURE.md section 7: render target = cssSize x min(devicePixelRatio, dprCap). */
export const DEFAULT_DPR_CAP = 1.5;

/** Resize is debounced so a drag-resize costs one reallocation, not sixty. */
const RESIZE_DEBOUNCE_MS = 100;

export interface RendererOptions {
  /** Invoked after `webglcontextlost`. T-1.5 pauses the loop here; T-1.7 shows the panel. */
  onContextLost?: () => void;
  /** Invoked after `webglcontextrestored`. */
  onContextRestored?: () => void;
  /**
   * Invoked after a debounced resize or a context restore has been applied. The T-1.5
   * loop does not need it (it renders every frame), but callers that render on demand
   * do, otherwise the canvas shows a stretched frame until the next draw.
   */
  onResized?: () => void;
}

export class Renderer {
  readonly three: WebGLRenderer;

  private readonly canvas: HTMLCanvasElement;
  private readonly camera: PerspectiveCamera;
  private readonly options: RendererOptions;
  private readonly observer: ResizeObserver | null = null;

  private dprCap = DEFAULT_DPR_CAP;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, camera: PerspectiveCamera, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.options = options;

    // three r186 is WebGL2-only, so a successful construction implies a WebGL2 context.
    // Capability detection (core/capabilities.ts) is what decides whether to get this far.
    this.three = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });

    this.three.outputColorSpace = SRGBColorSpace;
    this.three.toneMapping = ACESFilmicToneMapping;
    this.three.toneMappingExposure = 1.0;
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = PCFSoftShadowMap;
    this.three.shadowMap.autoUpdate = true;

    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    // ResizeObserver catches CSS-size changes; the window listener additionally catches
    // devicePixelRatio-only changes (browser zoom, monitor swap) where CSS size is stable.
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(this.scheduleResize);
      this.observer.observe(canvas);
    }
    window.addEventListener('resize', this.scheduleResize);

    this.applySize();
  }

  /** Clamp used for the render target. Settings expose 1.0 / 1.25 / 1.5 / 2.0 in T-10.7. */
  setDprCap(cap: number): void {
    this.dprCap = cap;
    this.applySize();
  }

  /** Resizes immediately, bypassing the debounce. Used at boot and by tests. */
  applySize(): void {
    if (this.disposed) return;

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.three.setPixelRatio(Math.min(window.devicePixelRatio, this.dprCap));
    // `false` keeps the CSS size under stylesheet control; only the buffer is resized.
    this.three.setSize(width, height, false);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(scene: Scene): void {
    this.three.render(scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
    this.observer?.disconnect();
    window.removeEventListener('resize', this.scheduleResize);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.three.dispose();
  }

  private readonly scheduleResize = (): void => {
    if (this.disposed) return;
    if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this.applySize();
      this.options.onResized?.();
    }, RESIZE_DEBOUNCE_MS);
  };

  private readonly handleContextLost = (event: Event): void => {
    // Without preventDefault the browser will not attempt a restore.
    event.preventDefault();
    console.warn('[mow] WebGL context lost');
    this.options.onContextLost?.();
  };

  private readonly handleContextRestored = (): void => {
    console.warn('[mow] WebGL context restored');
    this.applySize();
    this.options.onResized?.();
    this.options.onContextRestored?.();
  };
}
