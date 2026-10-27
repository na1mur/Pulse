// OPS-03: validated configuration from the variables in spec Appendix A. Table tests over the
// pure `loadConfig(env)`; the boot-time wiring is covered by bootstrap.spec.ts.
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, type Env } from './load-config.js';

// Random-looking and long enough; none of these may be rejected as weak.
const JWT = 'k3Qv9xT2mWz7LrB4nPd8HsY1cJf6GuAe';
const REFRESH = 'Vb5Nq0Zt8XcR2mLk7Wd4Hs9YfJ1GuPeA';
const base: Env = {
  DATABASE_URL: 'postgres://pulse:pulse@localhost:5432/pulse',
  JWT_SECRET: JWT,
  REFRESH_SECRET: REFRESH,
};

function configErrorOf(env: Env): ConfigError | undefined {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  return undefined;
}

function problemsOf(env: Env): string[] {
  return [...(configErrorOf(env)?.problems ?? [])];
}

describe('OPS-03: defaults', () => {
  it('needs only the database and the two secrets and defaults the rest', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      port: 3000,
      databaseUrl: base['DATABASE_URL'],
      corsOrigins: [],
      trustProxy: 0,
      publicApiUrl: 'http://localhost:3000',
      google: undefined,
      mail: undefined,
      fcm: undefined,
      domain: undefined,
    });
  });

  it('treats an empty variable like an unset one (Compose passes empty values)', () => {
    const config = loadConfig({
      ...base,
      PORT: '',
      CORS_ORIGINS: '',
      TRUST_PROXY: '',
      PUBLIC_API_URL: '',
      DOMAIN: '',
      GOOGLE_CLIENT_ID: '',
      SMTP_USER: '',
      FCM_PROJECT_ID: '',
    });
    expect(config).toMatchObject({ port: 3000, corsOrigins: [], trustProxy: 0 });
  });

  it('reads every Appendix A variable when all are valid', () => {
    const config = loadConfig({
      ...base,
      PORT: '8080',
      DB_PASSWORD: 'Hn7Qw2Zk9XcR4mLt',
      PUBLIC_API_URL: 'https://pulse.example.org/',
      DOMAIN: 'pulse.example.org',
      GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'GOCSPX-Zt8XcR2mLk7Wd4Hs',
      SMTP_USER: 'pulse.sender@gmail.com',
      SMTP_APP_PASSWORD: 'abcd efgh ijkl mnop',
      MAIL_FROM: 'Pulse <pulse.sender@gmail.com>',
      FCM_PROJECT_ID: 'pulse-prod',
      FCM_CLIENT_EMAIL: 'push@pulse-prod.iam.gserviceaccount.com',
      FCM_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nMIIEvQ\\n-----END PRIVATE KEY-----\\n',
      CORS_ORIGINS: 'https://app.example.org, http://localhost:1420',
      TRUST_PROXY: '1',
    });
    expect(config).toMatchObject({
      port: 8080,
      publicApiUrl: 'https://pulse.example.org',
      domain: 'pulse.example.org',
      google: { clientId: '123-abc.apps.googleusercontent.com' },
      mail: {
        host: 'smtp.gmail.com',
        port: 465,
        user: 'pulse.sender@gmail.com',
        from: 'Pulse <pulse.sender@gmail.com>',
      },
      fcm: { projectId: 'pulse-prod', clientEmail: 'push@pulse-prod.iam.gserviceaccount.com' },
      corsOrigins: ['https://app.example.org', 'http://localhost:1420'],
      trustProxy: 1,
    });
    // The escaped newlines of a one-line .env value become real ones.
    expect(config.fcm?.privateKey).toContain('\nMIIEvQ\n');
  });

  it('uses a mail catcher without credentials (the dev services)', () => {
    const config = loadConfig({ ...base, SMTP_HOST: 'localhost', SMTP_PORT: '1025' });
    expect(config.mail).toEqual({
      host: 'localhost',
      port: 1025,
      user: undefined,
      password: undefined,
      from: 'pulse@localhost',
    });
  });
});

describe('OPS-03: bad configuration is rejected, every problem at once', () => {
  const cases: readonly (readonly [string, Env, RegExp])[] = [
    ['missing DATABASE_URL', { ...base, DATABASE_URL: '' }, /DATABASE_URL is required/],
    ['unparseable DATABASE_URL', { ...base, DATABASE_URL: 'not a url' }, /DATABASE_URL must be/],
    [
      'DATABASE_URL of another scheme',
      { ...base, DATABASE_URL: 'mysql://u:p@h/db' },
      /DATABASE_URL must be/,
    ],
    ['missing JWT_SECRET', { ...base, JWT_SECRET: undefined }, /JWT_SECRET is required/],
    ['missing REFRESH_SECRET', { ...base, REFRESH_SECRET: '' }, /REFRESH_SECRET is required/],
    ['short JWT_SECRET', { ...base, JWT_SECRET: 'k3Qv9xT2mWz7' }, /JWT_SECRET is too weak/],
    [
      'changeme JWT_SECRET',
      { ...base, JWT_SECRET: 'changeme'.repeat(5) },
      /JWT_SECRET is too weak/,
    ],
    [
      'placeholder REFRESH_SECRET',
      { ...base, REFRESH_SECRET: 'your-refresh-secret-goes-here-1' },
      /REFRESH_SECRET is too weak/,
    ],
    [
      'secret that is one repeated character',
      { ...base, JWT_SECRET: 'a'.repeat(48) },
      /JWT_SECRET is too weak/,
    ],
    [
      'the same value for both secrets',
      { ...base, REFRESH_SECRET: JWT },
      /REFRESH_SECRET must differ from JWT_SECRET/,
    ],
    ['weak DB_PASSWORD', { ...base, DB_PASSWORD: 'password123456' }, /DB_PASSWORD is too weak/],
    ['non-numeric PORT', { ...base, PORT: 'abc' }, /PORT must be/],
    ['PORT with trailing text', { ...base, PORT: '3000abc' }, /PORT must be/],
    ['PORT above 65535', { ...base, PORT: '70000' }, /PORT must be/],
    ['negative PORT', { ...base, PORT: '-1' }, /PORT must be/],
    ['PUBLIC_API_URL without scheme', { ...base, PUBLIC_API_URL: 'pulse.org' }, /PUBLIC_API_URL/],
    [
      'PUBLIC_API_URL with credentials',
      { ...base, PUBLIC_API_URL: 'https://u:p@pulse.org' },
      /PUBLIC_API_URL/,
    ],
    ['DOMAIN with a scheme', { ...base, DOMAIN: 'https://pulse.org' }, /DOMAIN must be/],
    ['wildcard CORS origin', { ...base, CORS_ORIGINS: '*' }, /CORS_ORIGINS.*\*/],
    [
      'wildcard among valid origins',
      { ...base, CORS_ORIGINS: 'https://a.org,*' },
      /CORS_ORIGINS.*\*/,
    ],
    ['CORS origin with a path', { ...base, CORS_ORIGINS: 'https://a.org/app' }, /CORS_ORIGINS/],
    ['CORS origin without scheme', { ...base, CORS_ORIGINS: 'a.org' }, /CORS_ORIGINS/],
    ['CORS origin "null"', { ...base, CORS_ORIGINS: 'null' }, /CORS_ORIGINS/],
    ['non-numeric TRUST_PROXY', { ...base, TRUST_PROXY: 'true' }, /TRUST_PROXY must be/],
    ['negative TRUST_PROXY', { ...base, TRUST_PROXY: '-1' }, /TRUST_PROXY must be/],
    ['fractional TRUST_PROXY', { ...base, TRUST_PROXY: '1.5' }, /TRUST_PROXY must be/],
    ['huge TRUST_PROXY', { ...base, TRUST_PROXY: '500' }, /TRUST_PROXY must be/],
    ['bad SMTP_PORT', { ...base, SMTP_HOST: 'localhost', SMTP_PORT: 'x' }, /SMTP_PORT must be/],
    [
      'bad MAIL_FROM',
      { ...base, SMTP_HOST: 'localhost', MAIL_FROM: 'not an address' },
      /MAIL_FROM must be/,
    ],
  ];

  it.each(cases)('%s', (_name, env, expected) => {
    const problems = problemsOf(env);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(expected);
  });

  it('reports every problem in one error, not just the first', () => {
    const problems = problemsOf({ PORT: 'abc', TRUST_PROXY: 'x', CORS_ORIGINS: '*' });
    // PORT, TRUST_PROXY, CORS_ORIGINS, DATABASE_URL, JWT_SECRET, REFRESH_SECRET
    expect(problems).toHaveLength(6);
    for (const name of ['PORT', 'TRUST_PROXY', 'CORS_ORIGINS', 'DATABASE_URL', 'JWT_SECRET']) {
      expect(problems.join('\n')).toContain(name);
    }
  });

  it('writes one readable message that lists them all', () => {
    const error = configErrorOf({ PORT: 'abc' });
    expect(error?.message).toMatch(/^Invalid configuration \(4 problems\)/);
    const lines = (error?.message ?? '').split('\n').filter((line) => line.startsWith('  - '));
    expect(lines).toHaveLength(4);
  });

  it('never prints a secret value, a password or a key', () => {
    const env: Env = {
      DATABASE_URL: 'postgres://pulse:hunter2hunter2@db host/pulse',
      JWT_SECRET: 'my-weak-JWT-value',
      REFRESH_SECRET: 'changeme-REFRESH-value',
      DB_PASSWORD: 'dbpass-weak-value',
      GOOGLE_CLIENT_SECRET: 'google-secret-value',
      SMTP_APP_PASSWORD: 'smtp-app-password-value',
      FCM_PRIVATE_KEY: 'private-key-value',
      PORT: 'abc',
    };
    const text = configErrorOf(env)?.message ?? '';
    expect(text.length).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(env)) {
      if (name !== 'PORT') expect(text, name).not.toContain(value ?? '');
    }
    expect(text).not.toContain('hunter2');
  });
});

describe('OPS-03: optional groups are all or nothing (D-23)', () => {
  it('needs both Google values or neither', () => {
    expect(problemsOf({ ...base, GOOGLE_CLIENT_ID: 'id' }).join('\n')).toMatch(
      /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together.*GOOGLE_CLIENT_SECRET/,
    );
    expect(
      problemsOf({ ...base, GOOGLE_CLIENT_SECRET: 'GOCSPX-Zt8XcR2mLk7Wd4Hs' }).join('\n'),
    ).toMatch(/GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together/);
  });

  it('needs the Gmail user and its app password together', () => {
    expect(problemsOf({ ...base, SMTP_USER: 'a@gmail.com' }).join('\n')).toMatch(
      /SMTP_USER and SMTP_APP_PASSWORD must be set together/,
    );
    expect(problemsOf({ ...base, SMTP_APP_PASSWORD: 'abcd efgh ijkl mnop' }).join('\n')).toMatch(
      /SMTP_USER and SMTP_APP_PASSWORD must be set together/,
    );
  });

  it('enables mail from the Gmail credentials alone, defaulting the sender to the user', () => {
    const config = loadConfig({
      ...base,
      SMTP_USER: 'pulse.sender@gmail.com',
      SMTP_APP_PASSWORD: 'abcd efgh ijkl mnop',
    });
    expect(config.mail).toMatchObject({
      host: 'smtp.gmail.com',
      port: 465,
      from: 'pulse.sender@gmail.com',
    });
  });

  it('needs all three FCM values or none, and names the missing ones', () => {
    const problems = problemsOf({ ...base, FCM_PROJECT_ID: 'pulse-prod' }).join('\n');
    expect(problems).toMatch(
      /FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY must be set together/,
    );
    expect(problems).toMatch(/missing: FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY/);
  });

  it('rejects an FCM private key that is not a PEM key', () => {
    const problems = problemsOf({
      ...base,
      FCM_PROJECT_ID: 'p',
      FCM_CLIENT_EMAIL: 'push@p.iam.gserviceaccount.com',
      FCM_PRIVATE_KEY: 'definitely not a key',
    });
    expect(problems.join('\n')).toMatch(/FCM_PRIVATE_KEY must be/);
  });
});

describe('OPS-03: CORS allow-list and proxy trust', () => {
  it('splits, trims, lower-cases and de-duplicates the origins', () => {
    const config = loadConfig({
      ...base,
      CORS_ORIGINS: ' https://A.example.org , tauri://localhost,https://a.example.org,, ',
    });
    expect(config.corsOrigins).toEqual(['https://a.example.org', 'tauri://localhost']);
  });

  it('accepts a number of proxies', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: '2' }).trustProxy).toBe(2);
  });
});
