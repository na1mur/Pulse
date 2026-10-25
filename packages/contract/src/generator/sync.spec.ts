import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncGeneratedFolder } from './sync.js';

const files: [string, string][] = [
  ['generated/openapi.json', '{}\n'],
  ['generated/json-schema/pulse-contract.schema.json', '{"definitions":{}}\n'],
];

let root: string;
const at = (path: string) => join(root, path);
function put(path: string, content: string): void {
  mkdirSync(join(at(path), '..'), { recursive: true });
  writeFileSync(at(path), content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pulse-contract-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the generator owns generated/', () => {
  it('reports nothing when the folder holds exactly the generated files', () => {
    for (const [path, content] of files) put(path, content);
    expect(syncGeneratedFolder(root, files, 'check')).toEqual({ stale: [], extra: [] });
  });

  it('check names stale, missing and extra files and changes nothing', () => {
    put('generated/openapi.json', 'old\n');
    put('generated/stray.json', '{}\n');
    put('generated/client/index.ts', '// @generated\n');

    expect(syncGeneratedFolder(root, files, 'check')).toEqual({
      stale: ['generated/openapi.json', 'generated/json-schema/pulse-contract.schema.json'],
      extra: ['generated/client/index.ts', 'generated/stray.json'],
    });
    expect(readFileSync(at('generated/openapi.json'), 'utf8')).toBe('old\n');
    expect(existsSync(at('generated/stray.json'))).toBe(true);
  });

  it('write regenerates stale files and removes extra files and the folders they leave empty', () => {
    put('generated/openapi.json', 'old\n');
    put('generated/stray.json', '{}\n');
    put('generated/client/index.ts', '// @generated\n');

    const result = syncGeneratedFolder(root, files, 'write');

    expect(result.extra).toEqual(['generated/client/index.ts', 'generated/stray.json']);
    for (const [path, content] of files) expect(readFileSync(at(path), 'utf8')).toBe(content);
    expect(existsSync(at('generated/stray.json'))).toBe(false);
    expect(existsSync(at('generated/client'))).toBe(false);
    expect(syncGeneratedFolder(root, files, 'check')).toEqual({ stale: [], extra: [] });
  });
});
