/** The emails that carry a link with a single-use token (account deletion has none). */
export type MailLinkType = 'verify-email' | 'password-reset' | 'email-change';

/**
 * Where each link lands, below `PUBLIC_API_URL` (docs/ARCHITECTURE.md, "Email links"). The server
 * itself answers these paths (T1.5 and T1.7), because a link opened from a mail app must work
 * with no Pulse client installed on that device.
 */
export const MAIL_LINK_PATHS: Readonly<Record<MailLinkType, string>> = {
  'verify-email': '/auth/verify-email',
  'password-reset': '/auth/reset-password',
  'email-change': '/auth/confirm-email-change',
};

// URL-safe base64 (what `randomBytes(32).toString('base64url')` makes): nothing that needs
// escaping in a URL or an HTML attribute. Bounds catch an empty or runaway value from a caller bug.
const TOKEN = /^[A-Za-z0-9_-]{16,256}$/;

/** True for a token that can go into a link as it is. */
export function isMailToken(token: string): boolean {
  return typeof token === 'string' && TOKEN.test(token);
}

/** `<public API URL><path>?token=<token>`; the token must pass `isMailToken`. */
export function buildMailLink(publicApiUrl: string, type: MailLinkType, token: string): string {
  return `${publicApiUrl}${MAIL_LINK_PATHS[type]}?token=${token}`;
}
