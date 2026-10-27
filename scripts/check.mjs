#!/usr/bin/env node
// The one-command check (T0.2): every formatter, linter, type check, test and build in the repo,
// in order, stopping at the first failure. `pnpm verify` runs a frozen install first.
//
//   node scripts/check.mjs                      everything
//   node scripts/check.mjs --only ts --only docs  some groups (docs, ts, rust, android)
//
// No dependencies, so it runs before `pnpm install` has succeeded and on every OS.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GROUPS = ['docs', 'ts', 'rust', 'android'];
const USAGE = `usage: node scripts/check.mjs [--only <${GROUPS.join('|')}>]...`;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const groups = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let group;
    if (arg === '--only') {
      group = argv[++i];
      if (group === undefined) throw new Error(`--only needs a group\n${USAGE}`);
    } else if (arg.startsWith('--only=')) {
      group = arg.slice('--only='.length);
    } else {
      throw new Error(`unknown argument "${arg}"\n${USAGE}`);
    }
    if (!GROUPS.includes(group)) throw new Error(`unknown group "${group}"\n${USAGE}`);
    groups.add(group);
  }
  return { groups: groups.size > 0 ? groups : new Set(GROUPS) };
}

// Each step: { group, name, command, args, shell }. `shell` is only set where Windows needs it
// (.cmd/.bat launchers cannot be spawned directly); every argument here is a fixed literal.
export function planSteps({ groups, platform, tsRoots }) {
  const windows = platform === 'win32';
  const step = (group, name, command, args, shell = false) => ({
    group,
    name,
    command,
    args,
    shell,
  });
  const pnpm = (group, name, args) => step(group, name, 'pnpm', args, windows);
  const cargo = (name, args) => step('rust', name, 'cargo', args);
  const steps = [];

  if (groups.has('docs')) {
    steps.push(step('docs', 'docs check', 'bash', ['scripts/check-docs.sh']));
    // Only tests that need no installed packages: this group also runs before `pnpm install`.
    steps.push(
      step('docs', 'hook and script tests', process.execPath, [
        '--test',
        '.claude/hooks/*.test.js',
        'scripts/check.test.mjs',
        'scripts/contract-mock-smoke.test.mjs',
        'scripts/dev.test.mjs',
        'scripts/deploy-smoke.test.mjs',
      ]),
    );
  }
  if (groups.has('ts')) {
    steps.push(pnpm('ts', 'Prettier', ['exec', 'prettier', '--check', '.']));
    steps.push(pnpm('ts', 'ESLint', ['exec', 'eslint', '--max-warnings', '0', '.']));
    steps.push(
      pnpm('ts', 'dependency-cruiser', [
        'exec',
        'depcruise',
        '--config',
        '.dependency-cruiser.cjs',
        ...tsRoots,
      ]),
    );
    // Proves the rules above still fire on fixture violations (QA T0.2 Bug 1).
    steps.push(
      step('ts', 'boundary rule tests', process.execPath, [
        '--test',
        'scripts/dependency-cruiser.test.mjs',
      ]),
    );
    // Regenerates in memory and fails on any difference from the committed generated/ files.
    steps.push(
      pnpm('ts', 'contract up to date', [
        '--filter',
        '@pulse/contract',
        'run',
        'generate',
        '--',
        '--check',
      ]),
    );
    steps.push(pnpm('ts', 'type check', ['-r', 'run', 'typecheck']));
    steps.push(pnpm('ts', 'tests', ['-r', 'run', 'test']));
    steps.push(pnpm('ts', 'build', ['-r', 'run', 'build']));
    // Starts `pnpm --filter @pulse/contract mock`, checks /health and the realtime auth, stops it.
    steps.push(
      step('ts', 'contract mock smoke', process.execPath, ['scripts/contract-mock-smoke.mjs']),
    );
  }
  if (groups.has('rust')) {
    // The Tauri crate embeds apps/desktop/dist at compile time; the ts group builds it otherwise.
    if (!groups.has('ts')) {
      steps.push(pnpm('rust', 'desktop UI build', ['--filter', '@pulse/desktop', 'run', 'build']));
    }
    steps.push(cargo('rustfmt', ['fmt', '--all', '--check']));
    // crates/contract-types/src/generated/ against packages/contract/generated/openapi.json.
    steps.push(
      cargo('contract types up to date', [
        'run',
        '-p',
        'pulse-contract-codegen',
        '--locked',
        '--',
        '--check',
      ]),
    );
    steps.push(
      cargo('clippy', [
        'clippy',
        '--workspace',
        '--all-targets',
        '--locked',
        '--',
        '-D',
        'warnings',
      ]),
    );
    steps.push(cargo('tests', ['test', '--workspace', '--locked']));
  }
  if (groups.has('android')) {
    const wrapper = windows ? 'apps\\android\\gradlew.bat' : 'apps/android/gradlew';
    steps.push(
      step(
        'android',
        'Gradle checks',
        wrapper,
        [
          '-p',
          'apps/android',
          'ktlintCheck',
          'detekt',
          'lint',
          'testDebugUnitTest',
          'assembleDebug',
        ],
        windows,
      ),
    );
  }
  return steps;
}

// The Android build shells out to cargo-ndk and needs the pinned NDK and Rust target (T0.7);
// without them Gradle fails minutes in with a cargo error. `probe` injects the machine: `run`
// returns a command's stdout or null when it fails, `exists` tests a path.
export function androidPrerequisiteProblems({ env, ndkVersion, probe }) {
  const problems = [];
  if (probe.run('cargo', ['ndk', '--version']) === null) {
    problems.push('cargo-ndk is missing: cargo install cargo-ndk --locked --version 4.1.2');
  }
  const targets = probe.run('rustup', ['target', 'list', '--installed']);
  if (targets !== null && !targets.split(/\s+/).includes('aarch64-linux-android')) {
    problems.push('Rust target missing: rustup target add aarch64-linux-android');
  }
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!sdk) {
    problems.push('ANDROID_HOME is not set (Android SDK)');
  } else if (!probe.exists(join(sdk, 'ndk', ndkVersion))) {
    problems.push(`Android NDK ${ndkVersion} is missing: sdkmanager --install "ndk;${ndkVersion}"`);
  }
  return problems;
}

const ndkVersionFromGradle = () =>
  /ndkVersion\s*=\s*"([^"]+)"/.exec(
    readFileSync(join(root, 'apps/android/app/build.gradle.kts'), 'utf8'),
  )?.[1];

const hostProbe = {
  exists: existsSync,
  run(command, args) {
    try {
      return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    } catch {
      return null;
    }
  },
};

// On Windows a bare `bash` can resolve to WSL's launcher; check-docs.sh needs Git Bash.
function gitBash() {
  try {
    const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
    const candidate = join(execPath, '..', '..', '..', 'bin', 'bash.exe');
    return existsSync(candidate) ? candidate : 'bash';
  } catch {
    return 'bash';
  }
}

const quote = (arg) => (/^[\w./\\:=@-]+$/.test(arg) ? arg : `"${arg}"`);
const commandLine = (step) => [step.command, ...step.args].map(quote).join(' ');
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

function run(step) {
  return new Promise((resolve) => {
    // With `shell`, pass one command line: Node 24 deprecates separate args with a shell.
    const child = step.shell
      ? spawn(commandLine(step), { cwd: root, stdio: 'inherit', shell: true })
      : spawn(step.command, step.args, { cwd: root, stdio: 'inherit' });
    child.on('error', (error) => {
      console.error(`could not start ${step.command}: ${error.message} (installed and on PATH?)`);
      resolve(1);
    });
    child.on('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function main() {
  let groups;
  try {
    ({ groups } = parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const tsRoots = ['apps', 'packages'].filter((dir) => existsSync(join(root, dir)));
  const steps = planSteps({ groups, platform: process.platform, tsRoots });
  if (process.platform === 'win32') {
    const bash = gitBash();
    for (const step of steps) if (step.command === 'bash') step.command = bash;
  }

  if (groups.has('android')) {
    const problems = androidPrerequisiteProblems({
      env: process.env,
      ndkVersion: ndkVersionFromGradle() ?? 'unknown',
      probe: hostProbe,
    });
    if (problems.length > 0) {
      console.error('Android prerequisites missing (see CLAUDE.md, Commands):');
      for (const problem of problems) console.error(`  - ${problem}`);
      return 1;
    }
  }

  const started = Date.now();
  const results = [];
  for (const [index, step] of steps.entries()) {
    console.log(`\n==> [${step.group}] ${index + 1}/${steps.length} ${step.name}`);
    console.log(`    ${commandLine(step)}\n`);
    const stepStarted = Date.now();
    const code = await run(step);
    const elapsed = Date.now() - stepStarted;
    results.push({ step, code, elapsed });
    if (code !== 0) {
      console.error(
        `\nFAILED: [${step.group}] ${step.name} (exit code ${code}, ${seconds(elapsed)})`,
      );
      console.error(`Re-run: ${commandLine(step)}`);
      break;
    }
  }

  console.log('\nSummary');
  for (const step of steps) {
    const result = results.find((entry) => entry.step === step);
    const status = !result ? 'not run' : result.code === 0 ? 'ok' : 'FAILED';
    const time = result ? seconds(result.elapsed) : '';
    const label = `[${step.group}] ${step.name}`;
    console.log(`  ${status.padEnd(9)}${label.padEnd(34)}${time}`.trimEnd());
  }
  const failed = results.some((result) => result.code !== 0);
  console.log(
    `\n${failed ? 'Check FAILED' : 'All checks passed'} in ${seconds(Date.now() - started)}`,
  );
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main();
