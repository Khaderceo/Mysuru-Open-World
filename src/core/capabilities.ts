// The single browser-capability detection site (BROWSER_COMPATIBILITY.md section 3).
// Evaluated once at boot, frozen, and read from everywhere else. No other module may
// probe for a browser feature — scattered `if (window.foo)` checks are the failure mode
// this file exists to prevent.

/** `navigator.deviceMemory` is non-standard, so it is narrowed here rather than cast to any. */
interface NavigatorWithDeviceMemory extends Navigator {
  readonly deviceMemory?: number;
}

export interface Capabilities {
  /** Hard requirements. The game refuses to start without these (BROWSER_COMPATIBILITY.md section 2). */
  readonly webgl2: boolean;
  readonly requestAnimationFrame: boolean;

  /** Optional, feature-detected. Each has a documented degraded path. */
  readonly ktx2: boolean;
  readonly anisotropicFiltering: boolean;
  readonly debugRendererInfo: boolean;
  readonly performanceMemory: boolean;
  readonly pointerLock: boolean;
  readonly fullscreen: boolean;
  readonly localStorage: boolean;
  readonly audioContext: boolean;
  readonly gamepad: boolean;
  /** Detected only so the debug overlay can report it. Never required (PERFORMANCE.md section 5). */
  readonly webgpu: boolean;

  /** Quality auto-tier hints; both may be unknown. */
  readonly hardwareConcurrency: number | undefined;
  readonly deviceMemoryGb: number | undefined;
  readonly maxTextureSize: number | undefined;
  readonly unmaskedRenderer: string | undefined;
}

/** True if `localStorage` can actually be written, not merely referenced (SAVE_SYSTEM.md section 6). */
function probeLocalStorage(): boolean {
  try {
    const key = '__mow_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    // Private mode, blocked cookies, or a full quota. Treated as "no storage", not an error.
    return false;
  }
}

/**
 * Probes WebGL2 on a throwaway canvas so the real game canvas is left untouched for the
 * renderer, then releases the context immediately.
 */
function probeWebgl(): Pick<
  Capabilities,
  | 'webgl2'
  | 'ktx2'
  | 'anisotropicFiltering'
  | 'debugRendererInfo'
  | 'maxTextureSize'
  | 'unmaskedRenderer'
> {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) {
    return {
      webgl2: false,
      ktx2: false,
      anisotropicFiltering: false,
      debugRendererInfo: false,
      maxTextureSize: undefined,
      unmaskedRenderer: undefined,
    };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  let unmaskedRenderer: string | undefined;
  if (debugInfo) {
    const value: unknown = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    unmaskedRenderer = typeof value === 'string' ? value : undefined;
  }

  const result = {
    webgl2: true,
    ktx2: gl.getExtension('KHR_texture_basisu') !== null,
    anisotropicFiltering: gl.getExtension('EXT_texture_filter_anisotropic') !== null,
    debugRendererInfo: debugInfo !== null,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    unmaskedRenderer,
  };

  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return result;
}

/** Runs every probe once and returns a frozen snapshot. Call exactly once, at boot. */
export function detectCapabilities(): Capabilities {
  const nav: NavigatorWithDeviceMemory = navigator;

  return Object.freeze({
    ...probeWebgl(),
    requestAnimationFrame: typeof window.requestAnimationFrame === 'function',
    performanceMemory: 'memory' in performance,
    pointerLock: 'requestPointerLock' in HTMLElement.prototype,
    fullscreen: 'requestFullscreen' in HTMLElement.prototype,
    localStorage: probeLocalStorage(),
    audioContext: 'AudioContext' in window,
    gamepad: 'getGamepads' in navigator,
    webgpu: 'gpu' in navigator,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory,
  });
}
