#!/usr/bin/env node
// Smoke start of the contract mock server (T0.4), run by `scripts/check.mjs --only ts`:
// starts `pnpm --filter @pulse/contract mock -- --port <free port>`, waits for `GET /health` to
// answer with server time, sends a realtime `auth` and expects `ready`, then stops the whole
// process tree (pnpm launches the server through child processes) and checks the port is free.
// A timeout fails the step; it never hangs. No dependencies, like check.mjs.
//
//   node scripts/contract-mock-smoke.mjs
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const STOP_TIMEOUT_MS = 10_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** Settles with `promise`'s value, or `false` after `ms`; clears its timer either way. */
async function within(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
const quote = (arg) => (/^[\w./\\:=@-]+$/.test(arg) ? arg : `"${arg}"`);

/** A TCP port nothing listens on right now. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: HOST });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function launch({ command, args, shell }) {
  const options = {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    // POSIX: its own process group, so the whole tree can be signalled at once.
    detached: process.platform !== 'win32',
  };
  // With `shell`, pass one command line: Node 24 deprecates separate args with a shell.
  const child = shell
    ? spawn([command, ...args].map(quote).join(' '), { ...options, shell: true })
    : spawn(command, args, options);
  const exited = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return { child, exited };
}

/** Stops the launcher and everything it started; throws if the port stays bound. */
async function stopTree({ child, exited }, port) {
  if (child.pid !== undefined) {
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // Already gone.
      }
    } else {
      const signalGroup = (signal) => {
        try {
          process.kill(-child.pid, signal);
        } catch {
          // Already gone.
        }
      };
      signalGroup('SIGTERM');
      await within(exited, 3000);
      signalGroup('SIGKILL');
    }
  }
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  const launcherGone = await within(
    exited.then(() => true),
    STOP_TIMEOUT_MS,
  );
  while ((await portInUse(port)) && Date.now() < deadline) await sleep(100);
  if (!launcherGone) throw new Error(`the mock launcher (pid ${child.pid}) did not exit`);
  if (await portInUse(port)) throw new Error(`port ${port} is still in use after stopping`);
}

async function waitForHealth(url, deadline, exited, timeoutMs) {
  let exit;
  void exited.then((result) => (exit = result));
  for (;;) {
    if (exit) {
      const how = exit.error
        ? `could not start: ${exit.error.message}`
        : `exited with code ${exit.code ?? exit.signal}`;
      throw new Error(`the mock server ${how} before answering ${url}`);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`the mock server did not answer ${url} within ${seconds(timeoutMs)}`);
    }
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(Math.min(2000, remaining)) });
    } catch {
      await sleep(Math.min(250, Math.max(0, deadline - Date.now())));
      continue;
    }
    const body = await response.text();
    if (response.status !== 200) {
      throw new Error(`${url} answered ${response.status}: ${body.slice(0, 300)}`);
    }
    if (!response.headers.get('pulse-server-time')) {
      throw new Error(`${url} answered without the Pulse-Server-Time header`);
    }
    JSON.parse(body);
    return;
  }
}

function checkRealtime(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error(`no "ready" from ${url} within ${seconds(timeoutMs)}`)),
      timeoutMs,
    );
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'auth', accessToken: 'pulse-mock-smoke' }));
    });
    socket.addEventListener('message', (event) => {
      const text = String(event.data);
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        message = undefined;
      }
      if (message?.type === 'ready' && typeof message.serverTime === 'string') finish();
      else finish(new Error(`expected "ready" after auth on ${url}, got ${text.slice(0, 300)}`));
    });
    socket.addEventListener('error', () => finish(new Error(`the WebSocket ${url} failed`)));
    socket.addEventListener('close', (event) => {
      finish(new Error(`the WebSocket ${url} closed before "ready" (code ${event.code})`));
    });
  });
}

/**
 * Starts the server (`args(port)` gives its arguments), checks it and always stops it.
 * Resolves on success; rejects with the reason otherwise.
 */
export async function smoke({ command, args, shell, realtimePath, timeoutMs, log = console.log }) {
  const port = await freePort();
  const base = `http://${HOST}:${port}`;
  const server = launch({ command, args: args(port), shell });
  let failure;
  try {
    const deadline = Date.now() + timeoutMs;
    await waitForHealth(`${base}/health`, deadline, server.exited, timeoutMs);
    log(`smoke: GET ${base}/health answered`);
    const realtime = `ws://${HOST}:${port}${realtimePath}`;
    await checkRealtime(realtime, Math.max(1000, Math.min(10_000, deadline - Date.now())));
    log(`smoke: ${realtime} answered auth with ready`);
  } catch (error) {
    failure = error;
  }
  try {
    await stopTree(server, port);
    log(`smoke: mock server stopped, port ${port} free`);
  } catch (error) {
    failure = failure ? new Error(`${failure.message}; also ${error.message}`) : error;
  }
  if (failure) throw failure;
}

async function main() {
  // The realtime path comes from the generated contract, not a copy of it.
  const openapi = JSON.parse(
    readFileSync(join(root, 'packages/contract/generated/openapi.json'), 'utf8'),
  );
  const realtimePath = openapi['x-pulse-realtime']?.path;
  if (typeof realtimePath !== 'string') {
    console.error('packages/contract/generated/openapi.json has no x-pulse-realtime.path');
    return 1;
  }
  try {
    await smoke({
      command: 'pnpm',
      args: (port) => ['--filter', '@pulse/contract', 'run', 'mock', '--', '--port', String(port)],
      // pnpm is a .cmd launcher on Windows, which cannot be spawned without a shell.
      shell: process.platform === 'win32',
      realtimePath,
      // Includes the contract's TypeScript build that `mock` runs first.
      timeoutMs: 120_000,
    });
  } catch (error) {
    console.error(`smoke: FAILED: ${error.message}`);
    return 1;
  }
  console.log('smoke: the contract mock server runs');
  return 0;
}

if (import.meta.main) process.exitCode = await main();
