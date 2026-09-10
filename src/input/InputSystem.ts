// Device events in, one snapshot per frame out (PLAYER_ARCHITECTURE.md section 6).
//
// Listeners do nothing but record raw state — no gameplay is called from an event
// handler. snapshot() is invoked once per frame from the loop's frame-start hook, before
// any consumer, and is the only place edge flags are computed.

import { BINDINGS, PREVENT_DEFAULT_CODES, type InputAction } from '../data/bindings';
import type { GameContext } from '../core/GameContext';
import type { System } from '../core/System';
import { createInputState, type InputState, type Pressed } from './InputState';

export interface InputSystemOptions {
  /**
   * Called when pointer lock is unavailable or lost and the drag-to-look fallback takes
   * over. The bootstrap routes this to the degraded error tier, which is the documented
   * channel for "continue with a substitute and surface a notice".
   */
  readonly onPointerLockUnavailable?: ((reason: string) => void) | undefined;
}

/** Codes currently held, resolved to actions at snapshot time. */
type HeldCodes = Set<string>;

export class InputSystem implements System {
  readonly id = 'input' as const;

  private readonly canvas: HTMLCanvasElement;
  private readonly options: InputSystemOptions;
  private readonly current: InputState = createInputState();

  /** Raw device state, written only by listeners. */
  private readonly held: HeldCodes = new Set();
  private pendingLookX = 0;
  private pendingLookY = 0;
  private pendingZoom = 0;
  /** Codes released since the last snapshot, so a tap between frames is not lost. */
  private readonly releasedSinceSnapshot: HeldCodes = new Set();
  /** Codes pressed since the last snapshot, for the same reason. */
  private readonly pressedSinceSnapshot: HeldCodes = new Set();

  private dragging = false;
  private blocked = false;
  private bound = false;

  constructor(canvas: HTMLCanvasElement, options: InputSystemOptions = {}) {
    this.canvas = canvas;
    this.options = options;
  }

  /** Read-only view of this frame's input. Consumers read; they never write. */
  get state(): InputState {
    return this.current;
  }

  init(_ctx: GameContext): void {
    if (this.bound) return;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.canvas.addEventListener('click', this.handleCanvasClick);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: true });
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    this.bound = true;
  }

  dispose(): void {
    if (!this.bound) return;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    this.bound = false;
  }

  /**
   * The UI's single gate. A blocked snapshot reports neutral input, so no consumer has
   * to know whether a menu is open.
   */
  setBlocked(blocked: boolean): void {
    this.blocked = blocked;
  }

  /**
   * Builds this frame's snapshot. Called once per frame from the loop's frame-start hook,
   * before fixedUpdate, so every consumer in the frame sees the same values.
   */
  snapshot(): void {
    const state = this.current;
    state.blocked = this.blocked;
    state.pointerLocked = document.pointerLockElement === this.canvas;

    // Pause stays live while blocked: Escape is how the player closes the menu that set
    // the flag in the first place.
    this.updateButton(state.pause, 'pause');

    if (this.blocked) {
      state.move.set(0, 0);
      state.look.set(0, 0);
      state.zoom = 0;
      state.run = false;
      this.neutralise(state.jump);
      this.neutralise(state.interact);
      this.neutralise(state.handbrake);
      this.neutralise(state.horn);
      this.clearPending();
      return;
    }

    const x = (this.isDown('moveRight') ? 1 : 0) - (this.isDown('moveLeft') ? 1 : 0);
    const y = (this.isDown('moveForward') ? 1 : 0) - (this.isDown('moveBack') ? 1 : 0);
    state.move.set(x, y);
    // Normalised so diagonals are not faster than the cardinals.
    if (x !== 0 && y !== 0) state.move.normalize();

    state.look.set(this.pendingLookX, this.pendingLookY);
    state.zoom = this.pendingZoom;
    state.run = this.isDown('run');

    this.updateButton(state.jump, 'jump');
    this.updateButton(state.interact, 'interact');
    this.updateButton(state.handbrake, 'handbrake');
    this.updateButton(state.horn, 'horn');

    this.clearPending();
  }

  private clearPending(): void {
    this.pendingLookX = 0;
    this.pendingLookY = 0;
    this.pendingZoom = 0;
    this.pressedSinceSnapshot.clear();
    this.releasedSinceSnapshot.clear();
  }

  private neutralise(button: Pressed): void {
    button.down = false;
    button.pressedThisFrame = false;
    button.releasedThisFrame = false;
  }

  /**
   * Edges come from what happened since the previous snapshot, not from comparing to the
   * previous frame's `down`, so a press and release inside one frame still registers.
   */
  private updateButton(button: Pressed, action: InputAction): void {
    const codes = BINDINGS[action];
    let down = false;
    let pressed = false;
    let released = false;
    for (const code of codes) {
      if (this.held.has(code)) down = true;
      if (this.pressedSinceSnapshot.has(code)) pressed = true;
      if (this.releasedSinceSnapshot.has(code)) released = true;
    }
    button.down = down;
    button.pressedThisFrame = pressed;
    button.releasedThisFrame = released;
  }

  private isDown(action: InputAction): boolean {
    for (const code of BINDINGS[action]) {
      if (this.held.has(code)) return true;
    }
    return false;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (PREVENT_DEFAULT_CODES.includes(event.code)) event.preventDefault();
    // Auto-repeat must not re-fire the press edge.
    if (event.repeat) return;
    this.held.add(event.code);
    this.pressedSinceSnapshot.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
    this.releasedSinceSnapshot.add(event.code);
  };

  /** Losing focus with keys held would otherwise leave the player walking forever. */
  private readonly handleBlur = (): void => {
    for (const code of this.held) this.releasedSinceSnapshot.add(code);
    this.held.clear();
    this.dragging = false;
  };

  private readonly handleCanvasClick = (): void => {
    if (this.blocked || document.pointerLockElement === this.canvas) return;
    // Chromium returns a promise here; Firefox and Safari return void.
    const result: unknown = this.canvas.requestPointerLock();
    if (result instanceof Promise) {
      result.catch((cause: unknown) => {
        this.reportFallback(cause instanceof Error ? cause.message : 'pointer lock was refused');
      });
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    this.pendingZoom += event.deltaY;
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0 && document.pointerLockElement !== this.canvas) this.dragging = true;
  };

  private readonly handleMouseUp = (): void => {
    this.dragging = false;
  };

  /**
   * With pointer lock, movementX/Y is the raw delta. Without it, the drag-to-look
   * fallback uses the same deltas but only while a button is held.
   */
  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement === this.canvas) {
      this.pendingLookX += event.movementX;
      this.pendingLookY += event.movementY;
      return;
    }
    if (!this.dragging) return;
    this.pendingLookX += event.movementX;
    this.pendingLookY += event.movementY;
  };

  /**
   * Escape is handled once: the browser exits pointer lock and the keydown produces the
   * `pause` edge. This handler only records the lock state and the fallback notice, so
   * one Escape never counts as two pause presses.
   */
  private readonly handlePointerLockChange = (): void => {
    if (document.pointerLockElement === this.canvas) return;
    this.dragging = false;
    this.reportFallback('pointer lock released');
  };

  private readonly handlePointerLockError = (): void => {
    this.reportFallback('pointer lock is unavailable in this browser');
  };

  private reportFallback(reason: string): void {
    this.options.onPointerLockUnavailable?.(reason);
  }
}
