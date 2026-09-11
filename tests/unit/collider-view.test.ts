// T-2.3. The task's documented validation is manual, which this session cannot perform,
// so the mechanical parts are asserted here instead: that the view reads a real
// CollisionWorld, that it draws colliders, cells and the capsule, that one material is
// shared, and that it rebuilds only when the world changes. How it *looks* still needs an
// eye on it.

import { LineSegments, Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../../src/physics/CollisionWorld';
import { ColliderView } from '../../src/debug/colliderView';
import type { Collider } from '../../src/physics/shapes';

function box(center: [number, number, number], halfExtents: [number, number, number]): Collider {
  return {
    kind: 'box',
    center: new Vector3(...center),
    halfExtents: new Vector3(...halfExtents),
    yaw: 0,
  };
}

/** The view's two LineSegments, in the order it adds them: static geometry, then capsule. */
function lines(root: Object3D): LineSegments[] {
  return root.children.filter((child): child is LineSegments => child instanceof LineSegments);
}

function vertexCounts(root: Object3D): number[] {
  return lines(root).map((line) => line.geometry.getAttribute('position')?.count ?? 0);
}

function positionAttribute(line: LineSegments): object | undefined {
  return line.geometry.getAttribute('position');
}

describe('ColliderView', () => {
  it('adds nothing to the scene until it is shown', () => {
    const root = new Object3D();
    const view = new ColliderView(root);
    expect(root.children).toHaveLength(0);
    expect(view.visible).toBe(false);

    view.setVisible(true);
    expect(root.children).toHaveLength(2);
    expect(view.visible).toBe(true);
  });

  it('draws every collider and every occupied cell', () => {
    const world = new CollisionWorld();
    world.add(box([0, 1, 0], [1, 1, 1]));
    world.add(box([40, 1, 0], [1, 1, 1])); // a second, distant cell

    const root = new Object3D();
    const view = new ColliderView(root);
    view.setVisible(true);
    view.sync(world, null);

    // 12 edges per collider and 4 per cell, two vertices each. The cell count comes from
    // the world rather than a guess: a 2 m box straddles an 8 m boundary and so occupies
    // four cells, not one.
    let colliders = 0;
    let cells = 0;
    world.forEachCollider(() => colliders++);
    world.forEachOccupiedCell(() => cells++);
    expect(colliders).toBe(2);
    expect(cells).toBe(8);
    expect(vertexCounts(root)[0]).toBe(colliders * 12 * 2 + cells * 4 * 2);
  });

  it('rebuilds only when the world changes', () => {
    const world = new CollisionWorld();
    const id = world.add(box([0, 1, 0], [1, 1, 1]));

    const root = new Object3D();
    const view = new ColliderView(root);
    view.setVisible(true);
    view.sync(world, null);

    const staticLines = lines(root)[0];
    expect(staticLines).toBeDefined();
    if (staticLines === undefined) return;
    const attributeBefore = positionAttribute(staticLines);

    // Nothing changed: the same attribute object must survive the sync.
    view.sync(world, null);
    expect(positionAttribute(staticLines)).toBe(attributeBefore);

    // Remove a collider and the revision moves, so the geometry is rebuilt.
    world.remove(id);
    view.sync(world, null);
    expect(positionAttribute(staticLines)).not.toBe(attributeBefore);
    expect(vertexCounts(root)[0]).toBe(0);
  });

  it('draws the player capsule where the player is, and hides it when there is none', () => {
    const world = new CollisionWorld();
    const root = new Object3D();
    const view = new ColliderView(root);
    view.setVisible(true);

    const capsule = { x: 3, y: 0, z: -4, radius: 0.35, height: 1.8 };
    view.sync(world, { debugCapsule: () => capsule });

    const capsuleLines = lines(root)[1];
    expect(capsuleLines).toBeDefined();
    if (capsuleLines === undefined) return;
    expect(capsuleLines.visible).toBe(true);
    expect(capsuleLines.position.toArray()).toEqual([3, 0, -4]);
    expect(vertexCounts(root)[1]).toBeGreaterThan(0);

    // Moving the player is a transform, not a rebuild.
    const attribute = positionAttribute(capsuleLines);
    capsule.x = 9;
    view.sync(world, { debugCapsule: () => capsule });
    expect(capsuleLines.position.x).toBe(9);
    expect(positionAttribute(capsuleLines)).toBe(attribute);

    view.sync(world, { debugCapsule: () => null });
    expect(capsuleLines.visible).toBe(false);
  });

  it('shares one line material across the whole view', () => {
    const root = new Object3D();
    const view = new ColliderView(root);
    view.setVisible(true);

    const materials = lines(root).map((line) => line.material);
    expect(materials).toHaveLength(2);
    expect(materials[0]).toBe(materials[1]);
  });

  it('does no work while hidden', () => {
    const world = new CollisionWorld();
    world.add(box([0, 1, 0], [1, 1, 1]));

    const root = new Object3D();
    const view = new ColliderView(root);
    view.sync(world, null);

    expect(root.children).toHaveLength(0);
  });
});
