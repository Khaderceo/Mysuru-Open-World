// The per-frame input snapshot (PLAYER_ARCHITECTURE.md section 6).
//
// Input is a snapshot, never a callback into gameplay: listeners only record raw device
// state, and InputSystem.snapshot() turns that into these values once per frame, before
// any consumer runs. That is what makes edge flags meaningful — `pressedThisFrame` is
// true for exactly one frame, no matter how the events interleaved.

import { Vector2 } from 'three';

/** A button, with the two edges consumers need to avoid tracking history themselves. */
export interface Pressed {
  down: boolean;
  pressedThisFrame: boolean;
  releasedThisFrame: boolean;
}

export interface InputState {
  /** −1..1 per axis, normalised on diagonals so diagonal movement is not faster. */
  readonly move: Vector2;
  /** Mouse delta for this frame in CSS pixels. Never multiplied by dt — see CODING_RULES. */
  readonly look: Vector2;
  /** Shift held. */
  run: boolean;
  jump: Pressed;
  interact: Pressed;
  pause: Pressed;
  /** Space while driving. */
  handbrake: Pressed;
  horn: Pressed;
  /** Accumulated wheel delta for this frame. */
  zoom: number;
  /** True while the pointer is locked; false means the drag-to-look fallback is active. */
  pointerLocked: boolean;
  /**
   * Set by the UI when a modal has focus. Consumers do not check menus themselves —
   * a blocked snapshot simply reports neutral input (PLAYER_ARCHITECTURE.md section 6).
   */
  blocked: boolean;
}

export function createPressed(): Pressed {
  return { down: false, pressedThisFrame: false, releasedThisFrame: false };
}

export function createInputState(): InputState {
  return {
    move: new Vector2(),
    look: new Vector2(),
    run: false,
    jump: createPressed(),
    interact: createPressed(),
    pause: createPressed(),
    handbrake: createPressed(),
    horn: createPressed(),
    zoom: 0,
    pointerLocked: false,
    blocked: false,
  };
}

/** One-line summary for the dev overlay (T-1.6). Allocates, so never call it per frame. */
export function formatInputState(state: InputState): string {
  const flag = (pressed: Pressed): string =>
    pressed.pressedThisFrame ? '^' : pressed.releasedThisFrame ? 'v' : pressed.down ? '#' : '.';
  return (
    `move ${state.move.x.toFixed(2)},${state.move.y.toFixed(2)} ` +
    `look ${state.look.x.toFixed(0)},${state.look.y.toFixed(0)} ` +
    `z${state.zoom.toFixed(0)} ` +
    `run${state.run ? '#' : '.'} ` +
    `jmp${flag(state.jump)} int${flag(state.interact)} esc${flag(state.pause)} ` +
    `hb${flag(state.handbrake)} horn${flag(state.horn)} ` +
    `${state.pointerLocked ? 'locked' : 'drag'}${state.blocked ? ' BLOCKED' : ''}`
  );
}
