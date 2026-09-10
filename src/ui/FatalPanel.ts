// The fullscreen panel for the fatal tier (ARCHITECTURE.md section 8).
//
// Built on first use, so it costs nothing on a healthy boot, and appended to <body>
// rather than the #ui overlay because it must work when the game never started.

import type { ErrorReport } from '../core/errors';

export class FatalPanel {
  private root: HTMLDivElement | null = null;

  /** Shows the panel. Only the first call renders; later fatals are already logged. */
  show(report: ErrorReport): void {
    if (this.root !== null) return;

    const root = document.createElement('div');
    root.id = 'fatal';
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute(
      'style',
      'position:fixed;inset:0;z-index:10000;display:grid;place-content:center;' +
        'gap:1rem;padding:2rem;text-align:center;background:#14110e;color:#e8e0d4;' +
        'font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif',
    );

    const title = document.createElement('strong');
    title.textContent = 'Mysuru Open World cannot start';
    title.setAttribute('style', 'font-size:1.15rem');

    const message = document.createElement('p');
    message.textContent = report.message;
    message.setAttribute('style', 'margin:0;max-width:46ch');

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Reload';
    button.setAttribute(
      'style',
      'justify-self:center;padding:.5rem 1.25rem;font:inherit;cursor:pointer;' +
        'color:#14110e;background:#e8e0d4;border:0;border-radius:4px',
    );
    button.addEventListener('click', () => {
      window.location.reload();
    });

    // The code is for bug reports, so it is present but visually subordinate.
    const code = document.createElement('small');
    code.textContent = report.code;
    code.setAttribute('style', 'opacity:.55');

    root.append(title, message, button, code);
    document.body.appendChild(root);
    this.root = root;
    button.focus();
  }

  dispose(): void {
    this.root?.remove();
    this.root = null;
  }
}
