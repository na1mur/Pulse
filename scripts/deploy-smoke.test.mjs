// Tests for the pure parts of the deployment smoke test (scripts/deploy-smoke.mjs) and for the
// agreements between the deployment files that nothing else would notice drifting: the Node
// version in the Dockerfile, the variables Compose passes on, the template and the spec's list.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PULSE_VARIABLES,
  childEnv,
  composeCommand,
  externalNetworkOverride,
  generateSecret,
  isHealthy,
  proxyPortsOverride,
  publishedPorts,
  renderEnv,
  smokeOptions,
  waitFor,
} from './deploy-smoke.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

describe('generateSecret', () => {
  it('is hex of the requested size, so it is safe inside a connection URL', () => {
    const secret = generateSecret(32);
    assert.match(secret, /^[0-9a-f]{64}$/);
  });

  it('differs between calls', () => {
    assert.notEqual(generateSecret(32), generateSecret(32));
  });

  it('takes its randomness from the injected source', () => {
    assert.equal(
      generateSecret(2, () => Buffer.from([1, 255])),
      '01ff',
    );
  });
});

describe('renderEnv', () => {
  it('writes one NAME=value line per setting, empty values included', () => {
    assert.equal(renderEnv({ A: '1', DATABASE_URL: '' }), 'A=1\nDATABASE_URL=\n');
  });

  it('refuses a value with a line break, which would smuggle in a second setting', () => {
    assert.throws(() => renderEnv({ A: 'x\nB=1' }), /line break/);
  });

  it('refuses a name that is not an environment variable name', () => {
    assert.throws(() => renderEnv({ 'a b': '1' }), /bad variable name/);
  });
});

describe('childEnv', () => {
  it('removes the Pulse variables and Compose settings but keeps the rest', () => {
    const env = {
      PATH: '/bin',
      DOCKER_HOST: 'tcp://x',
      DATABASE_URL: 'postgres://dev',
      JWT_SECRET: 'x',
      COMPOSE_PROFILES: 'db',
      COMPOSE_PROJECT_NAME: 'other',
    };
    assert.deepEqual(childEnv(env), { PATH: '/bin', DOCKER_HOST: 'tcp://x' });
  });
});

describe('composeCommand', () => {
  const shared = ['-p', 'p', '--env-file', 'e.env', '-f', 'a.yml', '-f', 'b.yml'];
  const target = { project: 'p', envFile: 'e.env', files: ['a.yml', 'b.yml'] };

  it('runs `docker compose`, naming the project and env file and each file in order', () => {
    assert.deepEqual(composeCommand(target), {
      command: 'docker',
      args: ['compose', ...shared],
    });
  });

  it('runs a standalone Compose binary with the same arguments when one is given', () => {
    assert.deepEqual(composeCommand({ ...target, binary: '/opt/docker-compose' }), {
      command: '/opt/docker-compose',
      args: shared,
    });
  });
});

describe('smokeOptions', () => {
  it('defaults to `docker compose` and every step', () => {
    assert.deepEqual(smokeOptions([]), { compose: undefined, configOnly: false });
  });

  it('reads --compose and --config-only', () => {
    assert.deepEqual(smokeOptions(['--compose', '/opt/dc', '--config-only']), {
      compose: '/opt/dc',
      configOnly: true,
    });
  });

  it('refuses an unknown option instead of running everything', () => {
    assert.throws(() => smokeOptions(['--config']), /Unknown option/);
  });
});

describe('isHealthy', () => {
  it('needs the API and the database to report up', () => {
    assert.equal(isHealthy({ status: 'ok', database: 'up' }), true);
    assert.equal(isHealthy({ status: 'ok', database: 'down' }), false);
    assert.equal(isHealthy({ status: 'ok' }), false);
    assert.equal(isHealthy(null), false);
    assert.equal(isHealthy('ok'), false);
  });
});

describe('publishedPorts', () => {
  it('lists only ports that are bound on the host', () => {
    const text = '[{"URL":"","TargetPort":5432,"PublishedPort":0,"Protocol":"tcp"}]\n';
    assert.deepEqual(publishedPorts(text), []);
    const open = '[{"URL":"127.0.0.1","TargetPort":3000,"PublishedPort":3000,"Protocol":"tcp"}]';
    assert.deepEqual(publishedPorts(`${text}${open}\n`), [3000]);
  });

  it('accepts empty output', () => {
    assert.deepEqual(publishedPorts(''), []);
  });
});

describe('overrides', () => {
  it('moves Caddy to the given loopback ports', () => {
    const text = proxyPortsOverride({ httpPort: 18080, httpsPort: 18443 });
    assert.match(text, /ports: !override/);
    assert.match(text, /'127\.0\.0\.1:18080:80'/);
    assert.match(text, /'127\.0\.0\.1:18443:443'/);
  });

  it('attaches the server to the named external network', () => {
    const text = externalNetworkOverride('pulse-ext');
    assert.match(text, /external: true/);
    assert.match(text, /name: pulse-ext/);
  });
});

describe('waitFor', () => {
  const clock = () => {
    let time = 0;
    return { now: () => time, sleep: async (ms) => void (time += ms) };
  };

  it('returns the first truthy value', async () => {
    let calls = 0;
    const value = await waitFor(() => (++calls === 3 ? 'ready' : false), {
      timeoutMs: 10_000,
      ...clock(),
    });
    assert.equal(value, 'ready');
    assert.equal(calls, 3);
  });

  it('keeps going while the check throws', async () => {
    let calls = 0;
    const value = await waitFor(
      () => {
        if (++calls < 3) throw new Error('refused');
        return true;
      },
      { timeoutMs: 10_000, ...clock() },
    );
    assert.equal(value, true);
  });

  it('names what it waited for and the last error when time runs out', async () => {
    await assert.rejects(
      waitFor(
        () => {
          throw new Error('connection refused');
        },
        { timeoutMs: 2000, intervalMs: 500, what: '/health', ...clock() },
      ),
      /\/health did not succeed within 2 s: connection refused/,
    );
  });

  it('gives up without an error text when the check just kept answering false', async () => {
    await assert.rejects(
      waitFor(() => false, { timeoutMs: 1000, ...clock() }),
      (error) => /did not succeed within 1 s$/.test(error.message),
    );
  });
});

/** The text of one top-level service: from its "  name:" line to the next service or section. */
function serviceSection(compose, name) {
  const lines = compose.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `no service "${name}" in the compose file`);
  // The next line indented by at most two spaces starts the next service or top-level section.
  const end = lines.findIndex((line, index) => index > start && /^ {0,2}\S/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

/**
 * Every required-variable check (`${NAME:?…}` or `${NAME?…}`) written inside another `${…}`, as
 * "NAME inside OUTER". Compose v2 (2.20 to at least 2.38) evaluates such a check even when the
 * outer variable is set, Compose v5 does not; the deploy job broke on exactly that. `$$` is a
 * literal dollar sign, not an expression.
 */
function nestedRequiredChecks(text) {
  const found = [];
  const open = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith('$$', i)) {
      i += 1;
    } else if (text.startsWith('${', i)) {
      const [, name, required] = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(:?\?)?/.exec(text.slice(i)) ?? [];
      if (required && open.length > 0) found.push(`${name} inside ${open.at(-1)}`);
      open.push(name ?? '?');
      i += 1;
    } else if (text[i] === '}' && open.length > 0) {
      open.pop();
    }
  }
  return found;
}

describe('nestedRequiredChecks', () => {
  it('finds the required check nested in a default that broke CI on Compose v2.38', () => {
    const line = 'DATABASE_URL: ${DATABASE_URL:-postgres://pulse:${DB_PASSWORD:?Set it}@db/pulse}';
    assert.deepEqual(nestedRequiredChecks(line), ['DB_PASSWORD inside DATABASE_URL']);
    assert.deepEqual(nestedRequiredChecks('${A-${B?x}}'), ['B inside A']);
  });

  it('allows nested defaults, checks side by side and escaped dollar signs', () => {
    assert.deepEqual(nestedRequiredChecks('${A:-x${B:-}y} ${C:?c} ${D:?d}'), []);
    assert.deepEqual(nestedRequiredChecks('sh -c "test -n $${A} || { exit 1; }" ${B:?b}'), []);
  });
});

describe('deployment files agree with each other', () => {
  const compose = read('infra/docker-compose.yml');
  const template = read('infra/env.example.proposed');

  it('the Dockerfile uses the Node version of .node-version', () => {
    const wanted = read('.node-version').trim();
    const pinned = /^ARG NODE_VERSION=(\S+)$/m.exec(read('apps/server/Dockerfile'))?.[1];
    assert.equal(pinned, wanted);
  });

  it('Compose reads exactly the variables the smoke test knows about', () => {
    const used = new Set([...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)[:}?-]/g)].map((m) => m[1]));
    // COMPOSE_PROFILES is read by Compose itself, not named in the file.
    const known = new Set(PULSE_VARIABLES.filter((name) => name !== 'COMPOSE_PROFILES'));
    assert.deepEqual([...used].sort(), [...known].sort());
  });

  it('the server receives every server variable of spec Appendix A', () => {
    const row = /\| Server configuration \(`\.env`\) \|(.*)\|/.exec(
      read('docs/REBUILD_SPEC.md'),
    )?.[1];
    assert.ok(row, 'Appendix A has no server configuration row');
    const listed = [...row.matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((m) => m[1]);
    assert.ok(listed.includes('DATABASE_URL') && listed.includes('TRUST_PROXY'));
    const section = serviceSection(compose, 'server');
    for (const name of listed) {
      assert.match(
        section,
        new RegExp(`^\\s+${name}: `, 'm'),
        `${name} is not passed to the server`,
      );
    }
  });

  it('the env template documents every variable Compose reads', () => {
    for (const name of PULSE_VARIABLES) {
      assert.match(
        template,
        new RegExp(`^#?\\s*${name}=`, 'm'),
        `${name} is missing from the template`,
      );
    }
  });

  it('the template ships no real-looking secret', () => {
    for (const name of ['DB_PASSWORD', 'JWT_SECRET', 'REFRESH_SECRET']) {
      assert.match(
        template,
        new RegExp(`^${name}=$`, 'm'),
        `${name} must be empty in the template`,
      );
    }
  });

  it('the build context never includes environment files or keys', () => {
    const ignore = read('.dockerignore').split('\n');
    for (const pattern of ['*', '**/.env', '**/.env.*', '**/*.pem', '**/*.key']) {
      assert.ok(ignore.includes(pattern), `.dockerignore lacks ${pattern}`);
    }
  });

  it('no Compose file nests a required-variable check inside another variable', () => {
    const files = readdirSync(join(root, 'infra')).filter((name) => /\.ya?ml$/.test(name));
    assert.ok(files.includes('docker-compose.yml'));
    for (const name of files) {
      assert.deepEqual(nestedRequiredChecks(read(`infra/${name}`)), [], `infra/${name}`);
    }
  });

  it('the database service publishes no port', () => {
    const section = serviceSection(compose, 'db');
    assert.doesNotMatch(section, /^\s+ports:/m);
  });
});
