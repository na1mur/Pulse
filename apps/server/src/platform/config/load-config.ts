import {
  DEFAULT_RUNTIME_LIMITS,
  type AppConfig,
  type FcmConfig,
  type GoogleConfig,
  type MailConfig,
} from './app-config.js';
import { weakSecretReason } from './secrets.js';

export type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_PORT = 3000;
const MAX_TRUSTED_PROXIES = 32;
const TOKEN_SECRET_MIN_LENGTH = 32;
const DB_PASSWORD_MIN_LENGTH = 12;
// Gmail with an app password, the spec's default mail provider (Appendix A).
const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_MAIL_SENDER = 'pulse@localhost';

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
// An origin is scheme://host[:port] and nothing else (a path or query is never part of one).
const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^\s/?#*@]+$/i;
const EMAIL_ADDRESS = /^[^\s@<>]+@[^\s@<>]+$/;
// No line breaks: the value ends up in a mail header.
const MAIL_SENDER = /^([^<>\r\n]+ <[^\s@<>]+@[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+)$/;

/** The environment is not a valid configuration. `message` lists every problem. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';

  constructor(readonly problems: readonly string[]) {
    const noun = problems.length === 1 ? 'problem' : 'problems';
    const lines = problems.map((problem) => `  - ${problem}`).join('\n');
    const hint = problems.some((problem) =>
      /^(JWT_SECRET|REFRESH_SECRET|DB_PASSWORD) (is|must)/.test(problem),
    )
      ? "\nGenerate a secret with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\""
      : '';
    super(
      `Invalid configuration (${problems.length} ${noun}):\n${lines}${hint}\n` +
        'Fix the server environment (the .env file, see infra/.env.example). Secret values are never printed.',
    );
  }
}

function list(names: readonly string[]): string {
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/** Reads one environment, collecting every problem instead of stopping at the first. */
class EnvReader {
  readonly problems: string[] = [];

  constructor(private readonly env: Env) {}

  /** The value as set; an empty or blank one counts as unset (Compose passes empty values). */
  raw(name: string): string | undefined {
    const value = this.env[name];
    return value === undefined || value.trim() === '' ? undefined : value;
  }

  text(name: string): string | undefined {
    return this.raw(name)?.trim();
  }

  fail(problem: string): undefined {
    this.problems.push(problem);
    return undefined;
  }

  /** A whole number from `minimum` to `maximum` written in digits only. */
  integer(name: string, minimum: number, maximum: number, meaning: string): number | undefined {
    const value = this.text(name);
    if (value === undefined) return undefined;
    const number = /^\d{1,9}$/.test(value) ? Number(value) : NaN;
    if (!(number >= minimum && number <= maximum)) {
      this.fail(`${name} must be ${meaning} (${minimum} to ${maximum}).`);
      return undefined;
    }
    return number;
  }

  /** A secret that must be set and strong; the value never reaches a message. */
  secret(name: string, minimumLength: number, { required }: { required: boolean }) {
    const value = this.raw(name);
    if (value === undefined) {
      if (required) {
        this.fail(`${name} is required: a random string of at least ${minimumLength} characters.`);
      }
      return undefined;
    }
    const reason = weakSecretReason(value, minimumLength);
    if (reason !== undefined) {
      this.fail(`${name} is too weak: ${reason}. Use a random value, not a word.`);
      return undefined;
    }
    return value;
  }

  /** The values of a group of variables that are all set or all unset; undefined for neither. */
  group<Name extends string>(names: readonly Name[]): Record<Name, string> | undefined {
    const values = names.map((name) => [name, this.raw(name)] as const);
    const missing = values.filter(([, value]) => value === undefined).map(([name]) => name);
    if (missing.length === names.length) return undefined;
    if (missing.length > 0) {
      this.fail(`${list(names)} must be set together (missing: ${missing.join(', ')}).`);
      return undefined;
    }
    return Object.fromEntries(values) as Record<Name, string>;
  }
}

function readDatabaseUrl(reader: EnvReader): string {
  const value = reader.text('DATABASE_URL');
  if (value === undefined) {
    reader.fail(
      'DATABASE_URL is required, for example postgres://user:password@host:5432/pulse ' +
        '(the Docker deployment fills it in for the bundled database).',
    );
    return '';
  }
  try {
    if (['postgres:', 'postgresql:'].includes(new URL(value).protocol)) return value;
  } catch {
    // Not a URL; reported below without the value, which holds the password.
  }
  reader.fail(
    'DATABASE_URL must be a PostgreSQL URL: postgres://user:password@host:5432/database.',
  );
  return '';
}

function readPublicApiUrl(reader: EnvReader, port: number): string {
  const value = reader.text('PUBLIC_API_URL');
  if (value === undefined) return `http://localhost:${port}`;
  try {
    const url = new URL(value);
    const plain =
      url.username === '' && url.password === '' && url.search === '' && url.hash === '';
    if ((url.protocol === 'http:' || url.protocol === 'https:') && plain) {
      return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    }
  } catch {
    // Not a URL; reported below.
  }
  reader.fail(
    'PUBLIC_API_URL must be an http(s) address without credentials, such as https://pulse.example.org.',
  );
  return '';
}

function readDomain(reader: EnvReader): string | undefined {
  const value = reader.text('DOMAIN');
  if (value === undefined) return undefined;
  if (!HOSTNAME.test(value)) {
    reader.fail(
      'DOMAIN must be a host name without scheme, port or path, such as pulse.example.org.',
    );
    return undefined;
  }
  return value.toLowerCase();
}

function readCorsOrigins(reader: EnvReader): string[] {
  const value = reader.text('CORS_ORIGINS');
  if (value === undefined) return [];
  const origins = new Set<string>();
  for (const entry of value.split(',').map((item) => item.trim())) {
    if (entry === '') continue;
    if (entry.includes('*')) {
      reader.fail(
        'CORS_ORIGINS must list exact origins; the wildcard * is not allowed (spec 9.1).',
      );
    } else if (!ORIGIN.test(entry)) {
      reader.fail(
        'CORS_ORIGINS must be comma-separated origins such as https://app.example.org ' +
          '(scheme, host and optional port, no path).',
      );
    } else {
      origins.add(entry.toLowerCase());
    }
  }
  return [...origins];
}

function readGoogle(reader: EnvReader): GoogleConfig | undefined {
  const group = reader.group(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
  return group && { clientId: group.GOOGLE_CLIENT_ID, clientSecret: group.GOOGLE_CLIENT_SECRET };
}

function readMail(reader: EnvReader): MailConfig | undefined {
  const credentials = reader.group(['SMTP_USER', 'SMTP_APP_PASSWORD']);
  const host = reader.text('SMTP_HOST');
  const port = reader.integer('SMTP_PORT', 1, 65_535, 'a port number');
  const sender = reader.text('MAIL_FROM');
  const user = reader.text('SMTP_USER');
  if (user !== undefined && !EMAIL_ADDRESS.test(user)) {
    reader.fail('SMTP_USER must be an email address.');
  }
  if (host !== undefined && !HOSTNAME.test(host)) {
    reader.fail('SMTP_HOST must be a host name, such as smtp.gmail.com.');
  }
  if (sender !== undefined && !MAIL_SENDER.test(sender)) {
    reader.fail(
      'MAIL_FROM must be an address such as pulse@example.org or Pulse <pulse@example.org>.',
    );
  }
  // Mail is on when it has credentials or a server of its own (a catcher in development).
  if (credentials === undefined && host === undefined) return undefined;
  return {
    host: host ?? DEFAULT_SMTP_HOST,
    port: port ?? DEFAULT_SMTP_PORT,
    user: credentials?.SMTP_USER,
    password: credentials?.SMTP_APP_PASSWORD,
    from: sender ?? credentials?.SMTP_USER ?? DEFAULT_MAIL_SENDER,
  };
}

function readFcm(reader: EnvReader): FcmConfig | undefined {
  const group = reader.group(['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY']);
  if (group === undefined) return undefined;
  // A one-line .env value holds the key with escaped newlines.
  const privateKey = group.FCM_PRIVATE_KEY.replaceAll('\\n', '\n');
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(privateKey)) {
    reader.fail('FCM_PRIVATE_KEY must be the PEM private key of the Firebase service account.');
    return undefined;
  }
  return {
    projectId: group.FCM_PROJECT_ID,
    clientEmail: group.FCM_CLIENT_EMAIL,
    privateKey,
  };
}

/**
 * Builds the server configuration from the environment (spec Appendix A, OPS-03) or throws a
 * `ConfigError` listing every problem, so one start-up attempt shows everything to fix. Pure: the
 * caller passes `process.env`.
 */
export function loadConfig(env: Env): AppConfig {
  const reader = new EnvReader(env);
  const port = reader.integer('PORT', 0, 65_535, 'a port number') ?? DEFAULT_PORT;
  const databaseUrl = readDatabaseUrl(reader);
  const jwtSecret = reader.secret('JWT_SECRET', TOKEN_SECRET_MIN_LENGTH, { required: true });
  const refreshSecret = reader.secret('REFRESH_SECRET', TOKEN_SECRET_MIN_LENGTH, {
    required: true,
  });
  if (jwtSecret !== undefined && jwtSecret === refreshSecret) {
    reader.fail('REFRESH_SECRET must differ from JWT_SECRET: one leaked key must not open both.');
  }
  reader.secret('DB_PASSWORD', DB_PASSWORD_MIN_LENGTH, { required: false });
  const publicApiUrl = readPublicApiUrl(reader, port);
  const domain = readDomain(reader);
  const corsOrigins = readCorsOrigins(reader);
  const trustProxy =
    reader.integer(
      'TRUST_PROXY',
      0,
      MAX_TRUSTED_PROXIES,
      'the number of reverse proxies in front of the server',
    ) ?? 0;
  const google = readGoogle(reader);
  const mail = readMail(reader);
  const fcm = readFcm(reader);

  if (reader.problems.length > 0 || jwtSecret === undefined || refreshSecret === undefined) {
    throw new ConfigError(reader.problems);
  }
  return {
    port,
    databaseUrl,
    jwtSecret,
    refreshSecret,
    publicApiUrl,
    domain,
    corsOrigins,
    trustProxy,
    google,
    mail,
    fcm,
    limits: DEFAULT_RUNTIME_LIMITS,
  };
}
