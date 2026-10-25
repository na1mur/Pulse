// Regression tests for the architecture-boundary rules in .dependency-cruiser.cjs. Each case runs
// the real config against a throwaway fixture in the OS temp folder, so no probe files land in the
// repo. Fake packages ship their entry file from dist/, as most npm packages do (QA T0.2 Bug 1:
// such imports were silently dropped by the build-output exclusion).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs');
const config = join(root, '.dependency-cruiser.cjs');

const fakePackages = ['dev-only', 'undeclared', 'ofetch', 'kysely', 'declared', '@tauri-apps/api'];
const files = {
  'apps/server/package.json': JSON.stringify({
    name: 'server',
    dependencies: { kysely: '1.0.0', declared: '1.0.0' },
    devDependencies: { 'dev-only': '1.0.0' },
  }),
  'apps/desktop/package.json': JSON.stringify({
    name: 'desktop',
    dependencies: { ofetch: '1.0.0', '@tauri-apps/api': '1.0.0' },
  }),
  'apps/server/src/uses-dev-dependency.ts': "import d from 'dev-only';\nexport const x = d;\n",
  'apps/server/src/uses-undeclared.ts': "import u from 'undeclared';\nexport const x = u;\n",
  'apps/server/src/domain/uses-database.ts': "import k from 'kysely';\nexport const x = k;\n",
  'apps/server/src/modules/timer/timer.controller.ts':
    "import k from 'kysely';\nexport const x = k;\n",
  'apps/server/src/clean.ts': "import c from 'declared';\nexport const x = c;\n",
  'apps/server/src/clean.spec.ts': "import d from 'dev-only';\nexport const x = d;\n",
  'apps/desktop/src/features/today/network.ts': "import o from 'ofetch';\nexport const x = o;\n",
  'apps/desktop/src/features/today/tauri.ts':
    "import t from '@tauri-apps/api';\nexport const x = t;\n",
  'apps/desktop/src/lib/core/tauri.ts': "import t from '@tauri-apps/api';\nexport const x = t;\n",
  // Build output stays excluded: this undeclared import must not be reported.
  'apps/server/dist/main.js': "import u from 'undeclared';\nexport const x = u;\n",
};
for (const name of fakePackages) {
  files[`node_modules/${name}/package.json`] = JSON.stringify({ name, main: 'dist/index.js' });
  files[`node_modules/${name}/dist/index.js`] = 'module.exports = {};\n';
}

let fixture;
let violations;

before(() => {
  fixture = mkdtempSync(join(tmpdir(), 'pulse-depcruise-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    writeFileSync(join(fixture, path), content);
  }
  const result = spawnSync(
    process.execPath,
    [cli, '--config', config, '--output-type', 'json', 'apps'],
    { cwd: fixture, encoding: 'utf8' },
  );
  assert.ok(result.stdout, `dependency-cruiser printed nothing: ${result.stderr}`);
  violations = JSON.parse(result.stdout).summary.violations.map(
    (violation) => `${violation.rule.name}: ${violation.from}`,
  );
});

after(() => {
  rmSync(fixture, { recursive: true, force: true });
});

describe('dependency-cruiser rules on packages that ship from dist/', () => {
  it('reports server production code importing a dev dependency', () => {
    assert.ok(violations.includes('server-not-to-dev-dep: apps/server/src/uses-dev-dependency.ts'));
  });

  it('reports a package missing from the importing package.json', () => {
    assert.ok(violations.includes('no-non-package-json: apps/server/src/uses-undeclared.ts'));
  });

  it('reports a network client in the desktop UI', () => {
    assert.ok(
      violations.includes('desktop-ui-no-network: apps/desktop/src/features/today/network.ts'),
    );
  });

  it('reports database access from the server domain and from controllers', () => {
    assert.ok(violations.includes('server-domain-pure: apps/server/src/domain/uses-database.ts'));
    assert.ok(
      violations.includes(
        'server-transport-no-database: apps/server/src/modules/timer/timer.controller.ts',
      ),
    );
  });

  it('reports Tauri imports outside lib/core', () => {
    assert.ok(
      violations.includes('tauri-api-only-in-lib-core: apps/desktop/src/features/today/tauri.ts'),
    );
  });

  it('reports nothing else: declared imports, tests, lib/core and build output pass', () => {
    assert.equal(violations.length, 6, violations.join('\n'));
  });
});
