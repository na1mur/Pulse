/** The database the seed runner is about to write to, as the process environment names it. */
export interface DevTarget {
  readonly databaseUrl: string;
  readonly nodeEnv?: string;
}

/** The runner refused to touch this database; nothing was connected to or changed. */
export class SeedRefusedError extends Error {
  override readonly name = 'SeedRefusedError';
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

// libpq connection parameters that replace the host named in the URL's authority part. Without
// this check `postgres://pulse@localhost/pulse?host=prod.example.com` would pass as local.
const HOST_OVERRIDE_PARAMETERS = ['host', 'hostaddr'] as const;

/**
 * Seeds are demo data: they must never reach a database that holds real data (T0.6 review focus).
 * Allows only an explicit loopback host and refuses an explicit NODE_ENV=production. Anything
 * ambiguous (no host, a socket path, a host override, several hosts) is refused. Messages never
 * contain the URL's credentials.
 */
export function assertDevTarget(target: DevTarget): void {
  if (target.nodeEnv?.trim().toLowerCase() === 'production') {
    throw new SeedRefusedError('Refusing to seed: NODE_ENV=production. Seeds are for dev only.');
  }

  let url: URL;
  try {
    url = new URL(target.databaseUrl);
  } catch {
    throw new SeedRefusedError(
      'Refusing to seed: DATABASE_URL is not a valid URL (expected postgres://user:password@localhost:5432/name).',
    );
  }

  const override = HOST_OVERRIDE_PARAMETERS.find((name) => url.searchParams.has(name));
  if (override !== undefined) {
    throw new SeedRefusedError(
      `Refusing to seed: the "${override}" parameter of DATABASE_URL can point at another host.`,
    );
  }

  const host = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new SeedRefusedError(
      `Refusing to seed: database host "${host}" is not a local host (localhost, 127.0.0.1, ::1).`,
    );
  }
}
