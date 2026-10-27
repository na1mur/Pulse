// Fragments that mark a value as copied from a template or an example. Matched against the
// lower-cased value; a random 32-character secret contains one of them with a probability far
// below one in a million, so the list can stay generous.
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /change[-_ ]?me/,
  /replace[-_ ]?me/,
  /placeholder/,
  /your[-_ ]/,
  /insert[-_ ]/,
  /secret/,
  /passw(or)?d/,
  /example/,
  /default/,
  /qwerty/,
  /123456/,
  /000000/,
  /^<.*>$/,
  /^\$\{.*\}$/,
];

const MINIMUM_DISTINCT_CHARACTERS = 8;

/**
 * Why a secret is not acceptable, or undefined when it is. The reason never contains the value
 * (OPS-03, spec 9.1: no secret in a log or an error message).
 */
export function weakSecretReason(value: string, minimumLength: number): string | undefined {
  if (value !== value.trim()) return 'it starts or ends with whitespace';
  if (value.length < minimumLength) return `it is shorter than ${minimumLength} characters`;
  const lower = value.toLowerCase();
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(lower))) {
    return 'it looks like a placeholder (such as changeme or your-secret-here)';
  }
  if (new Set(value).size < MINIMUM_DISTINCT_CHARACTERS) {
    return 'it uses too few different characters';
  }
  return undefined;
}
