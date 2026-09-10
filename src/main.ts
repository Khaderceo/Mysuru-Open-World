// Bootstrap only. Per ARCHITECTURE.md section 1 this file never grows game logic:
// it reads config, mounts the canvas, constructs Game and starts it.
//
// T-1.1 scaffolds the shell. The real bootstrap lands incrementally:
//   T-1.2  renderer + scene + camera        (rendering/)
//   T-1.3  Game runtime, systems, context   (core/)
//   T-1.5  loop + scheduler                 (core/)
//   T-1.7  capability gate + loading screen (core/errors.ts, ui/)
//
// NOTE: nothing imports `three` yet. It is installed and pinned, but it ships no
// TypeScript declarations of its own, so the first real import (T-1.2) needs a
// decision on `@types/three` — see the T-1.1 completion report. Not a blocker here.

const boot = document.getElementById('boot');
const bootStatus = document.getElementById('boot-status');
const canvas = document.getElementById('game');

if (!(canvas instanceof HTMLCanvasElement) || !boot || !bootStatus) {
  // index.html and this file are edited together; a mismatch is a build-time mistake,
  // not a runtime condition to recover from.
  throw new Error('main: index.html is missing #game, #boot or #boot-status');
}

bootStatus.textContent = 'Scaffold ready';

if (__DEV__) {
  console.info(`[mow] dev bootstrap · e2e=${String(__E2E__)}`);
}
