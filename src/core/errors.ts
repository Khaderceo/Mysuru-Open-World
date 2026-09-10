// The single route for every error the game reports (ARCHITECTURE.md section 8).
//
// Three tiers:
//   fatal       — no WebGL2, corrupt core asset, renderer creation failure. Stop the
//                 loop, show a fullscreen panel with a plain-language cause and a
//                 Reload action, log once with context.
//   degraded    — optional asset missing, audio blocked, save unreadable. Continue with
//                 a substitute and log a warning with the context that identifies it.
//   recoverable — one chunk build failure, one texture 404. The owning system retries
//                 with backoff, then marks the item failed; this records it.
//
// Nothing is ever swallowed, and no `catch {}` exists anywhere. Presentation is
// injected, so `core` does not depend on `ui`.

export type ErrorTier = 'fatal' | 'degraded' | 'recoverable';

/** Machine-readable context: an asset key, chunk id, system id, and so on. */
export type ErrorContext = Readonly<Record<string, string | number | boolean>>;

export interface ErrorReport {
  readonly tier: ErrorTier;
  /** Stable identifier, e.g. 'capability.webgl2'. Used to log each problem once. */
  readonly code: string;
  /** Plain language, addressed to the player. Shown verbatim for fatal errors. */
  readonly message: string;
  readonly context?: ErrorContext | undefined;
  readonly cause?: unknown;
}

export interface ErrorReporterOptions {
  /**
   * Presents a fatal error and stops anything still running. Wired by the bootstrap to
   * FatalPanel; nothing else may present errors.
   */
  readonly presentFatal: (report: ErrorReport) => void;
}

export class ErrorReporter {
  private readonly options: ErrorReporterOptions;
  /** Codes already logged, so a repeating failure does not flood the console. */
  private readonly logged = new Set<string>();
  private fatalPresented = false;
  private handlersInstalled = false;

  constructor(options: ErrorReporterOptions) {
    this.options = options;
  }

  fatal(code: string, message: string, context?: ErrorContext, cause?: unknown): void {
    this.report({ tier: 'fatal', code, message, context, cause });
  }

  degraded(code: string, message: string, context?: ErrorContext, cause?: unknown): void {
    this.report({ tier: 'degraded', code, message, context, cause });
  }

  recoverable(code: string, message: string, context?: ErrorContext, cause?: unknown): void {
    this.report({ tier: 'recoverable', code, message, context, cause });
  }

  /** True once a fatal error has been presented, so callers can stop doing work. */
  get hasFatal(): boolean {
    return this.fatalPresented;
  }

  /**
   * Routes uncaught errors and rejections to the fatal tier, so a crash shows the panel
   * instead of leaving a frozen or blank page.
   */
  installGlobalHandlers(): void {
    if (this.handlersInstalled || typeof window === 'undefined') return;
    window.addEventListener('error', this.handleErrorEvent);
    window.addEventListener('unhandledrejection', this.handleRejection);
    this.handlersInstalled = true;
  }

  dispose(): void {
    if (!this.handlersInstalled) return;
    window.removeEventListener('error', this.handleErrorEvent);
    window.removeEventListener('unhandledrejection', this.handleRejection);
    this.handlersInstalled = false;
  }

  private report(report: ErrorReport): void {
    this.logOnce(report);
    if (report.tier !== 'fatal') return;
    // Only the first fatal is presented: a crash during teardown must not stack panels
    // over the original cause, which is the one worth reading.
    if (this.fatalPresented) return;
    this.fatalPresented = true;
    this.options.presentFatal(report);
  }

  private logOnce(report: ErrorReport): void {
    const key = `${report.tier}:${report.code}`;
    if (this.logged.has(key)) return;
    this.logged.add(key);

    const prefix = `[mow] ${report.tier} ${report.code}: ${report.message}`;
    const context = report.context ?? {};
    if (report.tier === 'fatal') console.error(prefix, context, report.cause);
    else console.warn(prefix, context, report.cause);
  }

  private readonly handleErrorEvent = (event: ErrorEvent): void => {
    this.fatal(
      'runtime.uncaught',
      'Something went wrong and the game had to stop.',
      { source: event.filename, line: event.lineno, column: event.colno },
      event.error ?? event.message,
    );
  };

  private readonly handleRejection = (event: PromiseRejectionEvent): void => {
    this.fatal(
      'runtime.unhandled-rejection',
      'Something went wrong and the game had to stop.',
      {},
      event.reason,
    );
  };
}
