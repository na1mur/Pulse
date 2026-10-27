#!/usr/bin/env node
// Deployment smoke test (T1.3, OPS-01, OPS-02, OPS-06): builds the server image and runs the
// production Compose file (infra/docker-compose.yml) the way the README tells an owner to, then
// proves, in order:
//   1. the file and the Caddyfile are valid for every profile combination;
//   2. bundled database: the stack comes up healthy (`/health` ok with the database up), the server
//      runs as a non-root user, data survives `down` and `up`, migrations are idempotent on restart,
//      and a pg_dump backup restores into a fresh, empty database volume;
//   3. https profile: Caddy answers on the local domain `localhost` (its own certificate) and proxies
//      to the server. Let's Encrypt itself cannot be tested without a public domain;
//   4. bundled database without DB_PASSWORD: the server and the database both name the setting;
//   5. external database: with `DATABASE_URL` set, no bundled database runs and the server migrates
//      and uses the external one.
// Everything runs under a throwaway Compose project on free loopback ports with a generated
// environment file in a temporary folder; it never reads infra/.env and always tears down what it
// started (containers, volumes, networks, the image it built). Needs Docker with Compose v2.24.4+
// (`!override` in the https step); the Compose file itself supports v2.20+ (README).
//
//   node scripts/deploy-smoke.mjs [--compose <standalone docker-compose binary>] [--config-only]
//
// --compose runs every Compose call through that binary instead of `docker compose` (to test
// another Compose version); --config-only stops after step 1. CI runs both together with the
// oldest supported Compose. No dependencies, like check.mjs.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { freePort } from './contract-mock-smoke.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = join(root, 'infra', 'docker-compose.yml');
const caddyfile = join(root, 'infra', 'Caddyfile');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Every variable infra/docker-compose.yml reads from the environment. The child processes get none
// of them from the caller's shell, so a developer's own DATABASE_URL cannot leak into the test.
export const PULSE_VARIABLES = [
  'COMPOSE_PROFILES',
  'PULSE_IMAGE',
  'PULSE_BIND_ADDRESS',
  'PORT',
  'DATABASE_URL',
  'DB_PASSWORD',
  'JWT_SECRET',
  'REFRESH_SECRET',
  'PUBLIC_API_URL',
  'DOMAIN',
  'CORS_ORIGINS',
  'TRUST_PROXY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SMTP_USER',
  'SMTP_APP_PASSWORD',
  'SMTP_HOST',
  'SMTP_PORT',
  'MAIL_FROM',
  'FCM_PROJECT_ID',
  'FCM_CLIENT_EMAIL',
  'FCM_PRIVATE_KEY',
];

// ---- pure parts (unit tests: scripts/deploy-smoke.test.mjs) -------------------------------------

/** A hex secret of `bytes` random bytes: URL-safe, so it also works inside DATABASE_URL. */
export function generateSecret(bytes, random = randomBytes) {
  return random(bytes).toString('hex');
}

/** The text of an environment file; a value with a line break would split into two settings. */
export function renderEnv(settings) {
  return Object.entries(settings)
    .map(([name, value]) => {
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`bad variable name "${name}"`);
      if (/[\r\n]/.test(value)) throw new Error(`${name} contains a line break`);
      return `${name}=${value}`;
    })
    .join('\n')
    .concat('\n');
}

/** `env` without the Pulse variables (and without COMPOSE_* ones that would change the project). */
export function childEnv(env, names = PULSE_VARIABLES) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !names.includes(name) && !name.startsWith('COMPOSE_')),
  );
}

/** The command line options: `{ compose, configOnly }`; throws on an unknown one. */
export function smokeOptions(args) {
  const { values } = parseArgs({
    args,
    options: { compose: { type: 'string' }, 'config-only': { type: 'boolean', default: false } },
  });
  return { compose: values.compose, configOnly: values['config-only'] };
}

/**
 * The program and the arguments every Compose call shares: `docker compose`, or the standalone
 * Compose `binary` when one is given.
 */
export function composeCommand({ binary, project, envFile, files }) {
  const shared = ['-p', project, '--env-file', envFile, ...files.flatMap((f) => ['-f', f])];
  return binary
    ? { command: binary, args: shared }
    : { command: 'docker', args: ['compose', ...shared] };
}

/** `/health` in its healthy form: the API and the database both report up (OPS-01). */
export function isHealthy(body) {
  return (
    body !== null && typeof body === 'object' && body.status === 'ok' && body.database === 'up'
  );
}

/** Host ports named in `compose ps --format '{{json .Publishers}}'` output (one array per line). */
export function publishedPorts(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => JSON.parse(line))
    .map((publisher) => publisher.PublishedPort)
    .filter((port) => port > 0);
}

/** Compose override that publishes Caddy on the given loopback ports instead of 80 and 443. */
export function proxyPortsOverride({ httpPort, httpsPort }) {
  return [
    'services:',
    '  caddy:',
    '    ports: !override',
    `      - '127.0.0.1:${httpPort}:80'`,
    `      - '127.0.0.1:${httpsPort}:443'`,
    '',
  ].join('\n');
}

/** Compose override that also puts the server on an existing network (the external database's). */
export function externalNetworkOverride(network) {
  return [
    'services:',
    '  server:',
    '    networks:',
    '      - default',
    '      - external-db',
    'networks:',
    '  external-db:',
    '    external: true',
    `    name: ${network}`,
    '',
  ].join('\n');
}

/**
 * Calls `check` until it returns a truthy value and returns that value. A check may throw: the
 * last error is reported when time runs out. `now` and `sleep` are injected for tests.
 */
export async function waitFor(
  check,
  { timeoutMs, intervalMs = 500, now = Date.now, sleep: pause = sleep, what = 'the check' },
) {
  const deadline = now() + timeoutMs;
  let lastError;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (now() >= deadline) {
      const reason = lastError ? `: ${lastError.message}` : '';
      throw new Error(`${what} did not succeed within ${timeoutMs / 1000} s${reason}`);
    }
    await pause(intervalMs);
  }
}

// ---- Docker -------------------------------------------------------------------------------------

function run(command, args, { env, input, allowFailure = false, cwd = root } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const name = basename(command);
  if (result.error) throw new Error(`${name} could not run: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    const text = (value) => (value ? value.toString().trim().slice(-2000) : '');
    throw new Error(
      `${name} ${args
        .filter((a) => !a.startsWith('--env-file'))
        .slice(0, 8)
        .join(' ')} failed (${result.status})\n${text(result.stderr)}`,
    );
  }
  return result;
}

const docker = (args, options) => run('docker', args, options);

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json().catch(() => null), response };
}

/** GET over HTTPS to 127.0.0.1:port with `host` as the name; the local CA's certificate is not trusted. */
function getJsonInsecure({ port, host, path }) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        servername: host,
        headers: { host: `${host}:${port}` },
        rejectUnauthorized: false,
        timeout: 5000,
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => {
          let body = null;
          try {
            body = JSON.parse(text);
          } catch {
            // Not JSON (Caddy error page): the caller sees a null body.
          }
          resolve({ status: response.statusCode, body });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const step = async (name, run) => {
  const started = Date.now();
  await run();
  console.log(`ok - ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
};

async function main({ compose: composeBinary, configOnly }) {
  const suffix = randomBytes(3).toString('hex');
  const project = `pulse-smoke-${suffix}`;
  const image = `pulse-smoke-server:${suffix}`;
  const externalName = `${project}-extdb`;
  const externalNetwork = `${project}-ext`;
  const dir = mkdtempSync(join(tmpdir(), 'pulse-deploy-smoke-'));
  const envFile = join(dir, 'smoke.env');
  const baseEnv = childEnv(process.env);

  const [port, httpPort, httpsPort] = [await freePort(), await freePort(), await freePort()];
  const dbPassword = generateSecret(24);
  const settings = {
    COMPOSE_PROFILES: 'db',
    PULSE_IMAGE: image,
    PORT: String(port),
    DATABASE_URL: '',
    DB_PASSWORD: dbPassword,
    JWT_SECRET: generateSecret(32),
    REFRESH_SECRET: generateSecret(32),
    PUBLIC_API_URL: `http://localhost:${port}`,
    TRUST_PROXY: '0',
  };
  const writeSettings = (changes = {}) => {
    Object.assign(settings, changes);
    writeFileSync(envFile, renderEnv(settings));
  };
  writeSettings();

  const overrides = [];
  const writeOverride = (name, text) => {
    const file = join(dir, name);
    writeFileSync(file, text);
    return file;
  };
  const dc = (args, options) => {
    const files = [composeFile, ...overrides];
    const compose = composeCommand({ binary: composeBinary, project, envFile, files });
    return run(compose.command, [...compose.args, ...args], { env: baseEnv, ...options });
  };
  const logsOf = (service) => {
    const result = dc(['logs', '--no-log-prefix', service], { allowFailure: true });
    return `${result.stdout ?? ''}${result.stderr ?? ''}`;
  };
  const health = () => getJson(`http://127.0.0.1:${port}/health`);
  const waitHealthy = (what) =>
    waitFor(
      async () => {
        const { status, body } = await health();
        assert(
          status === 200 && isHealthy(body),
          `/health answered ${status} ${JSON.stringify(body)}`,
        );
        return true;
      },
      { timeoutMs: 60_000, what },
    );
  const up = (...services) => dc(['up', '-d', '--wait', '--wait-timeout', '120', ...services]);
  const psql = (sql) =>
    dc([
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'pulse',
      '-d',
      'pulse',
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
      '-c',
      sql,
    ]).stdout.trim();
  const serverLog = () => logsOf('server');

  let failure;
  try {
    await step('compose file and Caddyfile are valid for every profile combination', async () => {
      for (const profiles of ['db', 'db,https', 'https', '']) {
        const bundled = profiles.includes('db');
        // As the README sets it up: an external database leaves DB_PASSWORD empty.
        writeSettings({
          COMPOSE_PROFILES: profiles,
          DOMAIN: 'pulse.example.org',
          DATABASE_URL: bundled ? '' : 'postgres://u:p@db.example.org:5432/pulse',
          DB_PASSWORD: bundled ? dbPassword : '',
        });
        dc(['config', '--quiet']);
      }
      docker(
        [
          'run',
          '--rm',
          '-e',
          'DOMAIN=pulse.example.org',
          '-e',
          'PORT=3000',
          '-v',
          `${caddyfile}:/etc/caddy/Caddyfile:ro`,
          'caddy:2.11-alpine',
          'caddy',
          'validate',
          '--config',
          '/etc/caddy/Caddyfile',
          '--adapter',
          'caddyfile',
        ],
        { env: baseEnv },
      );
      writeSettings({
        COMPOSE_PROFILES: 'db',
        DOMAIN: '',
        DATABASE_URL: '',
        DB_PASSWORD: dbPassword,
      });
    });
    if (configOnly) {
      console.log('deploy smoke: --config-only, the steps that start containers were skipped');
      return 0;
    }

    await step('the server image builds', async () => {
      dc(['build', 'server']);
    });

    await step('bundled database: stack healthy, /health ok with the database up', async () => {
      up();
      await waitHealthy('/health');
      const { response } = await health();
      assert(response.headers.has('pulse-request-id'), 'the response has no Pulse-Request-Id');
    });

    await step('the server runs as a non-root user and cannot write its code', async () => {
      const uid = dc(['exec', '-T', 'server', 'id', '-u']).stdout.trim();
      assert(uid !== '0' && /^\d+$/.test(uid), `the server runs as uid ${uid}`);
      const write = dc(['exec', '-T', 'server', 'sh', '-c', 'touch /app/probe'], {
        allowFailure: true,
      });
      assert(write.status !== 0, 'the server could write to /app');
    });

    await step('the database is not published on the host', async () => {
      const publishers = dc(['ps', 'db', '--format', '{{json .Publishers}}']).stdout;
      const ports = publishedPorts(publishers);
      assert(ports.length === 0, `the database publishes host ports ${ports.join(', ')}`);
    });

    await step('data survives down and up, and migrations are idempotent', async () => {
      psql("create table smoke_marker (value text); insert into smoke_marker values ('kept')");
      dc(['down']);
      up();
      await waitHealthy('/health after down and up');
      assert(psql('select value from smoke_marker') === 'kept', 'the marker row was lost');
      assert(
        serverLog().includes('Database schema is up to date'),
        'the second start did not report an up-to-date schema',
      );
    });

    await step('a backup restores into a fresh, empty database volume', async () => {
      const dump = dc([
        'exec',
        '-T',
        'db',
        'pg_dump',
        '-U',
        'pulse',
        '-d',
        'pulse',
        '--clean',
        '--if-exists',
        '--no-owner',
      ]).stdout;
      assert(dump.includes('smoke_marker'), 'the dump does not contain the marker table');
      dc(['down', '--volumes']);
      up('db');
      dc(
        [
          'exec',
          '-T',
          'db',
          'psql',
          '-U',
          'pulse',
          '-d',
          'pulse',
          '-v',
          'ON_ERROR_STOP=1',
          '--single-transaction',
          '-q',
        ],
        { input: Buffer.from(dump) },
      );
      up();
      await waitHealthy('/health after the restore');
      assert(psql('select value from smoke_marker') === 'kept', 'the marker row was not restored');
      assert(
        serverLog().includes('Database schema is up to date'),
        'the restored database was migrated again',
      );
    });

    await step(
      'https profile: Caddy answers on its own certificate and proxies /health',
      async () => {
        overrides.push(
          writeOverride('proxy-ports.yml', proxyPortsOverride({ httpPort, httpsPort })),
        );
        writeSettings({
          COMPOSE_PROFILES: 'db,https',
          DOMAIN: 'localhost',
          TRUST_PROXY: '1',
          PUBLIC_API_URL: `https://localhost:${httpsPort}`,
        });
        up();
        const answer = await waitFor(
          async () => {
            const result = await getJsonInsecure({
              port: httpsPort,
              host: 'localhost',
              path: '/health',
            });
            return result.status === 200 && isHealthy(result.body) ? result : false;
          },
          { timeoutMs: 90_000, what: 'HTTPS /health through Caddy' },
        );
        assert(isHealthy(answer.body), 'Caddy did not proxy /health');
        const redirect = await fetch(`http://127.0.0.1:${httpPort}/health`, {
          redirect: 'manual',
          headers: { host: 'localhost' },
          signal: AbortSignal.timeout(5000),
        });
        assert(
          redirect.status >= 300 &&
            redirect.status < 400 &&
            /^https:/.test(redirect.headers.get('location') ?? ''),
          `plain HTTP was answered ${redirect.status}, expected a redirect to HTTPS`,
        );
      },
    );

    await step(
      'bundled database without DB_PASSWORD: the server and the database name the setting',
      async () => {
        // With --volumes while the https profile is still on, so Caddy's volumes go too.
        dc(['down', '--volumes', '--remove-orphans']);
        overrides.length = 0;
        writeSettings({
          COMPOSE_PROFILES: 'db',
          DOMAIN: '',
          TRUST_PROXY: '0',
          PUBLIC_API_URL: `http://localhost:${port}`,
          DB_PASSWORD: '',
        });
        // The database is an optional dependency (external databases), so Compose only warns
        // that it failed and starts the server anyway; its exit code differs between versions.
        dc(['up', '-d'], { allowFailure: true });
        const expected = {
          server: 'DB_PASSWORD is required with the bundled database',
          db: 'DB_PASSWORD is not set in .env',
        };
        await waitFor(
          () => Object.entries(expected).every(([service, text]) => logsOf(service).includes(text)),
          { timeoutMs: 60_000, what: 'the server and the database naming DB_PASSWORD' },
        );
      },
    );

    await step(
      'external database: DATABASE_URL set, no bundled database, migrations applied',
      async () => {
        dc(['down', '--volumes', '--remove-orphans']);
        overrides.length = 0;
        const externalPassword = generateSecret(24);
        docker(['network', 'create', externalNetwork]);
        docker(
          [
            'run',
            '-d',
            '--name',
            externalName,
            '--network',
            externalNetwork,
            '-e',
            'POSTGRES_USER=pulse',
            '-e',
            `POSTGRES_PASSWORD=${externalPassword}`,
            '-e',
            'POSTGRES_DB=pulse',
            'postgres:17-alpine',
          ],
          { env: baseEnv },
        );
        await waitFor(
          () =>
            docker(
              ['exec', externalName, 'pg_isready', '-h', '127.0.0.1', '-U', 'pulse', '-d', 'pulse'],
              {
                allowFailure: true,
              },
            ).status === 0,
          { timeoutMs: 60_000, what: 'the external database' },
        );
        // The init script restarts PostgreSQL once; wait until it also accepts a real query.
        await waitFor(
          () =>
            docker(
              ['exec', externalName, 'psql', '-U', 'pulse', '-d', 'pulse', '-tA', '-c', 'select 1'],
              {
                allowFailure: true,
              },
            ).status === 0,
          { timeoutMs: 30_000, what: 'a query on the external database' },
        );
        overrides.push(
          writeOverride('external-network.yml', externalNetworkOverride(externalNetwork)),
        );
        writeSettings({
          COMPOSE_PROFILES: '',
          DOMAIN: '',
          TRUST_PROXY: '0',
          PUBLIC_API_URL: `http://localhost:${port}`,
          DB_PASSWORD: '',
          DATABASE_URL: `postgres://pulse:${externalPassword}@${externalName}:5432/pulse`,
        });
        up();
        await waitHealthy('/health with the external database');
        const services = dc(['ps', '--services']).stdout.trim().split(/\s+/);
        assert(
          services.length === 1 && services[0] === 'server',
          `expected only the server, found ${services.join(', ')}`,
        );
        const applied = docker(
          [
            'exec',
            externalName,
            'psql',
            '-U',
            'pulse',
            '-d',
            'pulse',
            '-tA',
            '-c',
            'select count(*) from schema_migrations',
          ],
          { env: baseEnv },
        ).stdout.trim();
        assert(Number(applied) >= 1, 'the external database has no applied migrations');
      },
    );
  } catch (error) {
    failure = error;
    const logs = dc(['logs', '--no-color', '--tail', '40'], { allowFailure: true });
    console.error(
      `--- compose logs (last 40 lines each)\n${logs.stdout ?? ''}${logs.stderr ?? ''}`,
    );
  } finally {
    dc(['down', '--volumes', '--remove-orphans'], { allowFailure: true });
    // `down` only sees the volumes of the profiles that are on now; remove the rest by label.
    const leftover = docker(
      ['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`],
      { allowFailure: true },
    ).stdout;
    const volumes = (leftover ?? '').split(/\s+/).filter(Boolean);
    if (volumes.length > 0) docker(['volume', 'rm', ...volumes], { allowFailure: true });
    docker(['rm', '--force', '--volumes', externalName], { allowFailure: true });
    docker(['network', 'rm', externalNetwork], { allowFailure: true });
    docker(['image', 'rm', image], { allowFailure: true });
    rmSync(dir, { recursive: true, force: true });
  }
  if (failure) {
    console.error(`deploy smoke: FAILED: ${failure.message}`);
    return 1;
  }
  console.log('deploy smoke: the deployment works and everything it started was removed');
  return 0;
}

if (import.meta.main) process.exitCode = await main(smokeOptions(process.argv.slice(2)));
