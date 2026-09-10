// Controls the loading screen that index.html paints before any JavaScript parses
// (UI_ARCHITECTURE.md section 4, WEB_ARCHITECTURE.md section 2).
//
// In Phase 1 progress is the system-init step count, because there are no assets yet.
// T-2.8 extends this with byte-weighted asset progress and pending asset keys; it does
// not replace it.

/** Milliseconds without progress before the screen explains what it is waiting for. */
const STALL_TIMEOUT_MS = 20_000;

export class LoadingScreen {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly stalled: HTMLElement;

  private phase = 'Loading';
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private hidden = false;

  /** Queries the static markup. A mismatch is a build-time mistake, not a runtime case. */
  constructor() {
    const root = document.getElementById('boot');
    const status = document.getElementById('boot-status');
    const bar = document.getElementById('boot-bar');
    const stalled = document.getElementById('boot-stalled');
    if (root === null || status === null || bar === null || stalled === null) {
      throw new Error('LoadingScreen: index.html is missing the #boot markup');
    }
    this.root = root;
    this.status = status;
    this.bar = bar;
    this.stalled = stalled;
    this.armStallTimer();
  }

  /** Sets the phase label, e.g. "Starting renderer". Counts as progress. */
  setPhase(label: string): void {
    this.phase = label;
    this.status.textContent = label;
    this.armStallTimer();
  }

  /** Reports step progress against the current phase. Counts as progress. */
  setProgress(completed: number, total: number): void {
    const fraction = total > 0 ? completed / total : 0;
    this.bar.style.width = `${String(Math.round(fraction * 100))}%`;
    this.status.textContent = `${this.phase} (${String(completed)}/${String(total)})`;
    this.armStallTimer();
  }

  hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    this.clearStallTimer();
    this.root.hidden = true;
  }

  dispose(): void {
    this.clearStallTimer();
  }

  /**
   * Never an indefinite spinner: after STALL_TIMEOUT_MS with no progress the screen says
   * what it is still waiting for, so a hang is diagnosable instead of mysterious.
   */
  private armStallTimer(): void {
    this.clearStallTimer();
    if (this.hidden) return;
    this.stalled.textContent = '';
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      this.stalled.textContent =
        `Still waiting on: ${this.phase} — no progress for ` +
        `${String(Math.round(STALL_TIMEOUT_MS / 1000))}s. Reloading may help.`;
    }, STALL_TIMEOUT_MS);
  }

  private clearStallTimer(): void {
    if (this.stallTimer === null) return;
    clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }
}
