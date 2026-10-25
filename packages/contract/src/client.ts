// Typed HTTP client derived from the catalogue at the type level: nothing is generated, so it can
// never drift from the schemas. `fetch` is injected; this module touches no global network API.
// Exported as `@pulse/contract/client` so UI code importing `@pulse/contract` (types) never pulls
// it in. The Rust core has its own client (crates/contract-types); this one serves TypeScript
// tools and tests.
import {
  httpOperation,
  type HttpOperationName,
  type OperationBody,
  type OperationParams,
  type OperationQuery,
  type OperationResponse,
  type Present,
} from './catalogue.js';
import { ErrorBody, type ErrorCode } from './errors.js';
import { REQUEST_ID_HEADER, SERVER_TIME_HEADER } from './http.js';

export interface ClientOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Returns the current access token for operations that need one. */
  accessToken?: () => string | undefined;
}

export type CallInput<Name extends HttpOperationName> = Present<'params', OperationParams<Name>> &
  Present<'query', OperationQuery<Name>> &
  Present<'body', OperationBody<Name>>;

interface ResponseMeta {
  status: number;
  /** Pulse-Server-Time, for the clock offset (spec 8.2); null when absent. */
  serverTime: string | null;
  requestId: string | null;
}

export type CallResult<Name extends HttpOperationName> =
  | ({ ok: true; data: OperationResponse<Name> } & ResponseMeta)
  | ({ ok: false; error: ErrorBody } & ResponseMeta);

function url(baseUrl: string, path: string, input: Record<string, unknown>): string {
  const params = (input['params'] ?? {}) as Record<string, string>;
  const filled = path.replace(/\{(\w+)\}/g, (_, name: string) =>
    encodeURIComponent(params[name] ?? ''),
  );
  const query = new URLSearchParams();
  // Query parts hold only strings, numbers and enum values (see the catalogue's query schemas).
  const values = (input['query'] ?? {}) as Record<string, string | number | undefined>;
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const search = query.size > 0 ? `?${query.toString()}` : '';
  return `${baseUrl.replace(/\/+$/, '')}${filled}${search}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function localError(code: ErrorCode, message: string, requestId: string | null): ErrorBody {
  return { code, message, requestId: requestId ?? 'none' };
}

export function createClient(options: ClientOptions) {
  async function call<Name extends HttpOperationName>(
    name: Name,
    input: CallInput<Name>,
  ): Promise<CallResult<Name>> {
    const op = httpOperation(name);
    const parts = input as Record<string, unknown>;
    const headers = new Headers({ accept: 'application/json' });
    const token = op.auth === 'user' ? options.accessToken?.() : undefined;
    if (token) headers.set('authorization', `Bearer ${token}`);
    const init: RequestInit = { method: op.method, headers };
    if (op.body) {
      headers.set('content-type', 'application/json');
      init.body = JSON.stringify(parts['body']);
    }

    const response = await options.fetch(url(options.baseUrl, op.path, parts), init);
    const meta: ResponseMeta = {
      status: response.status,
      serverTime: response.headers.get(SERVER_TIME_HEADER),
      requestId: response.headers.get(REQUEST_ID_HEADER),
    };
    const payload = await readJson(response);

    if (!response.ok) {
      const error = ErrorBody.safeParse(payload);
      return error.success
        ? { ok: false, error: error.data, ...meta }
        : {
            ok: false,
            error: localError(
              'UNAVAILABLE',
              `HTTP ${response.status} without a contract error`,
              meta.requestId,
            ),
            ...meta,
          };
    }
    if (!op.response) return { ok: true, data: undefined as OperationResponse<Name>, ...meta };
    const data = op.response.safeParse(payload);
    return data.success
      ? { ok: true, data: data.data as OperationResponse<Name>, ...meta }
      : {
          ok: false,
          error: localError('INTERNAL', `The ${name} response broke the contract`, meta.requestId),
          ...meta,
        };
  }
  return { call };
}

export type Client = ReturnType<typeof createClient>;
