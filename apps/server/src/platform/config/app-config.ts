/**
 * Timeouts and limits that protect the server (spec 9.2). Fixed values, not environment
 * variables: Appendix A lists what an operator configures and these are not part of it. They live
 * in the configuration object so tests can shorten them.
 */
export interface RuntimeLimits {
  /** A request that takes longer is answered with UNAVAILABLE (the handler is not cancelled). */
  readonly requestTimeoutMs: number;
  /** The whole request, body included, must arrive within this time (slow-client defence). */
  readonly requestReceiveTimeoutMs: number;
  /** The request line and headers must arrive within this time. */
  readonly headersTimeoutMs: number;
  /** The whole shutdown (HTTP drain, then the database pool) must finish within this time. */
  readonly shutdownGraceMs: number;
  /** Of that, at most this long is spent letting open requests finish before connections are cut. */
  readonly shutdownHttpDrainMs: number;
  readonly databaseConnectTimeoutMs: number;
  /** PostgreSQL cancels a statement running longer than this (migrations are exempt). */
  readonly databaseStatementTimeoutMs: number;
  readonly databasePoolMax: number;
  /** The `/health` database query must answer within this time. */
  readonly healthTimeoutMs: number;
  /**
   * Sign-up answers no sooner than this after it started, so a new address (which costs a few
   * more writes) cannot be told from an existing one by response time (spec 9.1).
   */
  readonly authResponseFloorMs: number;
}

// The shutdown budget stays below the 10 s Docker waits after SIGTERM before it kills the process:
// 6 s to drain requests leaves 2 s of it for closing the pool.
export const DEFAULT_RUNTIME_LIMITS: RuntimeLimits = {
  requestTimeoutMs: 30_000,
  requestReceiveTimeoutMs: 60_000,
  headersTimeoutMs: 15_000,
  shutdownGraceMs: 8_000,
  shutdownHttpDrainMs: 6_000,
  databaseConnectTimeoutMs: 5_000,
  databaseStatementTimeoutMs: 15_000,
  databasePoolMax: 10,
  healthTimeoutMs: 2_000,
  authResponseFloorMs: 200,
};

export interface GoogleConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** SMTP settings; `user` and `password` are absent for a mail catcher such as Mailpit. */
export interface MailConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string | undefined;
  readonly password: string | undefined;
  readonly from: string;
}

export interface FcmConfig {
  readonly projectId: string;
  readonly clientEmail: string;
  /** PEM text with real newlines. */
  readonly privateKey: string;
}

/**
 * The validated server configuration (OPS-03, spec Appendix A), built once at boot by
 * `loadConfig` and injected as `APP_CONFIG`. It holds secrets: never log or serialise it.
 * `DB_PASSWORD` is validated but not kept: it belongs to the bundled database container, which
 * reaches the server through `DATABASE_URL`.
 */
export interface AppConfig {
  readonly port: number;
  readonly databaseUrl: string;
  /** Signs access tokens (AUTH). */
  readonly jwtSecret: string;
  /** Keys the hash of refresh credentials (AUTH). */
  readonly refreshSecret: string;
  /** The address clients and email links use, without a trailing slash. */
  readonly publicApiUrl: string;
  readonly domain: string | undefined;
  /** Exact origins allowed by CORS; empty means no cross-origin access. */
  readonly corsOrigins: readonly string[];
  /** Number of reverse proxies in front of the server (Express `trust proxy`). */
  readonly trustProxy: number;
  readonly google: GoogleConfig | undefined;
  readonly mail: MailConfig | undefined;
  readonly fcm: FcmConfig | undefined;
  readonly limits: RuntimeLimits;
}
