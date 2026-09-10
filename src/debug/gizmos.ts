// Dev-only scene gizmos. Dead-code-eliminated with the rest of `debug/` in production.
//
// PERFORMANCE.md section 7 lists several debug toggles; only wireframe is implementable
// today, because it needs nothing but the existing scene. The others arrive with the
// systems they inspect: collider visualisation in T-2.3 (debug/colliderView.ts), the
// lane/sidewalk overlay in T-3.4 (debug/roadView.ts), chunk boundaries and freeze-
// streaming in T-3.5, and quality presets in T-11.7. No registry is invented here for
// gizmos that do not exist yet.

import { Mesh, type Object3D } from 'three';

/**
 * Toggles wireframe on every material currently in the scene and returns the new state.
 * Materials added later are unaffected until it is toggled again, which is acceptable
 * for a manual inspection tool.
 */
export function setWireframe(root: Object3D, enabled: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      // `wireframe` exists on every material this project uses, but not on the base
      // Material type, so it is probed rather than assumed.
      if ('wireframe' in material) {
        (material as { wireframe: boolean }).wireframe = enabled;
      }
    }
  });
}
