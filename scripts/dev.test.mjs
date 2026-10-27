// Tests for the dev-environment script (scripts/dev.mjs, T0.6): argument handling, port settings,
// the exact docker compose invocations, the printed output and the failure messages. Docker is
// never run and no port is really probed: the command runner and the port probe are fakes.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COMPOSE_FILE,
  CONNECTION,
  PORTS,
  composeArgs,
  composeEnv,
  connectionFor,
  parseArgs,
  pnpmInvocation,
  probePort,
  psArgs,
  resolvePorts,
  runDev,
} from './dev.mjs';

/**
 * A fake runner: answers each command from `answers` (default success, nothing running) and
 * records the calls and the options each call got. `busy` lists the host ports the fake probe
 * reports as taken; `env` is the user's environment. `childCodes` are the exit codes the fake
 * foreground child processes (seed, then server) return in turn; they are recorded in `children`.
 */
function harness({ answers = {}, busy = [], env = {}, childCodes = [] } = {}) {
  const calls = [];
  const options = [];
  const probed = [];
  const out = [];
  const err = [];
  const run = (command, args, opts) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    options.push(opts);
    const key = Object.keys(answers).find((k) => line.includes(k));
    return key ? answers[key] : { status: 0, stdout: '' };
  };
  const portInUse = async (port) => {
    probed.push(port);
    return busy.includes(port);
  };
  const children = [];
  const runChild = async (command, args, opts) => {
    children.push({ line: [command, ...args].join(' '), env: opts?.env });
    return childCodes[children.length - 1] ?? 0;
  };
  const deps = {
    run,
    runChild,
    portInUse,
    env,
    log: (s) => out.push(s),
    error: (s) => err.push(s),
  };
  return { calls, options, probed, children, out, err, deps };
}

const compose = (...rest) => ['docker', 'compose', '-f', COMPOSE_FILE, ...rest].join(' ');
const PS = compose('ps', '--services', '--status', 'running');
const UP = compose('up', '-d', '--wait', '--wait-timeout', '120');

// The default output, unchanged by the port overrides (T0.6 slice 1).
const DEFAULT_SUMMARY = [
  '',
  'Dev services are up and healthy (bound to 127.0.0.1 only).',
  '  PostgreSQL   postgres://pulse:pulse@localhost:5432/pulse',
  '  SMTP         localhost:1025 (no auth, no TLS)',
  '  Mail UI      http://localhost:8025',
  '',
  'Server settings for these services:',
  '  DATABASE_URL=postgres://pulse:pulse@localhost:5432/pulse',
  '  SMTP_HOST=localhost',
  '  SMTP_PORT=1025',
  '',
  'Next: pnpm --filter @pulse/server dev   (and pnpm dev:seed once the server has seed files)',
].join('\n');

describe('parseArgs', () => {
  it('accepts exactly one known command', () => {
    for (const command of ['up', 'down', 'reset', 'start']) {
      assert.deepEqual(parseArgs([command]), { command });
    }
  });

  it('answers --help and -h with usage', () => {
    assert.deepEqual(parseArgs(['--help']), { help: true });
    assert.deepEqual(parseArgs(['-h']), { help: true });
  });

  it('rejects no command, an unknown command and extra arguments', () => {
    assert.match(parseArgs([]).error, /Usage/);
    assert.match(parseArgs(['restart']).error, /Unknown command "restart"/);
    assert.match(parseArgs(['up', 'extra']).error, /Usage/);
  });
});

describe('composeArgs', () => {
  it('up starts detached and waits for the health checks with a timeout', () => {
    assert.deepEqual(composeArgs('up'), [
      'compose',
      '-f',
      COMPOSE_FILE,
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      '120',
    ]);
  });

  it('down keeps the data volume, reset removes it', () => {
    assert.ok(!composeArgs('down').includes('-v'));
    assert.ok(composeArgs('reset').includes('-v'));
    assert.equal(composeArgs('reset')[3], 'down');
  });

  it('lists the running services for the same project file', () => {
    assert.deepEqual(psArgs(), [
      'compose',
      '-f',
      COMPOSE_FILE,
      'ps',
      '--services',
      '--status',
      'running',
    ]);
  });
});

describe('resolvePorts', () => {
  it('defaults to 5432, 1025 and 8025, also for empty variables', () => {
    const defaults = { db: 5432, smtp: 1025, mailUi: 8025 };
    assert.deepEqual(resolvePorts({}).ports, defaults);
    assert.deepEqual(
      resolvePorts({ PULSE_DEV_DB_PORT: '', PULSE_DEV_SMTP_PORT: '' }).ports,
      defaults,
    );
  });

  it('reads each override from its variable', () => {
    const env = {
      PULSE_DEV_DB_PORT: '5433',
      PULSE_DEV_SMTP_PORT: '2525',
      PULSE_DEV_MAIL_UI_PORT: '8026',
    };
    assert.deepEqual(resolvePorts(env).ports, { db: 5433, smtp: 2525, mailUi: 8026 });
  });

  it('accepts the bounds 1 and 65535', () => {
    const { ports } = resolvePorts({ PULSE_DEV_DB_PORT: '1', PULSE_DEV_SMTP_PORT: '65535' });
    assert.deepEqual([ports.db, ports.smtp], [1, 65535]);
  });

  it('rejects anything that is not a whole number from 1 to 65535, naming the variable', () => {
    for (const bad of ['0', '65536', '-1', '5432.5', 'abc', '54 32', '0x1F90', '1e3', '123456']) {
      const { error } = resolvePorts({ PULSE_DEV_SMTP_PORT: bad });
      assert.match(error, /PULSE_DEV_SMTP_PORT must be a whole number from 1 to 65535/, bad);
      assert.ok(error.includes(`"${bad}"`), `the message shows ${bad}`);
    }
  });

  it('rejects two services on the same port', () => {
    const { error } = resolvePorts({ PULSE_DEV_DB_PORT: '1025' });
    assert.match(error, /PULSE_DEV_DB_PORT and PULSE_DEV_SMTP_PORT are both 1025/);
  });
});

describe('connectionFor and composeEnv', () => {
  it('builds the connection values from the ports', () => {
    assert.deepEqual(connectionFor({ db: 5433, smtp: 2525, mailUi: 8026 }), {
      databaseUrl: 'postgres://pulse:pulse@localhost:5433/pulse',
      smtpHost: 'localhost',
      smtpPort: 2525,
      mailUi: 'http://localhost:8026',
    });
  });

  it('hands Compose the resolved ports under the variable names the compose file reads', () => {
    assert.deepEqual(composeEnv({ db: 5433, smtp: 1025, mailUi: 8025 }), {
      PULSE_DEV_DB_PORT: '5433',
      PULSE_DEV_SMTP_PORT: '1025',
      PULSE_DEV_MAIL_UI_PORT: '8025',
    });
  });
});

describe('the compose file', () => {
  const text = readFileSync(COMPOSE_FILE, 'utf8');
  // Every entry under `ports:`, e.g. 127.0.0.1:${PULSE_DEV_DB_PORT:-5432}:5432
  const published = [...text.matchAll(/^\s+- '([^'\n]*:\d+)'\s*$/gm)].map((m) => m[1]);

  it('checks PostgreSQL readiness over TCP, so the initdb-phase socket server does not count', () => {
    const check = text.match(/test: \['CMD-SHELL', '(pg_isready[^']*)'\]/);
    assert.ok(check, 'a pg_isready healthcheck');
    assert.match(check[1], /-h 127\.0\.0\.1\b/);
    assert.match(check[1], /-U pulse -d pulse/);
  });

  it('lives in infra/ next to, and not as, the deployment file', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    assert.equal(COMPOSE_FILE, join(root, 'infra', 'docker-compose.dev.yml'));
  });

  it('publishes every port on the loopback interface only', () => {
    assert.equal(published.length, 3, 'database, SMTP and mail UI ports expected');
    for (const mapping of published) {
      assert.match(mapping, /^127\.0\.0\.1:\$\{[A-Z_]+:-\d+\}:\d+$/);
    }
  });

  it('reads the override variables with the defaults the script uses', () => {
    for (const { variable, fallback } of Object.values(PORTS)) {
      assert.ok(
        published.some((m) => m.startsWith(`127.0.0.1:\${${variable}:-${fallback}}:`)),
        `${variable} with default ${fallback}`,
      );
    }
  });

  it('keeps the container ports the services listen on', () => {
    assert.deepEqual(
      published.map((m) => m.split(':').at(-1)),
      ['5432', '1025', '8025'],
    );
  });

  it('matches the documented default connection values', () => {
    assert.equal(CONNECTION.databaseUrl, 'postgres://pulse:pulse@localhost:5432/pulse');
    assert.equal(CONNECTION.smtpPort, 1025);
    assert.equal(CONNECTION.mailUi, 'http://localhost:8025');
  });
});

describe('runDev up', () => {
  it('checks docker and the ports, starts the services, prints the default output', async () => {
    const h = harness();
    assert.equal(await runDev('up', h.deps), 0);
    assert.deepEqual(h.calls, ['docker compose version', 'docker info', PS, UP]);
    assert.deepEqual(h.probed, [5432, 1025, 8025]);
    assert.equal(h.out.join('\n'), DEFAULT_SUMMARY);
    assert.equal(h.err.length, 0);
  });

  it('hands Compose the resolved ports and the terminal', async () => {
    const h = harness({ env: { PULSE_DEV_DB_PORT: '5433' } });
    await runDev('up', h.deps);
    const upOptions = h.options.at(-1);
    assert.equal(upOptions.inherit, true);
    assert.deepEqual(upOptions.env, {
      PULSE_DEV_DB_PORT: '5433',
      PULSE_DEV_SMTP_PORT: '1025',
      PULSE_DEV_MAIL_UI_PORT: '8025',
    });
  });

  it('prints the ports actually in use', async () => {
    const h = harness({
      env: {
        PULSE_DEV_DB_PORT: '5433',
        PULSE_DEV_SMTP_PORT: '2525',
        PULSE_DEV_MAIL_UI_PORT: '8026',
      },
    });
    assert.equal(await runDev('up', h.deps), 0);
    assert.deepEqual(h.probed, [5433, 2525, 8026]);
    const text = h.out.join('\n');
    assert.match(text, /PostgreSQL {3}postgres:\/\/pulse:pulse@localhost:5433\/pulse/);
    assert.match(text, /DATABASE_URL=postgres:\/\/pulse:pulse@localhost:5433\/pulse/);
    assert.match(text, /SMTP_PORT=2525/);
    assert.match(text, /SMTP {9}localhost:2525/);
    assert.match(text, /http:\/\/localhost:8026/);
    assert.equal(text.includes('5432'), false);
  });

  it('shows how to set DATABASE_URL in Git Bash and in PowerShell for a non-default port', async () => {
    const h = harness({ env: { PULSE_DEV_DB_PORT: '5433' } });
    await runDev('up', h.deps);
    const text = h.out.join('\n');
    assert.ok(text.includes('export DATABASE_URL=postgres://pulse:pulse@localhost:5433/pulse'));
    assert.ok(text.includes("$env:DATABASE_URL = 'postgres://pulse:pulse@localhost:5433/pulse'"));
  });

  it('prints no shell hints for the default database port', async () => {
    const h = harness({ env: { PULSE_DEV_SMTP_PORT: '2525' } });
    await runDev('up', h.deps);
    assert.equal(h.out.join('\n').includes('$env:DATABASE_URL'), false);
  });

  it('exits 2 on a bad port setting before touching Docker', async () => {
    const h = harness({ env: { PULSE_DEV_MAIL_UI_PORT: '70000' } });
    assert.equal(await runDev('up', h.deps), 2);
    assert.match(h.err.join('\n'), /PULSE_DEV_MAIL_UI_PORT must be a whole number/);
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.probed, []);
  });

  it('fails early naming each taken port and its override, starting nothing', async () => {
    const h = harness({ busy: [5432, 8025] });
    assert.equal(await runDev('up', h.deps), 1);
    const text = h.err.join('\n');
    assert.match(
      text,
      /PostgreSQL: 127\.0\.0\.1:5432 is already in use \(override with PULSE_DEV_DB_PORT\)/,
    );
    assert.match(
      text,
      /mail UI: 127\.0\.0\.1:8025 is already in use \(override with PULSE_DEV_MAIL_UI_PORT\)/,
    );
    assert.equal(text.includes('SMTP:'), false);
    assert.match(text, /local PostgreSQL on 5432 is common/);
    assert.equal(h.calls.includes(UP), false);
    assert.equal(h.out.length, 0);
  });

  it('suggests any free port, with an example for every taken port in both shells', async () => {
    const h = harness({ busy: [5432, 8025] });
    await runDev('up', h.deps);
    const text = h.err.join('\n');
    assert.match(text, /any free port/);
    assert.ok(text.includes('PULSE_DEV_DB_PORT=15432 PULSE_DEV_MAIL_UI_PORT=18025 pnpm dev:up'));
    assert.ok(
      text.includes(
        '$env:PULSE_DEV_DB_PORT = 15432; $env:PULSE_DEV_MAIL_UI_PORT = 18025; pnpm dev:up',
      ),
    );
    assert.equal(text.includes('SMTP_PORT='), false);
  });

  it('never suggests the port that is taken', async () => {
    const h = harness({ busy: [15432], env: { PULSE_DEV_DB_PORT: '15432' } });
    await runDev('up', h.deps);
    const text = h.err.join('\n');
    assert.equal(text.includes('PULSE_DEV_DB_PORT=15432'), false);
    assert.match(text, /PULSE_DEV_DB_PORT=15433 pnpm dev:up/);
  });

  it('names the command the user ran in the busy-port example', async () => {
    const up = harness({ busy: [5432] });
    await runDev('up', up.deps);
    assert.match(up.err.join('\n'), /PULSE_DEV_DB_PORT=15432 pnpm dev:up/);
    const start = harness({ busy: [5432] });
    await runDev('start', start.deps);
    const text = start.err.join('\n');
    assert.match(text, /PULSE_DEV_DB_PORT=15432 pnpm dev$/m);
    assert.equal(text.includes('pnpm dev:up'), false);
  });

  it('does not count a port as taken when its own service already runs there', async () => {
    const h = harness({
      busy: [5432, 1025, 8025],
      answers: { ' ps ': { status: 0, stdout: 'db\nmailpit\n' } },
    });
    assert.equal(await runDev('up', h.deps), 0);
    assert.deepEqual(h.probed, []);
    assert.equal(h.calls.at(-1), UP);
  });

  it('still probes the ports of a service that is not running', async () => {
    const h = harness({
      busy: [5432, 1025],
      answers: { ' ps ': { status: 0, stdout: 'db\n' } },
    });
    assert.equal(await runDev('up', h.deps), 1);
    assert.deepEqual(h.probed, [1025, 8025]);
    assert.match(h.err.join('\n'), /SMTP: 127\.0\.0\.1:1025/);
    assert.equal(h.err.join('\n').includes('PostgreSQL:'), false);
  });

  it('treats a failing `ps` as nothing running', async () => {
    const h = harness({ busy: [1025], answers: { ' ps ': { status: 1 } } });
    assert.equal(await runDev('up', h.deps), 1);
    assert.deepEqual(h.probed, [5432, 1025, 8025]);
  });

  it('fails with a pointer to the logs when compose fails, and prints no URLs', async () => {
    const h = harness({ answers: { ' up': { status: 1 } } });
    assert.equal(await runDev('up', h.deps), 1);
    assert.match(h.err.join('\n'), /compose -f infra\/docker-compose\.dev\.yml logs/);
    assert.equal(h.out.join('\n').includes('localhost:8025'), false);
  });

  it('suggests dev:down when compose fails, for services started on other ports', async () => {
    const h = harness({ answers: { ' up': { status: 1 } } });
    await runDev('up', h.deps);
    assert.match(h.err.join('\n'), /ports changed since the last start.*`pnpm dev:down`/s);
  });

  it('words the failure the same for pnpm dev, without naming dev:up', async () => {
    const h = harness({ answers: { ' up': { status: 1 } } });
    await runDev('start', h.deps);
    const text = h.err.join('\n');
    assert.match(text, /ports changed since the last start.*`pnpm dev:down`/s);
    assert.equal(text.includes('pnpm dev:up'), false);
  });
});

describe('runDev down and reset', () => {
  it('down stops the services and says the data is kept, without probing ports', async () => {
    const h = harness({ busy: [5432] });
    assert.equal(await runDev('down', h.deps), 0);
    assert.equal(h.calls.at(-1), compose('down'));
    assert.deepEqual(h.probed, []);
    assert.match(h.out.join('\n'), /kept/);
  });

  it('reset drops the volume and says what to run next', async () => {
    const h = harness();
    assert.equal(await runDev('reset', h.deps), 0);
    assert.equal(h.calls.at(-1), compose('down', '-v'));
    const text = h.out.join('\n');
    assert.match(text, /deleted/);
    assert.match(text, /pnpm dev:up/);
  });

  it('propagates a compose failure', async () => {
    const h = harness({ answers: { ' down': { status: 3 } } });
    assert.equal(await runDev('down', h.deps), 3);
  });
});

describe('docker preflight', () => {
  it('names the missing docker CLI and runs nothing else', async () => {
    const h = harness({
      answers: {
        'compose version': { error: Object.assign(new Error('x'), { code: 'ENOENT' }) },
      },
    });
    assert.equal(await runDev('up', h.deps), 1);
    assert.match(h.err.join('\n'), /Docker with Compose v2 is not installed/);
    assert.deepEqual(h.calls, ['docker compose version']);
  });

  it('names a Docker without Compose v2', async () => {
    const h = harness({ answers: { 'compose version': { status: 1 } } });
    assert.equal(await runDev('down', h.deps), 1);
    assert.match(h.err.join('\n'), /Compose v2/);
  });

  it('tells the user to start the daemon when it is not running, before probing ports', async () => {
    const h = harness({ answers: { 'docker info': { status: 1 } } });
    assert.equal(await runDev('up', h.deps), 1);
    assert.match(h.err.join('\n'), /not running.*Docker Desktop/s);
    assert.deepEqual(h.probed, []);
    assert.equal(
      h.calls.some((c) => c.includes(' up')),
      false,
    );
  });
});

describe('probePort', () => {
  it('reports a port with a listener as in use and a closed one as free', async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      assert.equal(await probePort(port), true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    assert.equal(await probePort(port), false);
  });
});

// ---------------------------------------------------------------------------------------------
// QA edge cases (T0.6): port parsing, repeated runs, the compose file's isolation from production
// and the Docker-free check. Still no Docker and no real probing.

describe('resolvePorts: values a contributor might type', () => {
  const db = (value) => resolvePorts({ PULSE_DEV_DB_PORT: value });

  it('accepts the boundaries and plain whole numbers', () => {
    assert.equal(db('1').ports.db, 1);
    assert.equal(db('65535').ports.db, 65535);
    assert.equal(db('5433').ports.db, 5433);
  });

  it('treats an unset or empty variable as the default, like Compose does', () => {
    assert.deepEqual(resolvePorts({}).ports, { db: 5432, smtp: 1025, mailUi: 8025 });
    assert.deepEqual(db('').ports, { db: 5432, smtp: 1025, mailUi: 8025 });
  });

  for (const bad of [
    '0',
    '00',
    '65536',
    '99999',
    '123456',
    '-1',
    '+5433',
    '1e3',
    '0x1F90',
    '5433.0',
    '5433.5',
    ' 5433',
    '5433 ',
    '5433\n',
    ' ',
    'abc',
    '５４３３',
    '٥٤٣٣',
    'Infinity',
    'NaN',
  ]) {
    it(`rejects ${JSON.stringify(bad)} naming the variable`, () => {
      const result = db(bad);
      assert.equal(result.ports, undefined);
      assert.match(result.error, /^PULSE_DEV_DB_PORT must be a whole number from 1 to 65535, got /);
    });
  }

  it('rejects the same port twice, whichever pair', () => {
    for (const [a, b] of [
      ['PULSE_DEV_DB_PORT', 'PULSE_DEV_SMTP_PORT'],
      ['PULSE_DEV_DB_PORT', 'PULSE_DEV_MAIL_UI_PORT'],
      ['PULSE_DEV_SMTP_PORT', 'PULSE_DEV_MAIL_UI_PORT'],
    ]) {
      const result = resolvePorts({ [a]: '4000', [b]: '4000' });
      assert.match(result.error, new RegExp(`${a} and ${b} are both 4000`));
    }
  });

  it('rejects an override that collides with another default', () => {
    assert.match(db('1025').error, /both 1025/);
    assert.match(db('8025').error, /both 8025/);
    assert.match(resolvePorts({ PULSE_DEV_SMTP_PORT: '5432' }).error, /both 5432/);
  });

  it('normalises a zero-padded number so Compose and the probe see the same port', () => {
    assert.equal(db('05433').ports.db, 5433);
    assert.equal(composeEnv(db('05433').ports).PULSE_DEV_DB_PORT, '5433');
  });

  it('reports a bad variable before a collision', () => {
    const result = resolvePorts({ PULSE_DEV_DB_PORT: 'x', PULSE_DEV_SMTP_PORT: '1025' });
    assert.match(result.error, /PULSE_DEV_DB_PORT must be a whole number/);
  });
});

describe('runDev: repeated and out-of-order commands', () => {
  const allRunning = { ' ps ': { status: 0, stdout: 'db\nmailpit\n' } };

  it('up twice gives the same output and does not trip over its own ports', async () => {
    const first = harness();
    assert.equal(await runDev('up', first.deps), 0);
    const second = harness({ busy: [5432, 1025, 8025], answers: allRunning });
    assert.equal(await runDev('up', second.deps), 0);
    assert.equal(second.out.join('\n'), first.out.join('\n'));
    assert.equal(second.err.length, 0);
  });

  it('reset with the services already down still runs `down -v` and succeeds', async () => {
    const h = harness({ busy: [5432] });
    assert.equal(await runDev('reset', h.deps), 0);
    assert.deepEqual(h.calls, ['docker compose version', 'docker info', compose('down', '-v')]);
    assert.deepEqual(h.probed, []);
  });

  it('down then reset then down never probes ports and never prints URLs', async () => {
    for (const command of ['down', 'reset', 'down']) {
      const h = harness({ busy: [5432, 1025, 8025] });
      assert.equal(await runDev(command, h.deps), 0);
      assert.deepEqual(h.probed, []);
      assert.equal(h.out.join('\n').includes('postgres://'), false);
    }
  });

  it('reset ignores a taken port but still rejects a malformed one before Docker', async () => {
    const busyOne = harness({ busy: [5433], env: { PULSE_DEV_DB_PORT: '5433' } });
    assert.equal(await runDev('reset', busyOne.deps), 0);
    const malformed = harness({ env: { PULSE_DEV_DB_PORT: 'x' } });
    assert.equal(await runDev('reset', malformed.deps), 2);
    assert.deepEqual(malformed.calls, []);
  });

  it('only reset removes volumes, and no command removes images, orphans or other projects', () => {
    for (const command of ['up', 'down', 'reset']) {
      const args = composeArgs(command).join(' ');
      assert.equal(/--rmi|--remove-orphans|--volumes|prune/.test(args), false, args);
    }
    assert.equal(composeArgs('down').includes('-v'), false);
    assert.equal(composeArgs('up').includes('-v'), false);
    assert.equal(composeArgs('reset').includes('-v'), true);
    for (const command of ['up', 'down', 'reset']) {
      assert.deepEqual(composeArgs(command).slice(0, 3), ['compose', '-f', COMPOSE_FILE]);
    }
  });

  it('returns 1 for a spawn error that carries no exit status', async () => {
    const h = harness({ answers: { ' down': { error: new Error('spawn failed') } } });
    assert.equal(await runDev('down', h.deps), 1);
  });
});

describe('the dev compose file holds nothing a deployment could pick up', () => {
  const text = readFileSync(COMPOSE_FILE, 'utf8');
  const code = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

  it('is not a file Compose finds on its own, and not the deployment file', () => {
    const name = COMPOSE_FILE.split(/[\\/]/).at(-1);
    for (const auto of [
      'compose.yaml',
      'compose.yml',
      'docker-compose.yaml',
      'docker-compose.yml',
      'docker-compose.override.yml',
      'compose.override.yml',
    ]) {
      assert.notEqual(name, auto);
    }
  });

  it('interpolates only the three PULSE_DEV_ port variables, never a secret or an .env value', () => {
    const variables = [...code.matchAll(/\$\{([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(variables)].sort(), [
      'PULSE_DEV_DB_PORT',
      'PULSE_DEV_MAIL_UI_PORT',
      'PULSE_DEV_SMTP_PORT',
    ]);
    assert.equal(/\$[A-Za-z]/.test(code), false, 'no bare $VARIABLE interpolation');
  });

  it('has no env_file, host networking, privileges, restart policy, bind mounts or extra networks', () => {
    for (const forbidden of [
      /env_file/,
      /network_mode/,
      /privileged/,
      /restart:/,
      /cap_add/,
      /pid:/,
      /extra_hosts/,
      /networks:/,
      /secrets:/,
      /configs:/,
      /profiles:/,
      /\.\//,
      /\/var\/run\/docker\.sock/,
      /0\.0\.0\.0/,
      /expose:/,
    ]) {
      assert.equal(forbidden.test(code), false, String(forbidden));
    }
  });

  it('has exactly two services, one named volume, a fixed project name and pinned images', () => {
    assert.match(code, /^name: pulse-dev$/m);
    const services = code.slice(code.indexOf('services:'), code.indexOf('\nvolumes:'));
    assert.deepEqual(
      [...services.matchAll(/^ {2}([a-z]+):\s*$/gm)].map((m) => m[1]),
      ['db', 'mailpit'],
    );
    assert.deepEqual(
      [...code.matchAll(/^\s+image: (\S+)/gm)].map((m) => m[1]),
      ['postgres:17-alpine', 'axllent/mailpit:v1.32.0'],
    );
    assert.equal(/:latest\b/.test(code), false);
    assert.match(code, /^volumes:\n {2}db-data:\s*$/m);
    assert.equal([...code.matchAll(/^\s+- (db-data:[^\n]+)$/gm)].length, 1);
  });

  it('keeps the credentials public and equal to what dev.mjs prints', () => {
    assert.match(code, /POSTGRES_USER: pulse\n/);
    assert.match(code, /POSTGRES_PASSWORD: pulse\n/);
    assert.match(code, /POSTGRES_DB: pulse\n/);
    assert.equal(CONNECTION.databaseUrl, 'postgres://pulse:pulse@localhost:5432/pulse');
  });

  it('gives each service a healthcheck that --wait can use', () => {
    assert.equal([...code.matchAll(/healthcheck:/g)].length, 2);
  });
});

describe('pnpm verify and CI stay Docker-free', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

  it('check.mjs never runs docker, compose or the dev script', () => {
    const source = read('scripts', 'check.mjs');
    assert.equal(/docker|compose|mailpit|dev\.mjs|dev:up|dev:seed/i.test(source), false);
  });

  it('the verify and check scripts do not reach the dev scripts', () => {
    const { scripts } = JSON.parse(read('package.json'));
    for (const name of ['verify', 'check', 'lint', 'format']) {
      assert.equal(/dev[:.]|docker/.test(scripts[name]), false, name);
    }
    assert.equal(scripts['dev:up'], 'node scripts/dev.mjs up');
    assert.equal(scripts['dev:down'], 'node scripts/dev.mjs down');
    assert.equal(scripts['dev:reset'], 'node scripts/dev.mjs reset');
    assert.equal(scripts['dev:seed'], 'pnpm --filter @pulse/server seed');
  });

  it('no workflow starts the dev services or the seed runner', () => {
    const dir = join(root, '.github', 'workflows');
    for (const entry of readdirSync(dir)) {
      const workflow = readFileSync(join(dir, entry), 'utf8');
      assert.equal(
        /docker-compose\.dev|dev:up|dev:seed|dev:reset|dev\.mjs|mailpit/i.test(workflow),
        false,
        entry,
      );
    }
  });

  it('the server test run never starts Docker itself (T1.1: its PostgreSQL integration tests expect one from the environment)', () => {
    const config = read('apps', 'server', 'vitest.config.ts');
    assert.equal(/globalSetup|DATABASE_URL|docker/i.test(config), false);
  });
});

// QA round 2 (T0.6): Bug 6 output forms, Bug 2 healthcheck, Bug 3 mitigation text.
describe('round 2: DATABASE_URL hints and the PostgreSQL healthcheck', () => {
  const hintsFor = async (env) => {
    const h = harness({ env });
    assert.equal(await runDev('up', h.deps), 0);
    return h.out.join('\n');
  };

  it('prints both shell forms, correctly quoted, for any changed database port', async () => {
    for (const port of ['5433', '1', '65535', '05433']) {
      const text = await hintsFor({ PULSE_DEV_DB_PORT: port });
      const url = `postgres://pulse:pulse@localhost:${Number(port)}/pulse`;
      assert.ok(text.includes(`  Git Bash / Linux:  export DATABASE_URL=${url}\n`), port);
      assert.ok(text.includes(`  PowerShell:        $env:DATABASE_URL = '${url}'\n`), port);
      assert.equal(text.includes('5432'), false);
    }
  });

  it('hides the hint for default ports, for an explicit 5432 and when only mail ports change', async () => {
    for (const env of [
      {},
      { PULSE_DEV_DB_PORT: '5432' },
      { PULSE_DEV_DB_PORT: '' },
      { PULSE_DEV_SMTP_PORT: '2525' },
      { PULSE_DEV_MAIL_UI_PORT: '8026' },
    ]) {
      const text = await hintsFor(env);
      assert.equal(/PowerShell|export DATABASE_URL|Not the default/.test(text), false);
    }
  });

  it("gives the PostgreSQL healthcheck a TCP host, so initdb's socket-only server does not count", () => {
    const text = readFileSync(COMPOSE_FILE, 'utf8');
    assert.match(text, /pg_isready -h 127\.0\.0\.1 -U pulse -d pulse/);
  });

  it('points a failed up at dev:down when ports changed', async () => {
    const h = harness({ answers: { ' up': { status: 1 } } });
    assert.equal(await runDev('up', h.deps), 1);
    assert.match(h.err.join('\n'), /pnpm dev:down/);
  });
});

describe('runDev start (pnpm dev)', () => {
  const SEED = 'pnpm --filter @pulse/server seed';
  const SERVER = 'pnpm --filter @pulse/server dev';

  it('starts the services, seeds, then runs the server in the foreground, in that order', async () => {
    const h = harness();
    assert.equal(await runDev('start', h.deps), 0);
    assert.deepEqual(h.calls, ['docker compose version', 'docker info', PS, UP]);
    assert.deepEqual(
      h.children.map((c) => c.line),
      [SEED, SERVER],
    );
    assert.equal(h.err.length, 0);
  });

  it('gives the seed step DATABASE_URL and the server DATABASE_URL, SMTP_HOST and SMTP_PORT', async () => {
    const h = harness();
    await runDev('start', h.deps);
    const [seed, server] = h.children;
    assert.deepEqual(seed.env, { DATABASE_URL: 'postgres://pulse:pulse@localhost:5432/pulse' });
    assert.deepEqual(server.env, {
      DATABASE_URL: 'postgres://pulse:pulse@localhost:5432/pulse',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
    });
  });

  it('takes the settings from the resolved ports, and overrides a DATABASE_URL of the user', async () => {
    const h = harness({
      env: {
        PULSE_DEV_DB_PORT: '5433',
        PULSE_DEV_SMTP_PORT: '2525',
        DATABASE_URL: 'postgres://someone@elsewhere/other',
      },
    });
    assert.equal(await runDev('start', h.deps), 0);
    assert.deepEqual(h.probed, [5433, 2525, 8025]);
    for (const child of h.children) {
      assert.equal(child.env.DATABASE_URL, 'postgres://pulse:pulse@localhost:5433/pulse');
    }
    assert.equal(h.children[1].env.SMTP_PORT, '2525');
  });

  it('prints the services summary without the "Next" line or the manual DATABASE_URL hint', async () => {
    const h = harness({ env: { PULSE_DEV_DB_PORT: '5433' } });
    await runDev('start', h.deps);
    const text = h.out.join('\n');
    assert.match(text, /Dev services are up and healthy/);
    assert.match(text, /postgres:\/\/pulse:pulse@localhost:5433\/pulse/);
    assert.equal(text.includes('Next:'), false);
    assert.equal(text.includes('$env:DATABASE_URL'), false);
  });

  it('returns the exit code of the server', async () => {
    const h = harness({ childCodes: [0, 7] });
    assert.equal(await runDev('start', h.deps), 7);
  });

  it('stops without starting the server when the seed step fails, returning its code', async () => {
    const h = harness({ childCodes: [3] });
    assert.equal(await runDev('start', h.deps), 3);
    assert.deepEqual(
      h.children.map((c) => c.line),
      [SEED],
    );
    assert.match(h.err.join('\n'), /Seeding failed.*server was not started/s);
  });

  it('runs neither seed nor server when the services fail to start', async () => {
    const h = harness({ answers: { ' up': { status: 4 } } });
    assert.equal(await runDev('start', h.deps), 4);
    assert.deepEqual(h.children, []);
  });

  it('runs neither seed nor server when a host port is taken', async () => {
    const h = harness({ busy: [5432] });
    assert.equal(await runDev('start', h.deps), 1);
    assert.deepEqual(h.children, []);
    assert.match(h.err.join('\n'), /PULSE_DEV_DB_PORT/);
  });

  it('runs nothing when Docker is not running', async () => {
    const h = harness({ answers: { 'docker info': { status: 1 } } });
    assert.equal(await runDev('start', h.deps), 1);
    assert.deepEqual(h.children, []);
  });

  it('exits 2 on a bad port setting before any Docker call or child process', async () => {
    const h = harness({ env: { PULSE_DEV_SMTP_PORT: 'x' } });
    assert.equal(await runDev('start', h.deps), 2);
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.children, []);
  });

  it('starts pnpm through its own script without a shell when run by pnpm', () => {
    for (const script of ['C:\\pnpm\\bin\\pnpm.cjs', '/usr/lib/node_modules/pnpm/bin/pnpm.mjs']) {
      const { command, prefix, shell } = pnpmInvocation({ npm_execpath: script }, 'win32');
      assert.equal(command, process.execPath);
      assert.deepEqual(prefix, [script]);
      assert.equal(shell, false);
    }
  });

  it('falls back to `pnpm`, through a shell only on Windows, when not run by pnpm', () => {
    const fallbacks = [{}, { npm_execpath: '/usr/lib/node_modules/npm/bin/npm-cli.js' }];
    for (const env of fallbacks) {
      assert.deepEqual(pnpmInvocation(env, 'win32'), { command: 'pnpm', prefix: [], shell: true });
      assert.deepEqual(pnpmInvocation(env, 'linux'), { command: 'pnpm', prefix: [], shell: false });
    }
  });

  it('is wired to the root script "dev", next to the individual commands', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(scripts.dev, 'node scripts/dev.mjs start');
    assert.equal(scripts['dev:up'], 'node scripts/dev.mjs up');
    assert.equal(scripts['dev:seed'], 'pnpm --filter @pulse/server seed');
  });
});

// QA round 3 (T0.6): the `start` flow and the ACTIONS refactor, plus parseArgs and pnpmInvocation.
describe('round 3: runDev start in detail', () => {
  it('with the services already running skips the port probe and still seeds and serves', async () => {
    const h = harness({
      busy: [5432, 1025, 8025],
      answers: { ' ps ': { status: 0, stdout: 'db\nmailpit\n' } },
    });
    assert.equal(await runDev('start', h.deps), 0);
    assert.deepEqual(h.probed, []);
    assert.equal(h.children.length, 2);
  });

  it('gives the seed step exactly DATABASE_URL and the server exactly three variables', async () => {
    const h = harness({
      env: {
        PULSE_DEV_DB_PORT: '5433',
        PULSE_DEV_SMTP_PORT: '2525',
        DATABASE_URL: 'postgres://u:p@prod.example.com/x',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
      },
    });
    await runDev('start', h.deps);
    const [seed, server] = h.children;
    assert.deepEqual(Object.keys(seed.env), ['DATABASE_URL']);
    assert.deepEqual(server.env, {
      DATABASE_URL: 'postgres://pulse:pulse@localhost:5433/pulse',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '2525',
    });
    assert.equal(JSON.stringify(h.children).includes('prod.example.com'), false);
    assert.equal(JSON.stringify(h.children).includes('smtp.example.com'), false);
  });

  it('never starts the server before the seed step has finished', async () => {
    const order = [];
    const h = harness();
    h.deps.runChild = async (command, args) => {
      order.push(`start ${args.at(-1)}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end ${args.at(-1)}`);
      return 0;
    };
    await runDev('start', h.deps);
    assert.deepEqual(order, ['start seed', 'end seed', 'start dev', 'end dev']);
  });

  it('passes the exit code through unchanged, including signal-style codes', async () => {
    for (const code of [0, 1, 2, 130, 143]) {
      const h = harness({ childCodes: [0, code] });
      assert.equal(await runDev('start', h.deps), code);
    }
    for (const code of [1, 2, 130]) {
      const h = harness({ childCodes: [code] });
      assert.equal(await runDev('start', h.deps), code);
      assert.equal(h.children.length, 1);
    }
  });

  it('starts nothing when compose is missing or `up` fails with any code', async () => {
    const missing = harness({
      answers: { 'compose version': { error: Object.assign(new Error('x'), { code: 'ENOENT' }) } },
    });
    assert.equal(await runDev('start', missing.deps), 1);
    assert.deepEqual(missing.children, []);
    for (const status of [1, 2, 125, 130]) {
      const h = harness({ answers: { ' up': { status } } });
      assert.equal(await runDev('start', h.deps), status);
      assert.deepEqual(h.children, []);
      assert.equal(h.out.join('\n').includes('Dev services are up'), false);
    }
    const spawnFailure = harness({ answers: { ' up': { error: new Error('spawn failed') } } });
    assert.equal(await runDev('start', spawnFailure.deps), 1);
    assert.deepEqual(spawnFailure.children, []);
  });

  it('does not touch Docker or a child when a port variable is bad, whichever one', async () => {
    for (const variable of ['PULSE_DEV_DB_PORT', 'PULSE_DEV_SMTP_PORT', 'PULSE_DEV_MAIL_UI_PORT']) {
      const h = harness({ env: { [variable]: '0' } });
      assert.equal(await runDev('start', h.deps), 2);
      assert.deepEqual(h.calls, []);
      assert.deepEqual(h.children, []);
      assert.deepEqual(h.probed, []);
    }
  });

  it('prints the summary once, before the seed step, and the foreground notice before the server', async () => {
    const h = harness();
    const seen = [];
    h.deps.log = (line) => seen.push(line.trim().split('\n').find(Boolean));
    h.deps.runChild = async (command, args) => {
      seen.push(`child ${args.at(-1)}`);
      return 0;
    };
    await runDev('start', h.deps);
    assert.deepEqual(seen, [
      'Dev services are up and healthy (bound to 127.0.0.1 only).',
      'Applying the seed files...',
      'child seed',
      'Starting the server in this terminal. Ctrl+C stops it; `pnpm dev:down` stops the services.',
      'child dev',
    ]);
  });
});

describe('round 3: the ACTIONS refactor kept dev:up, dev:down and dev:reset as they were', () => {
  it('up prints the standalone summary with the Next line and both shell hints for a custom port', async () => {
    const h = harness({ env: { PULSE_DEV_DB_PORT: '5433' } });
    assert.equal(await runDev('up', h.deps), 0);
    const text = h.out.join('\n');
    assert.match(text, /Next: pnpm --filter @pulse\/server dev/);
    assert.match(text, /export DATABASE_URL=postgres:\/\/pulse:pulse@localhost:5433\/pulse/);
    assert.match(text, /\$env:DATABASE_URL = 'postgres:\/\/pulse:pulse@localhost:5433\/pulse'/);
    assert.deepEqual(h.children, []);
  });

  it('down and reset: exact messages, no probe, no child, volume only for reset', async () => {
    const down = harness({ busy: [5432, 1025, 8025] });
    assert.equal(await runDev('down', down.deps), 0);
    assert.deepEqual(down.out, [
      'Dev services stopped. The database is kept; `pnpm dev:up` resumes it.',
    ]);
    const reset = harness({ busy: [5432, 1025, 8025] });
    assert.equal(await runDev('reset', reset.deps), 0);
    assert.deepEqual(reset.out, [
      'Dev services stopped and the database volume deleted. `pnpm dev:up` starts a fresh, empty database.',
    ]);
    for (const h of [down, reset]) {
      assert.deepEqual(h.probed, []);
      assert.deepEqual(h.children, []);
      assert.equal(h.calls.includes(PS), false);
    }
    assert.equal(down.calls.at(-1), compose('down'));
    assert.equal(reset.calls.at(-1), compose('down', '-v'));
  });

  it('failure messages of down and reset name the command that failed', async () => {
    const down = harness({ answers: { ' down': { status: 5 } } });
    assert.equal(await runDev('down', down.deps), 5);
    assert.deepEqual(down.err, ['`docker compose down` failed.']);
    const reset = harness({ answers: { ' down': { status: 6 } } });
    assert.equal(await runDev('reset', reset.deps), 6);
    assert.deepEqual(reset.err, ['`docker compose down -v` failed.']);
  });

  it('parseArgs accepts start, rejects extra arguments and unknown commands, and names pnpm dev', () => {
    assert.deepEqual(parseArgs(['start']), { command: 'start' });
    assert.ok(parseArgs(['start', 'now']).error);
    assert.ok(parseArgs(['START']).error);
    assert.ok(parseArgs(['serve']).error);
    assert.match(parseArgs([]).error, /\| dev\)/);
  });
});

describe('round 3: pnpmInvocation', () => {
  it('uses the pnpm script for .cjs, .mjs and .js, in a path with spaces, in any letter case', () => {
    for (const script of [
      'C:\\Users\\A B\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs',
      '/home/a b/.local/share/pnpm/pnpm.mjs',
      'D:\\tools\\PNPM\\bin\\PNPM.CJS',
      '/opt/pnpm/bin/pnpm.js',
    ]) {
      const result = pnpmInvocation({ npm_execpath: script }, 'win32');
      assert.deepEqual(result, { command: process.execPath, prefix: [script], shell: false });
    }
  });

  it('falls back for npm, yarn, a standalone pnpm.exe and an empty value', () => {
    for (const script of [
      '/usr/lib/node_modules/npm/bin/npm-cli.js',
      'C:\\yarn\\bin\\yarn.js',
      'C:\\pnpm\\pnpm.exe',
      '',
    ]) {
      assert.deepEqual(pnpmInvocation({ npm_execpath: script }, 'linux'), {
        command: 'pnpm',
        prefix: [],
        shell: false,
      });
    }
  });
});
