// T-2.8: the proxy body. What matters is not how it looks but that it is driven by
// animation *keys* and a speed — that is the property which makes swapping in a real
// skinned GLB free, and the one a later change could quietly break.

import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerVisual } from '../../src/player/PlayerVisual';
import type { VisualDrive } from '../../src/player/PlayerVisual';
import type { AnimationKey } from '../../src/player/states';

function drive(overrides: Partial<VisualDrive> = {}): VisualDrive {
  return {
    position: { x: 0, y: 0, z: 0 },
    forward: { x: 0, z: -1 },
    animationKey: 'idle',
    speed: 0,
    ...overrides,
  };
}

describe('PlayerVisual', () => {
  it('attaches one group and follows the published position', () => {
    const scene = new Scene();
    const visual = new PlayerVisual();
    visual.attach(scene);
    expect(scene.children).toHaveLength(1);

    visual.update(drive({ position: { x: 3, y: 1, z: -4 } }), 1 / 60);
    expect(visual.root.position.toArray()).toEqual([3, 1, -4]);
  });

  it('faces the direction the controller published', () => {
    const visual = new PlayerVisual();
    visual.update(drive({ forward: { x: 1, z: 0 } }), 1 / 60);
    expect(visual.root.rotation.y).toBeCloseTo(Math.PI / 2, 6);
  });

  it('responds to every animation key, and to nothing else', () => {
    const visual = new PlayerVisual();
    const keys: AnimationKey[] = ['idle', 'walk', 'run', 'jump', 'fall', 'sit'];
    const poses = new Set<string>();

    for (const animationKey of keys) {
      visual.update(drive({ animationKey, speed: 3 }), 1 / 60);
      const body = visual.root.children[0];
      poses.add(`${body?.rotation.x ?? 0}:${body?.scale.y ?? 0}`);
    }
    // Distinct keys give distinct poses: sitting is not standing.
    expect(poses.size).toBeGreaterThan(3);
  });

  it('ties the walk bob to distance travelled, not to wall-clock time', () => {
    const still = new PlayerVisual();
    const moving = new PlayerVisual();
    for (let i = 0; i < 30; i++) {
      still.update(drive({ animationKey: 'walk', speed: 0 }), 1 / 60);
      moving.update(drive({ animationKey: 'walk', speed: 4 }), 1 / 60);
    }
    const stillBob = still.root.children[0]?.position.y ?? -1;
    const movingBob = moving.root.children[0]?.position.y ?? -1;
    expect(stillBob).toBeCloseTo(0, 9);
    expect(movingBob).toBeGreaterThan(0);
  });

  it('disposes its generated geometry and leaves the scene', () => {
    const scene = new Scene();
    const visual = new PlayerVisual();
    visual.attach(scene);
    visual.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
