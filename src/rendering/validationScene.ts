// TEMPORARY Phase-1 lighting aid — not a system, and not the grey-box world.
//
// Its geometry is gone: T-2.4 retired the ground plane and test box in favour of
// world/TestWorld.ts, so there is never a second ground plane. What remains is the
// lighting and the camera placement, both of which have no owner yet — T-3.10 lands
// rendering/Lighting.ts and T-2.6 lands the camera rig, and this file is deleted when the
// first of those makes it redundant.
//
// Consequence worth knowing, recorded in TASKS.md T-2.4: the grey-box world is dev/e2e
// content, so a production build now renders a lit but empty scene until Phase 3 lands
// the real world. That is what the documents prescribe, not an oversight.
//
// It configures no shadow map (that is T-3.10, fitted and texel-snapped). Placeholder
// scaffolding under ASSET_PLAN.md section 10.

import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene } from 'three';

/** Roughly eye height, so the scene reads at a believable scale. */
const VIEW_HEIGHT = 1.65;

/**
 * Lights the existing scene root and aims the existing camera. Constructs no renderer,
 * scene or camera of its own — all three are owned by T-1.2 and passed in.
 */
export function addValidationScene(scene: Scene, camera: PerspectiveCamera): void {
  // Warm dusty key light plus a cool sky bounce: enough to show that the lighting path
  // and tone mapping are working, without standing in for T-3.10's day/night rig.
  const sky = new HemisphereLight(0xbfd4ff, 0x6b5a42, 1.1);
  const sun = new DirectionalLight(0xffe8c4, 2.4);
  sun.position.set(4, 6, 3);
  scene.add(sky, sun);

  // T-1.2 creates the camera but nothing positions it until T-2.6's CameraSystem, so it
  // would otherwise sit at the origin. Aiming it at the grey-box world's kerbs is what
  // makes that content visible while the rig is still to come.
  camera.position.set(6, VIEW_HEIGHT + 2.5, 14);
  camera.lookAt(0, 0.5, 0);
}
