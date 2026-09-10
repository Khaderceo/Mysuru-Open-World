// TEMPORARY Phase-1 validation aid — not a system, and not the grey-box world.
//
// M1 requires the page to load "a lit scene with a ground plane and a test box at
// 60 FPS", but T-1.2 correctly stops at the scene root and T-2.4's playground is Phase 2.
// This is the smallest content that makes the render path observable: without it T-1.5
// has no frame rate to demonstrate, T-1.6's renderer.info counters all read zero, and
// T-1.9's smoke assertion `render.calls > 0` fails.
//
// Deliberately NOT __DEV__-gated: it is the visible Phase 1 deliverable and must exist
// in the deployed build. That is what distinguishes it from T-2.4's TestWorld, which is
// __DEV__ + URL-flagged dev content.
//
// It carries no colliders and no input (physics is T-2.1) and configures no shadow map
// (that is T-3.10, fitted and texel-snapped). It is a render-path probe.
//
// RETIREMENT: T-2.4 replaces the geometry with world/TestWorld.ts; T-3.10 replaces the
// lighting with rendering/Lighting.ts and deletes this file. Placeholder scaffolding
// under ASSET_PLAN.md section 10.

import {
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three';

/** Metres. Large enough to read as ground, small enough to stay one draw call. */
const GROUND_SIZE = 24;

/** Metres. A 1 m cube is the scale reference: 1 unit = 1 metre (WORLD_DESIGN section 2). */
const BOX_SIZE = 1;

/** Roughly eye height, so the 1 m box reads at a believable scale. */
const VIEW_HEIGHT = 1.65;

/**
 * Populates the existing scene root and aims the existing camera. Constructs no
 * renderer, scene or camera of its own — all three are owned by T-1.2 and passed in.
 */
export function addValidationScene(scene: Scene, camera: PerspectiveCamera): void {
  // Warm dusty key light plus a cool sky bounce: enough to show that the lighting path
  // and tone mapping are working, without standing in for T-3.10's day/night rig.
  const sky = new HemisphereLight(0xbfd4ff, 0x6b5a42, 1.1);
  const sun = new DirectionalLight(0xffe8c4, 2.4);
  sun.position.set(4, 6, 3);
  scene.add(sky, sun);

  const ground = new Mesh(
    new PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new MeshStandardMaterial({ color: new Color(0x6d6152), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  // Shadows are T-3.10's; ground never casts in any case (PERFORMANCE.md section 4.10).
  ground.castShadow = false;
  ground.receiveShadow = false;
  scene.add(ground);

  const box = new Mesh(
    new BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE),
    new MeshStandardMaterial({ color: new Color(0xc0703a), roughness: 0.6 }),
  );
  // Resting on the ground, so its height is directly comparable to the view height.
  box.position.set(0, BOX_SIZE / 2, 0);
  box.castShadow = false;
  scene.add(box);

  // T-1.2 creates the camera but nothing positions it until T-2.6's CameraSystem, so it
  // would otherwise sit at the origin inside the box. Aiming it here is what makes the
  // scene actually visible, which is this task's whole purpose.
  camera.position.set(3.2, VIEW_HEIGHT, 4.2);
  camera.lookAt(0, BOX_SIZE / 2, 0);
}
