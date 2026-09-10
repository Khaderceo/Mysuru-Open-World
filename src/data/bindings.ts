// Action -> key-code bindings (PLAYER_ARCHITECTURE.md section 6).
//
// Codes are `KeyboardEvent.code`, not `.key`, so WASD lands on the same physical keys on
// AZERTY and Dvorak hardware. The shape is action -> list of codes from day one, which is
// what a rebinding UI and persisted settings will need later; the UI itself is post-MVP.

export const BINDINGS = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  interact: ['KeyE'],
  pause: ['Escape'],
  /** Shares Space with jump: on foot it jumps, while driving it is the handbrake. */
  handbrake: ['Space'],
  horn: ['KeyH'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type InputAction = keyof typeof BINDINGS;

/**
 * Codes the game consumes, so the input system can suppress their default browser
 * behaviour (Space scrolling the page, arrow keys panning it) and leave everything else
 * alone. Escape is excluded: the browser owns it for exiting pointer lock.
 */
export const PREVENT_DEFAULT_CODES: readonly string[] = Object.entries(BINDINGS)
  .filter(([action]) => action !== 'pause')
  .flatMap(([, codes]) => codes);
