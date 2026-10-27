// Test support (not built into dist): the whole server on a throwaway PostgreSQL database with a
// fake clock, a fake mail transport that keeps what was sent, and the log lines it wrote, plus a
// small HTTP client. Every auth spec uses it, so each one tests what production serves.
import { Logger, type INestApplication } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { randomBytes, randomUUID } from 'node:crypto';
import { FakeClock } from '../../platform/clock/fake-clock.js';
import { BackgroundTasks } from '../../platform/async/background-tasks.js';
import { testConfig } from '../../platform/config/config.testing.js';
import { DEFAULT_RUNTIME_LIMITS, type AppConfig } from '../../platform/config/app-config.js';
import {
  createTestDatabase,
  type TestDatabase,
} from '../../platform/database/test-database.testing.js';
import type { Database } from '../../platform/database/database.types.js';
import { migrate } from '../../platform/database/migrator.js';
import { startTestApp } from '../../platform/http/test-app.testing.js';
import { JsonLogger } from '../../platform/logging/json-logger.js';
import {
  MAIL_TRANSPORT,
  type MailTransport,
  type OutgoingMail,
} from '../../mail/mail-transport.js';

export const START_INSTANT = '2026-10-27T10:00:00Z';
export const PASSWORD = 'correct horse battery staple';

/** Keeps what would have been sent; `failWith` makes the next sends fail like a broken SMTP server. */
export class FakeMailTransport implements MailTransport {
  readonly sent: OutgoingMail[] = [];
  failWith: Error | undefined;
  private gate: Promise<void> | undefined;

  async send(mail: OutgoingMail): Promise<void> {
    await this.gate;
    if (this.failWith) throw this.failWith;
    this.sent.push(mail);
  }

  /**
   * Makes every send wait until the returned function is called: lets a spec prove that an
   * answer does not wait for the mail (so its timing cannot depend on whether one is sent).
   */
  holdSending(): () => void {
    let release: () => void = () => undefined;
    this.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      release();
      this.gate = undefined;
    };
  }

  /** The link token of the nth mail (default: the last one). */
  tokenOf(index = this.sent.length - 1): string {
    const text = this.sent[index]?.text ?? '';
    const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(text);
    if (!match?.[1]) throw new Error(`mail ${index} carries no token link`);
    return match[1];
  }
}

export interface ApiResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  /** The parsed JSON body, or undefined when there is none. */
  readonly body: unknown;
}

export interface RequestOptions {
  readonly body?: unknown;
  readonly token?: string;
  readonly headers?: Record<string, string>;
  /** The address the (trusted) proxy reports; a fresh one per request by default, null for none. */
  readonly ip?: string | null;
}

/** The `auth.login` device block, with a fresh install ID unless one is given. */
export function deviceInfo(
  id: string = randomUUID(),
  name = 'Test laptop',
): {
  id: string;
  name: string;
  platform: 'windows';
  appVersion: string;
} {
  return { id, name, platform: 'windows', appVersion: '1.0.0' };
}

/** The parts of an `AuthSession` the specs use. */
export interface SignedIn {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly session: Record<string, unknown>;
}

export interface AuthHarness {
  readonly app: INestApplication;
  readonly db: Kysely<Database>;
  readonly clock: FakeClock;
  readonly mail: FakeMailTransport;
  /** Every JSON log line the server wrote, as text. */
  readonly logs: string[];
  request(method: 'GET' | 'POST', path: string, options?: RequestOptions): Promise<ApiResponse>;
  post(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<ApiResponse>;
  get(path: string, options?: Omit<RequestOptions, 'body'>): Promise<ApiResponse>;
  /** Waits for the work the server does after answering (mail sending). */
  settle(): Promise<void>;
  /** Signs in (must succeed) and returns the credentials. */
  signIn(
    email: string,
    options?: { deviceId?: string; password?: string; ip?: string },
  ): Promise<SignedIn>;
  /** Registers and verifies an account directly through the API; returns its address. */
  verifiedAccount(email?: string, password?: string): Promise<string>;
  close(): Promise<void>;
}

export interface HarnessOptions {
  readonly trustProxy?: number;
  readonly config?: Partial<AppConfig>;
  /** Further providers to replace by injection token (a small rate-limit bound, say). */
  readonly overrides?: readonly { readonly token: unknown; readonly value: unknown }[];
}

let nextClient = 1;
const freshClientIp = (): string => {
  nextClient += 1;
  return `198.51.100.${(nextClient % 250) + 1}`;
};

export function uniqueEmail(label = 'user'): string {
  return `${label}.${randomBytes(4).toString('hex')}@example.org`;
}

export async function startAuthHarness(options: HarnessOptions = {}): Promise<AuthHarness> {
  const database: TestDatabase = await createTestDatabase();
  await migrate(database.db, 'up');
  const clock = new FakeClock(START_INSTANT);
  const mail = new FakeMailTransport();
  const logs: string[] = [];
  const logger = new JsonLogger((_level, line) => logs.push(line));
  const config = testConfig({
    databaseUrl: database.url,
    trustProxy: options.trustProxy ?? 1,
    // No response floor unless a spec is about it: the floor would slow every sign-up in the suite.
    limits: { ...DEFAULT_RUNTIME_LIMITS, authResponseFloorMs: 0 },
    mail: {
      host: 'localhost',
      port: 25,
      user: undefined,
      password: undefined,
      from: 'pulse@example.test',
    },
    ...options.config,
  });
  const { app, baseUrl } = await startTestApp({
    config,
    clock,
    logger,
    overrides: [{ token: MAIL_TRANSPORT, value: mail }, ...(options.overrides ?? [])],
  });

  // Nest's static logger is process-wide and the last app created wins: a spec that starts a
  // second harness would otherwise swallow the first one's log lines (and every "nothing logged"
  // assertion after it would pass for the wrong reason).
  const claimLogger = (): void => {
    Logger.overrideLogger(logger);
  };
  claimLogger();

  const request = async (
    method: 'GET' | 'POST',
    path: string,
    { body, token, headers, ip }: RequestOptions = {},
  ): Promise<ApiResponse> => {
    claimLogger();
    const sent: Record<string, string> = { ...headers };
    if (body !== undefined && sent['Content-Type'] === undefined) {
      sent['Content-Type'] = 'application/json';
    }
    if (token !== undefined) sent['Authorization'] = `Bearer ${token}`;
    if (ip !== null && sent['X-Forwarded-For'] === undefined) {
      sent['X-Forwarded-For'] = ip ?? freshClientIp();
    }
    const init: RequestInit = { method, headers: sent };
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text === '' ? undefined : JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    return { status: response.status, headers: response.headers, text, body: parsed };
  };

  const settle = (): Promise<void> => app.get(BackgroundTasks).idle();

  const harness: AuthHarness = {
    app,
    db: database.db,
    clock,
    mail,
    logs,
    request,
    post: (path, body, requestOptions) => request('POST', path, { ...requestOptions, body }),
    get: (path, requestOptions) => request('GET', path, requestOptions),
    settle,
    async signIn(email, { deviceId = randomUUID(), password = PASSWORD, ip } = {}) {
      const response = await request('POST', '/v1/auth/login', {
        body: { email, password, device: deviceInfo(deviceId) },
        ...(ip === undefined ? {} : { ip }),
      });
      if (response.status !== 200) {
        throw new Error(`login answered ${response.status}: ${response.text}`);
      }
      const session = response.body as {
        accessToken: string;
        refreshToken: string;
        user: { id: string };
      };
      return {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        deviceId,
        userId: session.user.id,
        session: session as unknown as Record<string, unknown>,
      };
    },
    async verifiedAccount(email = uniqueEmail(), password = PASSWORD) {
      const registered = await request('POST', '/v1/auth/register', { body: { email, password } });
      if (registered.status !== 204) throw new Error(`register answered ${registered.status}`);
      await settle();
      const verified = await request('POST', '/v1/auth/verify-email', {
        body: { token: mail.tokenOf() },
      });
      if (verified.status !== 204) throw new Error(`verify answered ${verified.status}`);
      return email;
    },
    async close() {
      await app.close();
      await database.drop();
    },
  };
  return harness;
}

/**
 * True when `haystack` (a database dump or a log) holds the token in any form it could have been
 * stored in: as written, as UTF-8 bytes in hex or base64, or decoded to its raw 32 bytes.
 */
export function containsToken(haystack: string, token: string): boolean {
  const raw = Buffer.from(token, 'base64url');
  const forms = [
    token,
    Buffer.from(token).toString('hex'),
    Buffer.from(token).toString('base64'),
    raw.toString('hex'),
    raw.toString('base64'),
  ];
  return forms.some((form) => haystack.includes(form));
}

/** Everything the database holds as text, to prove that no secret was stored (T1.5 review focus). */
export async function dumpDatabaseText(db: Kysely<Database>): Promise<string> {
  const tables = await sql<{ table_name: string }>`
    select table_name from information_schema.tables where table_schema = 'public'`.execute(db);
  const parts: string[] = [];
  for (const { table_name: table } of tables.rows) {
    // Table names come from the catalogue above, not from input.
    const rows = await sql<
      Record<string, unknown>
    >`select row_to_json(t)::text as row from ${sql.table(table)} t`.execute(db);
    parts.push(...rows.rows.map((row) => JSON.stringify(row)));
  }
  return parts.join('\n');
}
