// src/main/logger-types.ts
//
// Minimal structured logger contract used by ORAIN-0601-instrumented
// modules. The shape is intentionally narrow so callers (production:
// electron-log via ./logger.ts; tests: capturing fakes) can plug in
// without dragging the whole transport API around.
//
// We define this in its own module — not inside secret-tool.adapter —
// so multiple instrumented modules can depend on the same interface
// without circular imports through the central logger.

export interface Logger {
  error(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  debug(message: string, context?: unknown): void;
}

/**
 * Build a Logger backed by electron-log. Provided here (rather than
 * re-exported from ./logger) so the secret-tool adapter can stay
 * independent of the main process boot order — it imports the factory
 * lazily and never references `console` directly.
 */
export function createElectronLogger(): Logger {
  // Lazy require: keep the production adapter free of module-load side
  // effects from electron-log's file transport until a call is made.
  // Tests pass a different logger; production callers wire this in
  // once `configureLogger()` has run.
  //
  // We adapt electron-log's `log` to the `Logger` interface rather than
  // re-declaring the four method signatures inline — the wrapper holds
  // the actual structural shape that `Logger` declares, so any future
  // method added to `Logger` only needs to be routed here once
  // (ORAIN-0601 review HIGH finding). The cast is `unknown`-bridged
  // because electron-log's signatures are `(...params: any[]): void`
  // while `Logger` expects `(message: string, context?: unknown): void`;
  // the wrapper below dispatches in the shape we actually call.
  const electronLog = require('./logger').log as unknown as Record<
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
