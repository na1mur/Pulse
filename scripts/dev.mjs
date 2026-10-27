#!/usr/bin/env node
// Local development services (T0.6): PostgreSQL and the Mailpit mail catcher from
// infra/docker-compose.dev.yml. Run through the root scripts; needs Docker with Compose v2, but
// only here: `pnpm verify` and CI never call this file. No dependencies, like check.mjs.
//
//   pnpm dev         dev:up, then the seed files, then the server in the foreground (one command)
//   pnpm dev:up      start the services, wait until healthy, print the URLs and connection values
//   pnpm dev:down    stop them, keep the database
//   pnpm dev:reset   stop them and delete the database volume (dev data only)
//
// Host ports: PULSE_DEV_DB_PORT (5432), PULSE_DEV_SMTP_PORT (1025), PULSE_DEV_MAIL_UI_PORT (8025).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { constants as osConstants } from 'node:os';
import { connect, createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const COMPOSE_FILE = join(root, 'infra', 'docker-compose.dev.yml');
const HOST = '127.0.0.1';
const PROBE_TIMEOUT_MS = 1000;

// Host ports, overridable because a local PostgreSQL on 5432 is common. The compose file reads
// the same variables with the same defaults (a test checks it).
// `example` is the port the busy-port hint suggests: far from the defaults, so rarely taken too.
export const PORTS = {
  db: {
    variable: 'PULSE_DEV_DB_PORT',
    fallback: 5432,
    example: 15432,
    label: 'PostgreSQL',
    service: 'db',
  },
  smtp: {
    variable: 'PULSE_DEV_SMTP_PORT',
    fallback: 1025,
    example: 11025,
    label: 'SMTP',
    service: 'mailpit',
  },
  mailUi: {
    variable: 'PULSE_DEV_MAIL_UI_PORT',
    fallback: 8025,
    example: 18025,
    label: 'mail UI',
    service: 'mailpit',
  },
};

/**
 * The ports in use, read from `env` (an empty variable counts as unset, like in Compose).
 * @returns {{ports: {db: number, smtp: number, mailUi: number}} | {error: string}}
 */
export function resolvePorts(env) {
  const ports = {};
  for (const [key, { variable, fallback }] of Object.entries(PORTS)) {
    const raw = env[variable];
    if (raw === undefined || raw === '') {
      ports[key] = fallback;
      continue;
    }
    const port = /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
    if (!(port >= 1 && port <= 65535)) {
      return { error: `${variable} must be a whole number from 1 to 65535, got "${raw}".` };
    }
    ports[key] = port;
  }
  const keys = Object.keys(ports);
  for (const [i, a] of keys.entries()) {
    const b = keys.slice(i + 1).find((other) => ports[other] === ports[a]);
    if (b) {
      const names = `${PORTS[a].variable} and ${PORTS[b].variable}`;
      return { error: `${names} are both ${ports[a]}; the ports must differ.` };
    }
  }
  return { ports };
}

/** What a server needs to reach the dev services on `ports`. */
export function connectionFor(ports) {
  return {
    databaseUrl: `postgres://pulse:pulse@localhost:${ports.db}/pulse`,
    smtpHost: 'localhost',
    smtpPort: ports.smtp,
    mailUi: `http://localhost:${ports.mailUi}`,
  };
}

// Dev-only values with the default ports: they must match the compose file (a test checks it) and
// never become production defaults (OPS-03 refuses weak secrets).
export const CONNECTION = connectionFor(resolvePorts({}).ports);

/** The variables handed to Compose, so an `infra/.env` can never disagree with what is printed. */
export function composeEnv(ports) {
  return Object.fromEntries(
    Object.entries(PORTS).map(([key, { variable }]) => [variable, String(ports[key])]),
  );
}

const COMMANDS = ['up', 'down', 'reset', 'start'];
const USAGE =
  'Usage: node scripts/dev.mjs <up|down|reset|start>   (pnpm dev:up | dev:down | dev:reset | dev)';
const WAIT_TIMEOUT_SECONDS = '120';
const SERVER_FILTER = ['--filter', '@pulse/server'];

/** @returns {{command: string} | {help: true} | {error: string}} */
export function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { help: true };
  if (argv.length === 0) return { error: USAGE };
  const [command, ...extra] = argv;
  if (!COMMANDS.includes(command)) return { error: `Unknown command "${command}".\n${USAGE}` };
  if (extra.length > 0) return { error: USAGE };
  return { command };
}

/** The `docker` arguments for `up`, `down` or `reset`. `reset` is `down -v`: it removes the data. */
export function composeArgs(command) {
  const base = ['compose', '-f', COMPOSE_FILE];
  if (command === 'up') {
    return [...base, 'up', '-d', '--wait', '--wait-timeout', WAIT_TIMEOUT_SECONDS];
  }
  return [...base, 'down', ...(command === 'reset' ? ['-v'] : [])];
}

/** Lists the running services of the dev project, one name per line. */
export function psArgs() {
  return ['compose', '-f', COMPOSE_FILE, 'ps', '--services', '--status', 'running'];
}

/** The services and the settings a server needs for them, as lines. */
function servicesSummary(ports) {
  const connection = connectionFor(ports);
  return [
    '',
    'Dev services are up and healthy (bound to 127.0.0.1 only).',
    `  PostgreSQL   ${connection.databaseUrl}`,
    `  SMTP         ${connection.smtpHost}:${connection.smtpPort} (no auth, no TLS)`,
    `  Mail UI      ${connection.mailUi}`,
    '',
    'Server settings for these services:',
    `  DATABASE_URL=${connection.databaseUrl}`,
    `  SMTP_HOST=${connection.smtpHost}`,
    `  SMTP_PORT=${connection.smtpPort}`,
  ];
}

/** After `dev:up` alone: what to run next. (`pnpm dev` goes on by itself and prints none.) */
function nextSteps(ports) {
  const { databaseUrl } = connectionFor(ports);
  const custom = ports.db !== PORTS.db.fallback;
  return [
    ...(custom
      ? [
          'Not the default database port: set DATABASE_URL (above) before `pnpm dev:seed`:',
          `  Git Bash / Linux:  export DATABASE_URL=${databaseUrl}`,
          `  PowerShell:        $env:DATABASE_URL = '${databaseUrl}'`,
          '',
        ]
      : []),
    'Next: pnpm --filter @pulse/server dev   (and pnpm dev:seed once the server has seed files)',
  ];
}

/** Docker CLI and daemon must both be there before compose is worth calling. */
function preflight({ run, error }) {
  const cli = run('docker', ['compose', 'version']);
  if (cli.error?.code === 'ENOENT') {
    error(
      'Docker with Compose v2 is not installed (no `docker` on PATH). Install Docker Desktop or Docker Engine with the Compose plugin.',
    );
    return false;
  }
  if (cli.error || cli.status !== 0) {
    error(
      '`docker compose` (Compose v2) is not available. Update Docker Desktop or install the Compose plugin.',
    );
    return false;
  }
  if (run('docker', ['info']).status !== 0) {
    error(
      'The Docker daemon is not running. Start Docker Desktop (or the Docker Engine) and run this again.',
    );
    return false;
  }
  return true;
}

/** Services Compose reports as running (ours, from an earlier `dev:up`); none if it cannot tell. */
function runningServices({ run }, env) {
  const result = run('docker', psArgs(), { env });
  if (result.error || result.status !== 0) return new Set();
  return new Set(
    String(result.stdout ?? '')
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Ports whose service is not running yet but that something else already holds. */
async function busyPorts(deps, ports, env) {
  const running = runningServices(deps, env);
  const busy = [];
  for (const [key, { service }] of Object.entries(PORTS)) {
    if (!running.has(service) && (await deps.portInUse(ports[key]))) busy.push(key);
  }
  return busy;
}

/** A free-looking port to suggest for `key`: its example, or the next one when that is taken. */
function examplePort(key, ports) {
  const taken = Object.values(ports);
  let port = PORTS[key].example;
  while (taken.includes(port)) port += 1;
  return port;
}

/** `ran` is the command the user typed (`pnpm dev` or `pnpm dev:up`), repeated in the examples. */
function busyMessage(busy, ports, ran) {
  const lines = busy.map((key) => {
    const { variable, label } = PORTS[key];
    return `  ${label}: ${HOST}:${ports[key]} is already in use (override with ${variable}).`;
  });
  const picks = busy.map((key) => [PORTS[key].variable, examplePort(key, ports)]);
  const bash = picks.map(([variable, port]) => `${variable}=${port}`).join(' ');
  const powershell = picks.map(([variable, port]) => `$env:${variable} = ${port}`).join('; ');
  return [
    'Cannot start the dev services, a host port is taken:',
    ...lines,
    'Stop what holds it (a local PostgreSQL on 5432 is common) or use any free port, for example:',
    `  Git Bash / Linux:  ${bash} ${ran}`,
    `  PowerShell:        ${powershell}; ${ran}`,
  ].join('\n');
}

// What differs between the compose commands: whether the host ports must be free first, the
// message when Compose fails and the message on success (`pnpm dev` is `up` plus seed and server).
const ACTIONS = {
  up: {
    checkPorts: true,
    failed: [
      'The dev services did not start. `docker compose -f infra/docker-compose.dev.yml logs` shows why a container is unhealthy.',
      'If the ports changed since the last start, run `pnpm dev:down` first and retry.',
    ].join('\n'),
    done: (ports) => [...servicesSummary(ports), '', ...nextSteps(ports)].join('\n'),
  },
  down: {
    failed: '`docker compose down` failed.',
    done: () => 'Dev services stopped. The database is kept; `pnpm dev:up` resumes it.',
  },
  reset: {
    failed: '`docker compose down -v` failed.',
    done: () =>
      'Dev services stopped and the database volume deleted. `pnpm dev:up` starts a fresh, empty database.',
  },
};

/** The checks and the Compose call of one command: `{code, ports}`, code 0 when it worked. */
async function composeStep(name, deps, ran) {
  const resolved = resolvePorts(deps.env);
  if (resolved.error) {
    deps.error(resolved.error);
    return { code: 2 };
  }
  const { ports } = resolved;
  const env = composeEnv(ports);
  if (!preflight(deps)) return { code: 1 };
  const action = ACTIONS[name];
  if (action.checkPorts) {
    const busy = await busyPorts(deps, ports, env);
    if (busy.length > 0) {
      deps.error(busyMessage(busy, ports, ran));
      return { code: 1 };
    }
  }
  const result = deps.run('docker', composeArgs(name), { env, inherit: true });
  if (result.error || result.status !== 0) {
    deps.error(action.failed);
    return { code: result.status || 1 };
  }
  return { code: 0, ports };
}

/** A fresh random token secret: the server (OPS-03) refuses weak and placeholder values. */
function generateSecret() {
  return randomBytes(32).toString('base64url');
}

/**
 * `pnpm dev`, after the services are up: apply the seeds, then run the server in the foreground.
 * The settings come from the resolved ports, so a user's own DATABASE_URL never points the seed
 * runner or the server away from the dev services started here.
 */
async function seedAndServe(ports, deps) {
  const connection = connectionFor(ports);
  const database = { DATABASE_URL: connection.databaseUrl };
  deps.log('Applying the seed files...');
  const seeded = await deps.runChild('pnpm', [...SERVER_FILTER, 'seed'], { env: database });
  if (seeded !== 0) {
    deps.error('Seeding failed (see above); the server was not started.');
    return seeded;
  }
  deps.log(
    'Starting the server in this terminal. Ctrl+C stops it; `pnpm dev:down` stops the services.',
  );
  return deps.runChild('pnpm', [...SERVER_FILTER, 'dev'], {
    env: {
      ...database,
      SMTP_HOST: connection.smtpHost,
      SMTP_PORT: String(connection.smtpPort),
      // New on every `pnpm dev`, so sign-in tokens do not survive a restart of the command (not
      // of the server's file watcher). Set both in your shell to keep them: see DEVELOPMENT.md.
      JWT_SECRET: deps.env.JWT_SECRET || (deps.generateSecret ?? generateSecret)(),
      REFRESH_SECRET: deps.env.REFRESH_SECRET || (deps.generateSecret ?? generateSecret)(),
    },
  });
}

/**
 * Runs one command and returns the exit code (2: bad port settings, 1: anything else that failed;
 * for `start` the exit code of the failed seed step or of the server).
 * @param {string} command up | down | reset | start
 * @param {{
 *   run: (command: string, args: string[], options?: {env?: object, inherit?: boolean}) => {status?: number | null, stdout?: string, error?: Error},
 *   runChild: (command: string, args: string[], options: {env: object}) => Promise<number>,
 *   portInUse: (port: number) => Promise<boolean>,
 *   env: Record<string, string | undefined>,
 *   generateSecret?: () => string,
 *   log: (line: string) => void,
 *   error: (line: string) => void}} deps
 */
export async function runDev(command, deps) {
  const start = command === 'start';
  const step = await composeStep(start ? 'up' : command, deps, start ? 'pnpm dev' : 'pnpm dev:up');
  if (step.code !== 0) return step.code;
  if (start) {
    deps.log(servicesSummary(step.ports).join('\n'));
    return seedAndServe(step.ports, deps);
  }
  deps.log(ACTIONS[command].done(step.ports));
  return 0;
}

/** Compose output goes straight to the terminal; probes stay quiet and `ps` output is captured. */
const spawnRunner = (command, args, { env = {}, inherit = false } = {}) =>
  spawnSync(command, args, {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'ignore'],
  });

/**
 * How to start pnpm. Under `pnpm dev`, `npm_execpath` is pnpm's own script: run it with this Node,
 * without a shell. On Windows a shell would put `pnpm.cmd` and its "Terminate batch job?" prompt
 * between Ctrl+C and the server. Started by hand, fall back to `pnpm` (through a shell on Windows).
 */
export function pnpmInvocation(env = process.env, platform = process.platform) {
  const script = env.npm_execpath;
  if (script && /[\\/]pnpm[^\\/]*\.[cm]?js$/i.test(script)) {
    return { command: process.execPath, prefix: [script], shell: false };
  }
  return { command: 'pnpm', prefix: [], shell: platform === 'win32' };
}

/** Stops a child and everything it started (pnpm starts the server through more processes). */
function stopChild(child, signal) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill(signal);
  }
}

/**
 * Runs `command` with `args` and the terminal (`pnpm` is resolved through pnpmInvocation) and
 * resolves with its exit code (128 + n when a signal ended
 * it). SIGTERM is passed on. SIGINT is passed on only without a terminal: Ctrl+C in a terminal
 * already reaches the whole foreground process group, and a second SIGINT would hurry the
 * server's shutdown.
 */
function spawnChild(command, args, { env = {} } = {}) {
  const pnpm = command === 'pnpm' ? pnpmInvocation() : { command, prefix: [], shell: false };
  return new Promise((resolve) => {
    const child = spawn(pnpm.command, [...pnpm.prefix, ...args], {
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: pnpm.shell,
    });
    const forwarded = process.stdin.isTTY ? ['SIGTERM'] : ['SIGINT', 'SIGTERM'];
    const handlers = forwarded.map((signal) => [signal, () => stopChild(child, signal)]);
    for (const [signal, handler] of handlers) process.on(signal, handler);
    // Keeps this process alive on Ctrl+C in a terminal until the child has exited.
    const ignoreInterrupt = () => undefined;
    if (process.stdin.isTTY) process.on('SIGINT', ignoreInterrupt);
    const finish = (code) => {
      for (const [signal, handler] of handlers) process.off(signal, handler);
      process.off('SIGINT', ignoreInterrupt);
      resolve(code);
    };
    child.once('error', (error) => {
      console.error(`Could not start ${command}: ${error.message}`);
      finish(1);
    });
    child.once('exit', (code, signal) => {
      finish(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 1) : 1));
    });
  });
}

/** True when something accepts connections on the loopback port (also catches a 0.0.0.0 listener). */
function accepts(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: HOST, port });
    const done = (inUse) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** True when the OS refuses a listener on the loopback port (taken, or held by a connection). */
function cannotListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (error) =>
      resolve(error.code === 'EADDRINUSE' || error.code === 'EACCES'),
    );
    server.listen(port, HOST, () => server.close(() => resolve(false)));
  });
}

/**
 * True when Docker could not publish `127.0.0.1:port`: something listens there (a connect finds
 * it even on 0.0.0.0) or the OS refuses a new listener (Windows answers EACCES when a connection
 * or an exclusive bind holds the port).
 */
export async function probePort(port) {
  return (await accepts(port)) || (await cannotListen(port));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(USAGE);
  } else if (parsed.error) {
    console.error(parsed.error);
    process.exitCode = 2;
  } else {
    process.exitCode = await runDev(parsed.command, {
      run: spawnRunner,
      runChild: spawnChild,
      portInUse: probePort,
      env: process.env,
      log: (line) => console.log(line),
      error: (line) => console.error(line),
    });
  }
}
