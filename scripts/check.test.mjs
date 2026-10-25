// Tests for the one-command check's argument parsing and step plan (scripts/check.mjs).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseArgs, planSteps } from './check.mjs';

const names = (steps) => steps.map((step) => `${step.group}:${step.name}`);
const all = new Set(['docs', 'ts', 'rust', 'android']);

describe('parseArgs', () => {
  it('selects every group when no --only is given', () => {
    assert.deepEqual(parseArgs([]).groups, all);
  });

  it('collects repeated --only flags, in either spelling', () => {
    assert.deepEqual(
      parseArgs(['--only', 'ts', '--only=android']).groups,
      new Set(['ts', 'android']),
    );
  });

  it('rejects an unknown group and a missing value', () => {
    assert.throws(() => parseArgs(['--only', 'web']), /unknown group "web"/);
    assert.throws(() => parseArgs(['--only']), /--only needs a group/);
  });

  it('rejects unknown arguments instead of ignoring them', () => {
    assert.throws(() => parseArgs(['--fast']), /unknown argument "--fast"/);
  });
});

describe('planSteps', () => {
  const plan = (groups, platform = 'linux') =>
    planSteps({ groups: new Set(groups), platform, tsRoots: ['apps'] });

  it('runs the groups in the fixed order docs, ts, rust, android', () => {
    assert.deepEqual(names(plan(['android', 'rust', 'ts', 'docs'])), [
      'docs:docs check',
      'docs:hook and script tests',
      'ts:Prettier',
      'ts:ESLint',
      'ts:dependency-cruiser',
      'ts:boundary rule tests',
      'ts:contract up to date',
      'ts:type check',
      'ts:tests',
      'ts:build',
      'ts:contract mock smoke',
      'rust:rustfmt',
      'rust:contract types up to date',
      'rust:clippy',
      'rust:tests',
      'android:Gradle checks',
    ]);
  });

  it('builds the desktop UI first when Rust runs without the TypeScript group', () => {
    // The Tauri crate embeds apps/desktop/dist at compile time.
    assert.deepEqual(names(plan(['rust'])).slice(0, 2), ['rust:desktop UI build', 'rust:rustfmt']);
    assert.ok(!names(plan(['ts', 'rust'])).includes('rust:desktop UI build'));
  });

  it('denies clippy warnings and keeps Cargo on the committed lockfile', () => {
    const [clippy] = plan(['rust']).filter((step) => step.name === 'clippy');
    assert.deepEqual(clippy.args.slice(-3), ['--', '-D', 'warnings']);
    assert.ok(clippy.args.includes('--locked'));
  });

  it('keeps tests that need installed packages out of the docs group', () => {
    // The docs group must run before `pnpm install`; the boundary rule tests run dependency-cruiser.
    const [docsTests] = plan(['docs']).filter((step) => step.name === 'hook and script tests');
    const [ruleTests] = plan(['ts']).filter((step) => step.name === 'boundary rule tests');
    assert.deepEqual(docsTests.args, [
      '--test',
      '.claude/hooks/*.test.js',
      'scripts/check.test.mjs',
      'scripts/contract-mock-smoke.test.mjs',
      'scripts/dev.test.mjs',
    ]);
    assert.deepEqual(ruleTests.args, ['--test', 'scripts/dependency-cruiser.test.mjs']);
  });

  it('fails on a stale generated contract before anything compiles against it', () => {
    const ts = plan(['ts']);
    const [contract] = ts.filter((step) => step.name === 'contract up to date');
    assert.equal(contract.command, 'pnpm');
    assert.deepEqual(contract.args, [
      '--filter',
      '@pulse/contract',
      'run',
      'generate',
      '--',
      '--check',
    ]);
    const order = names(ts);
    assert.ok(order.indexOf('ts:contract up to date') < order.indexOf('ts:type check'));

    const rust = plan(['rust']);
    const [codegen] = rust.filter((step) => step.name === 'contract types up to date');
    assert.equal(codegen.command, 'cargo');
    assert.deepEqual(codegen.args, [
      'run',
      '-p',
      'pulse-contract-codegen',
      '--locked',
      '--',
      '--check',
    ]);
    const rustOrder = names(rust);
    assert.ok(
      rustOrder.indexOf('rust:contract types up to date') < rustOrder.indexOf('rust:clippy'),
    );
  });

  it('smoke-starts the mock server through its own script, after the build', () => {
    const [smoke] = plan(['ts']).filter((step) => step.name === 'contract mock smoke');
    assert.equal(smoke.command, process.execPath);
    assert.deepEqual(smoke.args, ['scripts/contract-mock-smoke.mjs']);
    assert.equal(smoke.shell, false);
  });

  it('runs pnpm through a shell on Windows only', () => {
    const contract = (platform) =>
      plan(['ts'], platform).find((step) => step.name === 'contract up to date');
    assert.equal(contract('win32').shell, true);
    assert.equal(contract('linux').shell, false);
  });

  it('passes only existing roots to dependency-cruiser', () => {
    const steps = planSteps({ groups: new Set(['ts']), platform: 'linux', tsRoots: ['apps'] });
    const [cruise] = steps.filter((step) => step.name === 'dependency-cruiser');
    assert.equal(cruise.args.at(-1), 'apps');
  });

  it('runs the Gradle wrapper through a shell on Windows only', () => {
    const [windows] = plan(['android'], 'win32');
    const [posix] = plan(['android'], 'linux');
    assert.equal(windows.command, 'apps\\android\\gradlew.bat');
    assert.equal(windows.shell, true);
    assert.equal(posix.command, 'apps/android/gradlew');
    assert.equal(posix.shell, false);
    assert.deepEqual(posix.args, [
      '-p',
      'apps/android',
      'ktlintCheck',
      'detekt',
      'lint',
      'testDebugUnitTest',
      'assembleDebug',
    ]);
  });
});
