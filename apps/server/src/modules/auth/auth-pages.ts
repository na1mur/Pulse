import { createHash } from 'node:crypto';

// The pages the server itself answers for links in emails (ARCHITECTURE "Email links"): a person
// opens them in whatever browser reads the mail, with no Pulse client involved. They hold no
// script and one fixed style block, whose hash the Content-Security-Policy names, so nothing a
// request carries can run or load.
const STYLE = `
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #f7f5fb; color: #1f1b2e; }
  main { max-width: 26rem; margin: 1rem; padding: 2rem; background: #fff; border-radius: 12px; box-shadow: 0 1px 6px rgba(0,0,0,.12); }
  h1 { margin: 0 0 .75rem; font-size: 1.35rem; }
  p { margin: 0 0 1.25rem; }
  button { font: inherit; font-weight: 600; color: #fff; background: #7c3aed; border: 0; border-radius: 8px; padding: .65rem 1.25rem; cursor: pointer; }
`;

const styleHash = createHash('sha256').update(STYLE).digest('base64');

/** Headers every link page carries: no caching, no referrer, no framing, nothing loaded. */
export const PAGE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': `default-src 'none'; style-src 'sha256-${styleHash}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} - Pulse</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
${body}
</main>
</body>
</html>
`;
}

/**
 * The page a verification link opens. It only offers a button: the token is used when the
 * button posts it, never when the page is fetched, because mail scanners and link previews
 * fetch links. The token has passed `isMailToken` (URL-safe base64 only) before it gets here.
 */
export function confirmEmailPage(token: string): string {
  return page(
    'Confirm your email address',
    `<p>Press the button to confirm this email address for your Pulse account.</p>
<form method="post" action="/auth/verify-email">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit">Confirm email</button>
</form>`,
  );
}

export function emailConfirmedPage(): string {
  return page(
    'Email confirmed',
    '<p>Your email address is confirmed. Go back to Pulse and sign in.</p>',
  );
}

export function invalidLinkPage(): string {
  return page(
    'This link does not work',
    '<p>The link is invalid or has expired. In Pulse, sign in and choose "Resend verification email" to get a new one.</p>',
  );
}

export function tooManyAttemptsPage(): string {
  return page('Too many attempts', '<p>Please wait a few minutes and try again.</p>');
}
