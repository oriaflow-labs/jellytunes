// src/main/logger-types.ts
//
// Minimal structured logger contract used by ORAIN-0601-instrumented
// modules. The shape is intentionally narrow so callers (production:
// electron-log via ./logger.ts; tests: capturing fakes) can plug in
// without dragging the whole transport API around.
//
// We define this in its own module — not inside secret-tool.adapter —
// so multiple instrumented modules can depend on the same interface
// without circular imports through the central logger. Instrumented
// modules import only the `Logger` type; the electron-log-backed factory
// below is wired once from `src/main/index.ts`.

import { log } from './logger';

export interface Logger {
  error(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  debug(message: string, context?: unknown): void;
}

/**
 * Build a Logger backed by electron-log. Provided here (rather than
 * re-exported from ./logger) so instrumented modules depend only on the
 * narrow `Logger` interface and never reference `console` directly.
 *
 * Boot order: `src/main/index.ts` imports `./logger` and runs
 * `configureLogger()` eagerly (lines 137-138) before the only production
 * call site of this factory, so the transports are already configured by
 * the time a logger is built here.
 */
export function createElectronLogger(): Logger {
  // Static import of `./logger` (ORAIN-0614). This used to be a runtime
  // `require('./logger')`, justified as "lazy" to defer electron-log's
  // file-transport side effects. That justification never held — index.ts
  // already imports and configures the logger eagerly at boot — and the
  // dynamic require broke packaged builds: electron-vite bundles the main
  // process into a single `dist/main/index.js` via Rollup, which rewrites
  // static imports but leaves `require()` calls untouched, so
  // `dist/main/logger.js` did not exist and the call threw
  // `Cannot find module './logger'`, aborting secure-storage init.
  //
  // We adapt electron-log's `log` to the `Logger` interface rather than
  // re-declaring the four method signatures inline — the wrapper holds
  // the actual structural shape that `Logger` declares, so any future
  // method added to `Logger` only needs to be routed here once
  // (ORAIN-0601 review HIGH finding). The cast is `unknown`-bridged
  // because electron-log's signatures are `(...params: any[]): void`
  // while `Logger` expects `(message: string, context?: unknown): void`;
  // the wrapper below dispatches in the shape we actually call.
  const electronLog = log as unknown as Record<
    'error' | 'warn' | 'info' | 'debug',
    (msg: string, ctx?: unknown) => void
  >;
  // Build the adapter by referencing `Logger` itself — if `Logger` gains
  // a method and we forget to route it, TypeScript will fail to compile
  // because the literal won't satisfy the interface anymore.
  const logger: Logger = {
    error: (m, c) => electronLog.error(m, c),
    warn: (m, c) => electronLog.warn(m, c),
    info: (m, c) => electronLog.info(m, c),
    debug: (m, c) => electronLog.debug(m, c),
  };
  return logger;
}
