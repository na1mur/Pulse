// Tests for the contract mock-server smoke step (scripts/contract-mock-smoke.mjs), against a fake
// server launched through a wrapper process the way pnpm launches the real one.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { freePort, smoke } from './contract-mock-smoke.mjs';

const fake = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-mock-server.mjs');
const scratch = mkdtempSync(join(tmpdir(), 'pulse-mock-smoke-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let runs = 0;
function launch(mode, { shell = false } = {}) {
  const pidFile = join(scratch, `server-${++runs}.pid`);
  const server = {
    command: process.execPath,
    args: (port) => [fake, '--wrap', '--mode', mode, '--port', String(port), '--pid-file', pidFile],
    shell,
    realtimePath: '/v1/sync/stream',
    log: () => undefined,
  };
  return { server, pidFile };
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function assertStopped(pidFile) {
  const pid = Number(readFileSync(pidFile, 'utf8'));
  const deadline = Date.now() + 5000;
  while (alive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  assert.equal(alive(pid), false, `the server process ${pid} (a grandchild) is still running`);
}

describe('freePort', () => {
  it('returns a port nothing listens on', async () => {
    const port = await freePort();
    assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
  });
});

describe('smoke', () => {
  it('passes when /health answers and auth gets ready, then stops the whole tree', async () => {
    const { server, pidFile } = launch('ok');
    await smoke({ ...server, timeoutMs: 30_000 });
    await assertStopped(pidFile);
  });

  it('stops a tree launched through a shell, as pnpm is on Windows', async () => {
    const { server, pidFile } = launch('ok', { shell: true });
    await smoke({ ...server, timeoutMs: 30_000 });
    await assertStopped(pidFile);
  });

  it('fails instead of hanging when the server never answers, and still stops it', async () => {
    const { server, pidFile } = launch('silent');
    const started = Date.now();
    await assert.rejects(smoke({ ...server, timeoutMs: 1500 }), /did not answer .* within 1\.5 s/);
    assert.ok(Date.now() - started < 15_000, 'the timeout did not bound the step');
    await assertStopped(pidFile);
  });

  it('fails at once with the exit code when the server exits before answering', async () => {
    const { server } = launch('exit');
    const started = Date.now();
    await assert.rejects(smoke({ ...server, timeoutMs: 30_000 }), /exited with code 3/);
    assert.ok(Date.now() - started < 15_000, 'waited for the timeout instead of the exit');
  });

  it('fails when the realtime channel answers auth with anything but ready', async () => {
    const { server, pidFile } = launch('refuse');
    await assert.rejects(smoke({ ...server, timeoutMs: 30_000 }), /expected "ready"/);
    await assertStopped(pidFile);
  });
});
