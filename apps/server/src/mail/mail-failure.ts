/**
 * Why a send failed, as a closed set that is safe to log and to show an operator: none of these
 * carries an address, link, token or server text (OPS-04).
 */
export type MailFailureReason =
  | 'invalid-address'
  | 'invalid-token'
  | 'timeout'
  | 'connection'
  | 'tls'
  | 'authentication'
  | 'rejected'
  | 'unknown';

// Node and OpenSSL certificate problems: the server's certificate is not trusted.
const CERTIFICATE_CODE = /^(ERR_TLS_|ERR_SSL_)|CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE/;

/** Maps a transport error to a reason by its code (never by its message, which names users). */
export function classifyMailFailure(error: unknown): MailFailureReason {
  if (!(error instanceof Error)) return 'unknown';
  if (error.name === 'TimeoutError') return 'timeout';
  const { code, originalCode } = error as { code?: unknown; originalCode?: unknown };
  // Nodemailer wraps a failed TLS handshake as ESOCKET and keeps the cause's code in originalCode.
  if (typeof originalCode === 'string' && CERTIFICATE_CODE.test(originalCode)) return 'tls';
  if (typeof code !== 'string') return 'unknown';
  switch (code) {
    case 'EAUTH':
      return 'authentication';
    case 'ETIMEDOUT':
      return 'timeout';
    case 'EENVELOPE':
    case 'EMESSAGE':
      return 'rejected';
    case 'ETLS':
    case 'EREQUIRETLS':
      return 'tls';
    case 'ECONNECTION':
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'ESOCKET':
    case 'ENOTFOUND':
    case 'EDNS':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return 'connection';
    default:
      return CERTIFICATE_CODE.test(code) ? 'tls' : 'unknown';
  }
}

/** The result of one send, for the caller to act on (the verification email can be resent, ...). */
export type MailResult =
  | { readonly status: 'sent' }
  | { readonly status: 'failed'; readonly reason: MailFailureReason }
  | { readonly status: 'not-configured' };
