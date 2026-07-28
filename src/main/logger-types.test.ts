// src/main/logger-types.test.ts
//
// ORAIN-0614: these tests cover the *mechanism* by which
// `createElectronLogger()` gets hold of the electron-log instance.
//
// Honest limitation (same spirit as ORAIN-0601 AC5): this suite would NOT
// have caught the bug it was written for. The regression was that
// `createElectronLogger()` resolved `./logger` through a runtime
// `require()`, which Rollup does not rewrite when electron-vite bundles the
// main process into a single `dist/main/index.js` — so the module was
// missing at runtime in packaged Snap builds only. Vitest resolves modules
// from source, never from the bundle, so no unit test in this file can
// observe bundling behaviour. AC2 is verified by inspecting the built
// `dist/main/index.js`; AC3 by a clean VM install.
//
// What these tests do lock in: the factory routes every `Logger` method to
// the electron-log instance, and it obtains that instance through a
// module-graph binding (mockable via `vi.mock`) rather than a runtime
// filesystem lookup.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ level: string; message: string; context?: unknown }> = [];

vi.mock('./logger', () => ({
  log: {
    error: (message: string, context?: unknown) => calls.push({ level: 'error', message, context }),
    warn: (message: string, context?: unknown) => calls.push({ level: 'warn', message, context }),
    info: (message: string, context?: unknown) => calls.push({ level: 'info', message, context }),
    debug: (message: string, context?: unknown) => calls.push({ level: 'debug', message, context }),
  },
  configureLogger: () => undefined,
}));

import { createElectronLogger } from './logger-types';

describe('createElectronLogger', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('builds a logger without throwing', () => {
    expect(() => createElectronLogger()).not.toThrow();
  });

  it('exposes the four Logger methods', () => {
    const logger = createElectronLogger();
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('routes each level to the electron-log instance with message and context', () => {
    const logger = createElectronLogger();

    logger.error('boom', { code: 1 });
    logger.warn('careful', { code: 2 });
    logger.info('fyi', { code: 3 });
    logger.debug('trace', { code: 4 });

    expect(calls).toEqual([
      { level: 'error', message: 'boom', context: { code: 1 } },
      { level: 'warn', message: 'careful', context: { code: 2 } },
      { level: 'info', message: 'fyi', context: { code: 3 } },
      { level: 'debug', message: 'trace', context: { code: 4 } },
    ]);
  });

  it('forwards calls made without a context argument', () => {
    const logger = createElectronLogger();

    logger.info('no context');

    expect(calls).toEqual([{ level: 'info', message: 'no context', context: undefined }]);
  });

  it('resolves electron-log through the module graph, not a runtime require', () => {
    // With a static import, `vi.mock('./logger')` above fully replaces the
    // dependency and the factory never touches the filesystem. A dynamic
    // `require('./logger')` inside the factory would bypass the mock (and,
    // in the ESM test transform, `require` is not even defined).
    const logger = createElectronLogger();
    logger.info('mocked?');

    expect(calls).toHaveLength(1);
    expect(calls[0].message).toBe('mocked?');
  });
});
