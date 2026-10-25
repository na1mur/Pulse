// `pnpm --filter @pulse/contract generate`: writes generated/ from the zod sources and removes
// files there it no longer writes.
// `... generate -- --check`: changes nothing; exits 1 when a file is stale, missing or extra.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedFiles } from './outputs.js';
import { syncGeneratedFolder } from './sync.js';

// dist/generator/main.js -> package root
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const list = (paths: string[]) => paths.map((path) => `  packages/contract/${path}\n`).join('');

function main(argv: string[]): number {
  const check = argv.includes('--check');
  const { stale, extra } = syncGeneratedFolder(
    packageRoot,
    generatedFiles(),
    check ? 'check' : 'write',
  );
  if (stale.length === 0 && extra.length === 0) {
    process.stdout.write('Generated contract files are up to date.\n');
    return 0;
  }
  if (check) {
    const fix = 'run `pnpm --filter @pulse/contract generate`';
    if (stale.length > 0) process.stderr.write(`Stale or missing (${fix}):\n${list(stale)}`);
    if (extra.length > 0) {
      process.stderr.write(`Not generated, would be removed (${fix}):\n${list(extra)}`);
    }
    return 1;
  }
  if (stale.length > 0) process.stdout.write(`Wrote:\n${list(stale)}`);
  if (extra.length > 0) process.stdout.write(`Removed:\n${list(extra)}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
