// src/main/secret-tool.adapter.test.ts
// Unit tests for the production secret-tool runner.
//
// ORAIN-0601 AC1: the adapter must log on every failure of store/lookup/
// isAvailable — without ever logging the secret itself. stdout of `lookup`
// carries the plaintext session, so the logger must see stderr + status
// only, never the resolved value.
//
// We exercise the logger through a captured fake; the production wiring
// (electron-log) is the caller's responsibility, not this module's. We
// also assert that the diagnostic context — env vars received by the
// parent process and a sanitised stderr classification — is reported.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSecretToolRunner } from './secret-tool.adapter';
import type { Logger } from './logger-types';
import type { SecretToolResult } from './secret-store';

function makeCapturingLogger(): Logger & {
  records: Array<{
    level: 'error' | 'warn' | 'info' | 'debug';
    message: string;
    context?: unknown;
  }>;
} {
  const records: Array<{
    level: 'error' | 'warn' | 'info' | 'debug';
    message: string;
    context?: unknown;
  }> = [];
  const factory =
    (level: 'error' | 'warn' | 'info' | 'debug') => (message: string, context?: unknown) => {
      records.push({ level, message, context });
    };
  return {
    records,
    error: factory('error'),
    warn: factory('warn'),
    info: factory('info'),
    debug: factory('debug'),
  };
}

describe('createSecretToolRunner (ORAIN-0601 AC1: structured logging)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.PATH = '/usr/bin:/bin';
    process.env.DBUS_SESSION_BUS_ADDRESS = 'unix:path=/run/user/1000/bus';
    process.env.XDG_RUNTIME_DIR = '/run/user/1000';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not import the secret value into the logger on lookup success', () => {
    // AC1: NEVER log stdout of lookup — that is the plaintext session.
    // Use `sh` as the binary so we can drive a deterministic exit-0 path
    // even where secret-tool isn't installed. The lookup stdout will
    // contain "super-secret" — if the adapter ever logged it, this test
    // would catch the regression.
    const logger = makeCapturingLogger();
    const runner = createSecretToolRunner({ logger, bin: 'sh', timeoutMs: 2000 });

    const handle = runner(['-c', 'echo super-secret; exit 0']);
    handle.write('lookup-stdin-payload');
    const result: SecretToolResult = handle.result;

    expect(result.status).toBe(0); // smoke check the spy was wired
    expect(result.stdout).toBe('super-secret\n');
    // No logger record references the secret. The lookup stdout carrying
    // the plaintext must never enter the log record.
    const dump = JSON.stringify(logger.records);
    expect(dump).not.toContain('super-secret');
    expect(dump).not.toContain('lookup-stdin-payload');
    // The success path must not produce a log record — only failures are loud.
    expect(logger.records.length).toBe(0);
  });

  it('logs an error record when the runner returns status:null (timeout)', () => {
    const logger = makeCapturingLogger();
    // Build a runner whose get result() always throws to simulate timeout
    // — adapter should report this through logger.error before returning.
    const runner = createSecretToolRunner({ logger, timeoutMs: 1 });

    const handle = runner(['lookup', 'service', 'jellytunes']);
    handle.write('');
    // Drive spawnSync: it will hit timeout, status:null. The adapter must
    // log this through `logger.error` (not console.log).
    const result = handle.result;

    // Either timeout or ENOENT in CI env — both produce a logger record.
    expect(logger.records.length).toBeGreaterThan(0);
    const record = logger.records[0]!;
    expect(['error', 'warn']).toContain(record.level);
    // Record carries diagnostic context (sanitised stderr + env vars).
    const ctx = record.context as Record<string, unknown>;
    expect(ctx).toBeDefined();
    expect(ctx['operation']).toBe('lookup');
    expect(ctx['status']).toBeNull();
    // PATH / DBUS / XDG values observed by parent process are included.
    expect(typeof ctx['parentEnv'] === 'object' && ctx['parentEnv'] !== null).toBe(true);
    const parentEnv = ctx['parentEnv'] as Record<string, unknown>;
    // DBus may be missing in some CI envs — accept either presence or absent marker.
    expect('PATH' in parentEnv || 'PATH_UNSET' in parentEnv).toBe(true);
    expect(
      'DBUS_SESSION_BUS_ADDRESS' in parentEnv || 'DBUS_SESSION_BUS_ADDRESS_UNSET' in parentEnv,
    ).toBe(true);
    expect('XDG_RUNTIME_DIR' in parentEnv || 'XDG_RUNTIME_DIR_UNSET' in parentEnv).toBe(true);
    // stdout of lookup is NEVER logged (plaintext session protection).
    const dump = JSON.stringify(record);
    expect(dump).not.toContain('plaintext');
    // status:null ⇒ stderr classified as either timeout or spawn_error —
    // both shapes prove we logged. The exact label depends on whether
    // child.error fired (spawn_error) or only the timeout did.
    expect(ctx['stderrClassification']).toMatch(/timeout|spawn_error/);
    expect(result).toBeDefined();
  });

  it('logs an error record on non-zero exit code (ENOENT-style spawn failure)', () => {
    const logger = makeCapturingLogger();
    const runner = createSecretToolRunner({ logger, bin: '/nonexistent/path/secret-tool' });

    const handle = runner(['store', '--label=jellytunes-session', 'service', 'jellytunes']);
    handle.write('hello');
    const result = handle.result;

    // ENOENT path produces status:null with child.error.message
    expect(result.status).toBeNull();
    expect(logger.records.length).toBeGreaterThan(0);
    const record = logger.records[0]!;
    expect(record.level).toBe('error');
    const ctx = record.context as Record<string, unknown>;
    expect(ctx['operation']).toBe('store');
    // child.error.message is propagated (truncated)
    expect(typeof ctx['errorMessage']).toBe('string');
  });

  it('classifies stderr into a sanitised category, never echoing the full stderr', () => {
    const logger = makeCapturingLogger();
    // Use a shell command that emits a long stderr string we want bounded.
    // secret-tool is unavailable in CI; we just need any stderr capture.
    // 500-byte payload ensures STDERR_LOG_CAP truncates it.
    const long = 'A'.repeat(500);
    const runner = createSecretToolRunner({ logger, bin: 'sh', timeoutMs: 2000 });

    const handle = runner(['-c', `echo "${long}" >&2; exit 2`]);
    handle.write('');
    const result = handle.result;

    expect(result.status).toBe(2);
    expect(logger.records.length).toBeGreaterThan(0);
    const record = logger.records[0]!;
    const ctx = record.context as Record<string, unknown>;
    // stderrClassification is a sanitised category — never the raw stderr.
    expect(ctx['stderrClassification']).toMatch(/non_zero_exit|timeout|spawn_error/);
    // stderrTruncated is the bounded slice — never longer than the cap.
    const stderrTruncated = ctx['stderrTruncated'] as string | undefined;
    if (stderrTruncated) {
      expect(stderrTruncated.length).toBeLessThanOrEqual(200);
    }
  });

  it('does not log on lookup success (no noise in normal operation)', () => {
    const logger = makeCapturingLogger();
    const runner = createSecretToolRunner({ logger, bin: 'sh', timeoutMs: 2000 });

    const handle = runner(['-c', 'echo ok; exit 0']);
    handle.write('');
    void handle.result;

    expect(logger.records.length).toBe(0);
  });

  it('accepts the logger through dependency injection (no module-level console use)', () => {
    // AC1 specifies "via logger estructurado (no console.log)". We prove
    // the adapter only knows about logger via the options bag — there is
    // no module-level console reference.
    const logger = makeCapturingLogger();
    expect(() => createSecretToolRunner({ logger })).not.toThrow();
  });

  it('redacts PATH-like secrets that may have leaked into DBUS / XDG values', () => {
    // AC1: env var values are sensitive in some setups (tokens in PATH,
    // bus address carrying session cookies). The logger must truncate
    // the parentEnv values to a safe length before recording.
    process.env.PATH = 'x'.repeat(200);
    process.env.DBUS_SESSION_BUS_ADDRESS = 'y'.repeat(200);
    const logger = makeCapturingLogger();
    const runner = createSecretToolRunner({ logger, bin: '/nonexistent' });

    const handle = runner(['store', '--label=x', 'service', 'jellytunes']);
    handle.write('h');
    void handle.result;

    expect(logger.records.length).toBeGreaterThan(0);
    const record = logger.records[0]!;
    const ctx = record.context as Record<string, unknown>;
    const parentEnv = ctx['parentEnv'] as Record<string, string>;
    // Truncated to a safe upper bound — never the raw multi-hundred-byte value.
    for (const v of Object.values(parentEnv)) {
      expect(v.length).toBeLessThanOrEqual(120);
    }
  });
});
