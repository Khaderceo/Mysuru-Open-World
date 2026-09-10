// Owns the game's single PerspectiveCamera instance.
//
// Every other system *drives* this camera; nothing else constructs one. In particular
// camera/CameraSystem.ts (T-2.6) reads and writes this instance's transform and FOV
// rather than creating its own, so there is exactly one projection in the project.

import { PerspectiveCamera } from 'three';

/** Walk-mode default. Vertical FOV, so wider windows reveal more horizontally. */
export const DEFAULT_FOV_DEG = 60;

/** CAMERA_ARCHITECTURE.md section 7. Near is tight enough for a 0.35 m capsule; */
/** far covers the Chamundi silhouette and the sky dome, with fog occluding by ~250 m. */
export const NEAR_PLANE = 0.15;
export const FAR_PLANE = 600;

export function createCamera(aspect: number): PerspectiveCamera {
  return new PerspectiveCamera(DEFAULT_FOV_DEG, aspect, NEAR_PLANE, FAR_PLANE);
}
