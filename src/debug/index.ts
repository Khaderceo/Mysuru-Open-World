// The only entry point into `debug/`. Imported exactly once, from the __DEV__-guarded
// hook in core/Game.ts, via a dynamic import so the whole module graph is dropped from
// production builds (ARCHITECTURE.md section 3: debug is depended on by nobody).

export { DEBUG_HZ, DEBUG_MARKER, DebugOverlay } from './Overlay';
export type { OverlaySources } from './Overlay';
