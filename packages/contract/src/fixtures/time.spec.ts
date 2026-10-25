import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Instant } from '../primitives.js';
import {
  loadTimeFixtures,
  timeFixtureFiles,
  timeFixturesDirectory,
  type TimeFixtures,
} from './time.js';

// D-19: every file in fixtures/time/ has the shape its runner expects, and nothing in the
// directory goes unvalidated. The expected values themselves are checked by hand and with Python
// zoneinfo (fixtures/README.md), then by the server and core runners.

type Input = Record<string, unknown>;

const copies: string[] = [];

/** A scratch copy of the fixture directory that a test may break. */
function copyOfFixtures(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pulse-time-fixtures-'));
  copies.push(directory);
  cpSync(timeFixturesDirectory, directory, { recursive: true });
  return directory;
}

afterEach(() => {
  for (const directory of copies.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function zonesIn(fixtures: TimeFixtures): Set<string> {
  return new Set([
    ...fixtures['day-key'].cases.map((c) => c.input.timeZone),
    ...fixtures['day-bounds'].cases.map((c) => c.input.timeZone),
    ...fixtures.period.cases.map((c) => c.input.timeZone),
    ...fixtures['day-rows'].cases.map((c) => c.input.timeZone),
    ...fixtures['period-total'].cases.flatMap((c) => [
      c.input.timeZone,
      ...c.input.sessions.map((s) => s.timeZone),
    ]),
  ]);
}

describe('time fixtures (D-19)', () => {
  it('validates every file in fixtures/time against its schema', () => {
    const fixtures = loadTimeFixtures();
    expect(Object.keys(fixtures).sort()).toEqual([...timeFixtureFiles].sort());
    for (const file of timeFixtureFiles) expect(fixtures[file].cases.length).toBeGreaterThan(0);
  });

  it('covers every timezone of the T0.5 acceptance bar plus a skipped midnight', () => {
    const zones = zonesIn(loadTimeFixtures());
    for (const zone of [
      'UTC',
      'America/Los_Angeles',
      'Asia/Dhaka',
      'Pacific/Auckland',
      'Asia/Kathmandu',
      'America/Santiago',
    ]) {
      expect(zones, zone).toContain(zone);
    }
  });

  it('includes the 23 h and 25 h DST days of Los Angeles and Auckland and Santiago 2026-09-06', () => {
    const bounds = loadTimeFixtures()['day-bounds'].cases.map(
      (c) => `${c.input.timeZone} ${c.input.day} ${String(c.expected.seconds)}`,
    );
    expect(bounds).toEqual(
      expect.arrayContaining([
        'America/Los_Angeles 2026-03-08 82800',
        'America/Los_Angeles 2026-11-01 90000',
        'Pacific/Auckland 2026-09-27 82800',
        'Pacific/Auckland 2026-04-05 90000',
        'America/Santiago 2026-09-06 82800',
      ]),
    );
  });

  it('keeps invalid-instant.json and the contract in step: the contract rejects every case', () => {
    for (const { name, input } of loadTimeFixtures()['invalid-instant'].cases) {
      expect(Instant.safeParse(input.instant).success, name).toBe(false);
    }
  });

  it('fails on a file it has no schema for, so a runner cannot skip it silently', () => {
    const directory = copyOfFixtures();
    writeFileSync(join(directory, 'streak.json'), '{"description":"x","rules":[],"cases":[]}');
    expect(() => loadTimeFixtures(directory)).toThrow(/streak\.json/);
  });

  it('fails when an expected file is missing', () => {
    const directory = copyOfFixtures();
    unlinkSync(join(directory, 'display.json'));
    expect(() => loadTimeFixtures(directory)).toThrow(/display\.json/);
  });

  it.each([
    ['day-key', (input: Input) => input],
    ['day-rows', (input: Input) => input],
    ['period-total', (input: Input) => (input['sessions'] as Input[])[0]],
  ] as const)('fails on a %s case with a field its runner does not know', (name, target) => {
    const directory = copyOfFixtures();
    const path = join(directory, `${name}.json`);
    const file = JSON.parse(readFileSync(path, 'utf8')) as { cases: { input: Input }[] };
    const object = file.cases.map((c) => target(c.input)).find((o) => o !== undefined);
    if (object === undefined) throw new Error(`${name}.json has no case to change`);
    object['offset'] = '+02:00';
    writeFileSync(path, JSON.stringify(file));
    expect(() => loadTimeFixtures(directory)).toThrow(new RegExp(`${name}\\.json is invalid`));
  });

  it('fails on an instant with an offset instead of Z and on an unknown timezone', () => {
    const directory = copyOfFixtures();
    const path = join(directory, 'day-key.json');
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, original.replace(/"(\d{4}-\d\d-\d\dT[\d:.]+)Z"/, '"$1+00:00"'));
    expect(() => loadTimeFixtures(directory)).toThrow(/day-key\.json is invalid[^]*instant/);
    writeFileSync(path, original.replace('"Asia/Dhaka"', '"Mars/Olympus_Mons"'));
    expect(() => loadTimeFixtures(directory)).toThrow(/day-key\.json is invalid[^]*timezone/);
  });

  it('fails on two cases with the same name in one file', () => {
    const directory = copyOfFixtures();
    const path = join(directory, 'display.json');
    const file = JSON.parse(readFileSync(path, 'utf8')) as { cases: unknown[] };
    file.cases.push(file.cases[0]);
    writeFileSync(path, JSON.stringify(file));
    expect(() => loadTimeFixtures(directory)).toThrow(/duplicate case name/);
  });
});
