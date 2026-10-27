/** What the transport sends: one subject and the two alternative bodies. */
export interface RenderedMail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export type MailTemplate =
  | { readonly type: 'verify-email'; readonly link: string }
  | { readonly type: 'password-reset'; readonly link: string }
  | { readonly type: 'email-change'; readonly link: string }
  | { readonly type: 'account-deleted' };

interface Copy {
  readonly title: string;
  readonly message: string;
}

// Spec Appendix B (copy deck). The email change row is the recommendation recorded with T1.4.
const COPY: Readonly<Record<MailTemplate['type'], Copy>> = {
  'verify-email': {
    title: 'Confirm your email',
    message: 'Open this link within 24 hours to finish signing up.',
  },
  'password-reset': {
    title: 'Reset your password',
    message: 'This link works once, within 1 hour.',
  },
  'email-change': {
    title: 'Confirm your new email',
    message: 'Open this link within 24 hours to confirm this address for your Pulse account.',
  },
  'account-deleted': {
    title: 'Your Pulse account was deleted',
    message: 'All your data has been permanently removed.',
  },
};

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/**
 * Renders one email: plain text plus a minimal HTML alternative (no remote images, scripts or
 * styles). Every interpolated value is escaped in the HTML part; the copy itself is constant.
 */
export function renderMail(template: MailTemplate): RenderedMail {
  const { title, message } = COPY[template.type];
  const link = 'link' in template ? template.link : undefined;
  const text = [title, '', message, ...(link === undefined ? [] : ['', link]), ''].join('\n');
  const html = [
    '<!doctype html>',
    '<html lang="en"><body>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(message)}</p>`,
    ...(link === undefined ? [] : [`<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`]),
    '</body></html>',
    '',
  ].join('\n');
  return { subject: title, text, html };
}
