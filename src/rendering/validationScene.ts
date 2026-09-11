// TEMPORARY Phase-1 lighting aid — not a system, and not the grey-box world.
//
// Its geometry went with T-2.4 (world/TestWorld.ts owns the ground now) and its camera
// placement went with T-2.6 (camera/CameraSystem.ts owns the camera). What remains is the
// lighting, which has no owner until T-3.10 lands rendering/Lighting.ts — at which point
// this file is deleted.
//
// Consequence worth knowing, recorded in TASKS.md T-2.4: the grey-box world is dev/e2e
// content, so a production build now renders a lit but empty scene until Phase 3 lands
// the real world. That is what the documents prescribe, not an oversight.
//
// It configures no shadow map (that is T-3.10, fitted and texel-snapped). Placeholder
// scaffolding under ASSET_PLAN.md section 10.

import { DirectionalLight, HemisphereLight, Scene } from 'three';

/**
 * Lights the existing scene root. Constructs no renderer, scene or camera of its own —
 * all three are owned by T-1.2 and passed in.
 */
export function addValidationScene(scene: Scene): void {
  // Warm dusty key light plus a cool sky bounce: enough to show that the lighting path
  // and tone mapping are working, without standing in for T-3.10's day/night rig.
  const sky = new HemisphereLight(0xbfd4ff, 0x6b5a42, 1.1);
  const sun = new DirectionalLight(0xffe8c4, 2.4);
  sun.position.set(4, 6, 3);
  scene.add(sky, sun);
}
