// The dev instrument panel (PERFORMANCE.md section 7, TESTING_STRATEGY.md section 9).
//
// It is a System, so it uses the existing dispatch rather than its own hooks: lateUpdate
// samples the frame delta every frame, and `update` — scheduled at DEBUG_HZ — is the only
// thing that touches the DOM. It consumes the diagnostics that already exist (the
// scheduler's timingSnapshot, the renderer's info counters) and instruments nothing
// itself.
//
// Entire module is behind __DEV__ and absent from production builds.

import { Texture, type Object3D } from 'three';
import type { RenderDiagnostics } from '../core/Game';
import type { GameContext } from '../core/GameContext';
import type { System } from '../core/System';
import type { SystemTiming } from '../core/Scheduler';
import { setWireframe } from './gizmos';
import { ColliderView } from './colliderView';
import type { CapsuleDebugSource, ColliderDebugSource } from './colliderView';

/** Grepped by tests/static/debug-absent.mjs to prove the module is not shipped. */
export const DEBUG_MARKER = '__MOW_DEBUG_OVERLAY__';

/** DOM refresh rate. WEB_ARCHITECTURE.md section 4 budgets the overlay at 4 Hz. */
export const DEBUG_HZ = 4;

/** Frame samples kept for the FPS / p95 / max window — two seconds at 60 fps. */
const SAMPLE_COUNT = 120;

/** URL flag that starts the overlay visible, e.g. `?debug=1`. */
const URL_FLAG = 'debug';

/** Key that toggles it. Backquote avoids the browser shortcuts F3 and F12 sit on. */
const TOGGLE_CODE = 'Backquote';

/** URL flag that starts the collider view visible, e.g. `?colliders=1` (T-2.3). */
const COLLIDER_FLAG = 'colliders';

const BYTES_PER_MB = 1024 * 1024;
/** RGBA plus a full mip chain is about 4 * 4/3 bytes per pixel. */
const BYTES_PER_PIXEL_WITH_MIPS = (4 * 4) / 3;

export interface OverlaySources {
  /** The scheduler's rolling per-system timings, via Game. Not re-instrumented here. */
  readonly timings: () => readonly SystemTiming[];
  /** renderer.info counters, supplied by the bootstrap so `core` keeps no renderer dep. */
  readonly render?: (() => RenderDiagnostics) | undefined;
  /** Heap bytes where performance.memory exists, else null. Detection stays in capabilities. */
  readonly heapBytes?: (() => number | null) | undefined;
  /** One-line input snapshot, so a key or mouse check is visible while playing (T-1.8). */
  readonly inputSummary?: (() => string) | undefined;
}

export class DebugOverlay implements System {
  readonly id = 'debug' as const;

  private readonly sources: OverlaySources;
  /** Ring buffer of frame deltas in seconds. Fixed size, so sampling never allocates. */
  private readonly samples = new Float64Array(SAMPLE_COUNT);
  /** Scratch for the p95 sort, preallocated for the same reason. */
  private readonly sorted = new Float64Array(SAMPLE_COUNT);
  private sampleIndex = 0;
  private sampleLength = 0;

  private root: HTMLDivElement | null = null;
  private body: HTMLPreElement | null = null;
  private visible = false;
  private wireframe = false;
  private scene: Object3D | null = null;

  /** Collider + broadphase view (T-2.3). Independent of the text panel's visibility. */
  private colliderView: ColliderView | null = null;
  private colliderSource: ColliderDebugSource | null = null;
  private capsuleSource: CapsuleDebugSource | null = null;

  constructor(sources: OverlaySources) {
    this.sources = sources;
  }

  init(ctx: GameContext): void {
    this.scene = ctx.scene;
    this.visible = ctx.config.flags[URL_FLAG] !== undefined;

    // The collider view reads the physics and player systems structurally, so debug/
    // depends on neither module. Both are optional: before T-2.4 registers a physics
    // system there is nothing to draw, and the view simply stays empty.
    this.colliderView = new ColliderView(ctx.scene);
    this.colliderSource = published<ColliderDebugSource>(ctx, 'physics', 'world');
    this.capsuleSource = published<CapsuleDebugSource>(ctx, 'player', 'debugCapsule');
    if (ctx.config.flags[COLLIDER_FLAG] !== undefined) this.colliderView.setVisible(true);

    const root = document.createElement('div');
    root.id = DEBUG_MARKER;
    root.setAttribute(
      'style',
      'position:fixed;top:8px;left:8px;z-index:9999;pointer-events:none;' +
        'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'color:#e8e0d4;background:rgba(10,9,7,.78);padding:6px 8px;border-radius:4px;' +
        'white-space:pre;max-width:44ch',
    );
    const body = document.createElement('pre');
    body.setAttribute('style', 'margin:0;font:inherit');
    body.textContent = 'debug: collecting…';
    root.appendChild(body);
    root.hidden = !this.visible;
    document.body.appendChild(root);

    this.root = root;
    this.body = body;
    window.addEventListener('keydown', this.handleKey);
  }

  /** Every frame: sampling only, no DOM. */
  lateUpdate(dt: number): void {
    this.samples[this.sampleIndex] = dt;
    this.sampleIndex = (this.sampleIndex + 1) % SAMPLE_COUNT;
    if (this.sampleLength < SAMPLE_COUNT) this.sampleLength++;
  }

  /** At DEBUG_HZ: the only place that writes to the DOM, plus the collider view's sync. */
  update(): void {
    if (this.colliderView !== null && this.colliderSource !== null) {
      this.colliderView.sync(this.colliderSource, this.capsuleSource);
    }
    if (!this.visible || this.body === null) return;
    this.body.textContent = this.report();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKey);
    this.root?.remove();
    this.root = null;
    this.body = null;
    this.scene = null;
    this.colliderView?.dispose();
    this.colliderView = null;
    this.colliderSource = null;
    this.capsuleSource = null;
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (event.code === TOGGLE_CODE) {
      this.visible = !this.visible;
      if (this.root !== null) this.root.hidden = !this.visible;
      return;
    }
    // Shift+Backquote would collide with the toggle, so wireframe gets its own key.
    if (event.code === 'KeyG' && event.shiftKey && this.scene !== null) {
      this.wireframe = !this.wireframe;
      setWireframe(this.scene, this.wireframe);
      return;
    }
    // Colliders and broadphase cells (T-2.3).
    if (event.code === 'KeyC' && event.shiftKey && this.colliderView !== null) {
      this.colliderView.setVisible(!this.colliderView.visible);
    }
  };

  private report(): string {
    const lines: string[] = [];

    const { avg, p95, max } = this.frameStats();
    const fps = avg > 0 ? 1 / avg : 0;
    lines.push(`fps ${fps.toFixed(0).padStart(3)}  avg ${ms(avg)}  p95 ${ms(p95)}  max ${ms(max)}`);

    const render = this.sources.render?.();
    if (render !== undefined) {
      lines.push(
        `draws ${String(render.calls)}  tris ${String(render.triangles)}  ` +
          `progs ${String(render.programs)}`,
      );
      lines.push(
        `geos ${String(render.geometries)}  texs ${String(render.textures)}  ` +
          `tex~${(this.textureBytes() / BYTES_PER_MB).toFixed(1)}MB`,
      );
    }

    const heap = this.sources.heapBytes?.() ?? null;
    lines.push(heap === null ? 'heap n/a' : `heap ${(heap / BYTES_PER_MB).toFixed(1)}MB`);

    const input = this.sources.inputSummary?.();
    if (input !== undefined) lines.push(input);

    const timings = this.sources.timings();
    lines.push(`— systems (avg ms) ${String(timings.length)} —`);
    for (const timing of timings) {
      lines.push(`${timing.id.padEnd(12)} ${timing.avgMs.toFixed(2).padStart(6)}`);
    }

    lines.push(`\`=panel  shift+G=wireframe${this.wireframe ? ' (on)' : ''}`);
    return lines.join('\n');
  }

  private frameStats(): { avg: number; p95: number; max: number } {
    const count = this.sampleLength;
    if (count === 0) return { avg: 0, p95: 0, max: 0 };

    let total = 0;
    let max = 0;
    for (let i = 0; i < count; i++) {
      const value = this.samples[i] ?? 0;
      total += value;
      if (value > max) max = value;
      this.sorted[i] = value;
    }
    // Only the first `count` entries are valid, so sort that slice.
    const slice = this.sorted.subarray(0, count);
    slice.sort();
    const p95 = slice[Math.min(count - 1, Math.floor(count * 0.95))] ?? 0;
    return { avg: total / count, p95, max };
  }

  /** Sums unique texture dimensions in the scene. Dev-only, and only at DEBUG_HZ. */
  private textureBytes(): number {
    if (this.scene === null) return 0;
    const seen = new Set<string>();
    let bytes = 0;
    this.scene.traverse((object) => {
      const mesh = object as { material?: unknown };
      const material = mesh.material;
      if (material === undefined || material === null) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const entry of materials) {
        // Map slots vary by material type, so textures are found by inspecting the
        // material's own properties rather than by assuming a fixed list.
        const props = entry as Record<string, unknown>;
        for (const key in props) {
          const value = props[key];
          if (!(value instanceof Texture) || seen.has(value.uuid)) continue;
          seen.add(value.uuid);
          const image = value.image as { width?: number; height?: number } | undefined;
          const width = image?.width ?? 0;
          const height = image?.height ?? 0;
          bytes += width * height * BYTES_PER_PIXEL_WITH_MIPS;
        }
      }
    });
    return bytes;
  }
}

/**
 * A system's published interface, or null when that system is not registered or does not
 * publish the member asked for. `probe` names one member the caller needs, so a system
 * that exists but predates the interface is treated as absent rather than crashing.
 */
function published<T>(ctx: GameContext, id: 'physics' | 'player', probe: string): T | null {
  let system: Record<string, unknown>;
  try {
    // `GameContext.get` throws for an unregistered system and there is no non-throwing
    // lookup. Caught here rather than adding one to `core`, since this runs once at init
    // and a debug tool must never be the reason core grows an API.
    system = ctx.get(id) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
  const value = probe === 'world' ? system['world'] : system;
  if (value === null || typeof value !== 'object') return null;
  if (probe !== 'world' && typeof (value as Record<string, unknown>)[probe] !== 'function') {
    return null;
  }
  return value as T;
}

function ms(seconds: number): string {
  return `${(seconds * 1000).toFixed(1).padStart(5)}ms`;
}
