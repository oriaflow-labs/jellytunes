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
  const log = require('./logger').log as {
    error: (msg: string, ctx?: unknown) => void;
    warn: (msg: string, ctx?: unknown) => void;
    info: (msg: string, ctx?: unknown) => void;
    debug: (msg: string, ctx?: unknown) => void;
  };
  return {
    error: (m, c) => log.error(m, c),
    warn: (m, c) => log.warn(m, c),
    info: (m, c) => log.info(m, c),
    debug: (m, c) => log.debug(m, c),
  };
}
