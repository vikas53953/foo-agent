// Spec: 09-windows §9.5 (single instance, `--hidden` semantics), §9.23.4 (uninstall helper, X-124), §9.3.2 (readiness at
// the end of install); CR-0018 G-M14-14 (`--install-readiness`), G-M14-15 (`--uninstall-probe`, `--uninstall-quit`).
// The four installer/uninstaller switches are non-interactive: they never open a window or the tray and never take focus.
// Two of them run in a fresh process that holds the single-instance lock (the helpers); two are messages to the foo that
// is already running, delivered through `second-instance`. Handlers are registered by M14 T2 (installer) and T4 (wipe).

export const CLI_COMMANDS = ['install-readiness', 'uninstall-cleanup', 'uninstall-probe', 'uninstall-quit'] as const;
export type CliCommand = (typeof CLI_COMMANDS)[number];

/** Where the switch arrived: in this process's own argv, or from a second launch while this foo runs. */
export type CliWhere = 'primary' | 'second-instance';

/** Who may run each command. Helpers need the lock (refused while another foo runs, 09 §9.23.4); messages need a running foo. */
export const CLI_RUNS_IN: Record<CliCommand, CliWhere> = {
  'install-readiness': 'primary',
  'uninstall-cleanup': 'primary',
  'uninstall-probe': 'second-instance',
  'uninstall-quit': 'second-instance',
};

/** Process exit codes the installer and uninstaller read (NSIS `ExecWait` return value). */
export const CLI_EXIT = { ok: 0, failed: 1, refused: 2, noHandler: 3 } as const;

export interface CliInvocation {
  command: CliCommand;
  /** `--key=value` and `--key "value"` options after the command, e.g. `{ mode: 'delete', 'export-to': 'D:\\copy' }`. */
  options: Record<string, string>;
}

export type CliHandler = (inv: CliInvocation) => number | Promise<number>;

export type CliRoute =
  | { kind: 'none' }
  | { kind: 'handled'; command: CliCommand; done: Promise<number> }
  | { kind: 'refused'; command: CliCommand; reason: 'NO_RUNNING_INSTANCE' | 'INSTANCE_RUNNING' | 'NO_HANDLER' };

const handlers = new Map<CliCommand, CliHandler>();

/** T2 and T4 register their handler once at startup; a second registration for the same command is a bug. */
export function registerCliHandler(command: CliCommand, handler: CliHandler): void {
  if (handlers.has(command)) throw new Error(`cli handler already registered: ${command}`);
  handlers.set(command, handler);
}

/** Test seam: forget every registration. */
export function clearCliHandlers(): void {
  handlers.clear();
}

/** The first installer switch in argv and its options; null for a normal launch (`--hidden`, `foo://…` and the rest). */
export function parseCliArgv(argv: readonly string[]): CliInvocation | null {
  const at = argv.findIndex((a) => a.startsWith('--') && (CLI_COMMANDS as readonly string[]).includes(a.slice(2)));
  if (at < 0) return null;
  const command = argv[at]!.slice(2) as CliCommand;
  const options: Record<string, string> = {};
  for (let i = at + 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq > 2) options[arg.slice(2, eq)] = arg.slice(eq + 1);
    else {
      const next = argv[i + 1];
      const value = next !== undefined && !next.startsWith('--') ? next : '';
      options[arg.slice(2)] = value;
      if (value) i++;
    }
  }
  return { command, options };
}

/**
 * Exit code for a switch whose process lost the single-instance lock: a helper is refused (09 §9.23.4, never while foo runs);
 * a message for the running foo lost it on purpose (Electron hands its argv to that foo's `second-instance`), so it is ok.
 */
export const lockLostExitCode = (inv: CliInvocation): number =>
  CLI_RUNS_IN[inv.command] === 'second-instance' ? CLI_EXIT.ok : CLI_EXIT.refused;

/**
 * Routes one argv. `none`: a normal launch, carry on. `refused`: the command cannot run here (a helper while another foo
 * holds the lock, a message to a foo that is not running, or no handler yet); the caller exits with `CLI_EXIT.refused` /
 * `noHandler` and, in `second-instance`, must not focus the window. `handled`: `done` resolves to the exit code.
 */
export function routeArgv(argv: readonly string[], where: CliWhere): CliRoute {
  const inv = parseCliArgv(argv);
  if (!inv) return { kind: 'none' };
  const runsIn = CLI_RUNS_IN[inv.command];
  if (runsIn !== where)
    return { kind: 'refused', command: inv.command, reason: runsIn === 'primary' ? 'INSTANCE_RUNNING' : 'NO_RUNNING_INSTANCE' };
  const handler = handlers.get(inv.command);
  if (!handler) return { kind: 'refused', command: inv.command, reason: 'NO_HANDLER' };
  const done = Promise.resolve()
    .then(() => handler(inv))
    .catch(() => CLI_EXIT.failed);
  return { kind: 'handled', command: inv.command, done };
}

/** The exit code for a route that will not run a handler. */
export function refusedExitCode(route: Extract<CliRoute, { kind: 'refused' }>): number {
  return route.reason === 'NO_HANDLER' ? CLI_EXIT.noHandler : CLI_EXIT.refused;
}

// Handlers: T2 registers 'install-readiness'; T4 registers 'uninstall-cleanup', 'uninstall-probe' and 'uninstall-quit'.
// The helpers register before `routeArgv(process.argv, 'primary')` runs; the two messages register once the running
// foo's AppContext exists (a switch that arrives before then is refused with NO_HANDLER and the uninstaller falls back).
