// Owns the scene root.
//
// Lighting, sky, fog and materials arrive in T-3.10; the day/night driver in T-9.1.
// This module deliberately holds only the root and its clear colour so that everything
// added later has one documented parent.

import { Color, Scene } from 'three';

/** Placeholder clear colour, replaced by the sky dome and fog in T-3.10. */
export const CLEAR_COLOR = 0x1b1712;

export function createScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(CLEAR_COLOR);
  return scene;
}
