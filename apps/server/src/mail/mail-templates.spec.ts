// OPS-07 templates; copy from spec Appendix B (US-4.1, US-4.4, US-4.6).
import { describe, expect, it } from 'vitest';
import { buildMailLink, isMailToken, MAIL_LINK_PATHS } from './mail-links.js';
import { renderMail } from './mail-templates.js';

const API = 'https://pulse.example.org';
const TOKEN = 'abcDEF0123456789_-abcDEF0123456789_-abc';

describe('buildMailLink', () => {
  it('joins the public API URL, the path of the email type and the token', () => {
    expect(buildMailLink(API, 'verify-email', TOKEN)).toBe(
      `https://pulse.example.org/auth/verify-email?token=${TOKEN}`,
    );
    expect(buildMailLink(API, 'password-reset', TOKEN)).toBe(
      `https://pulse.example.org/auth/reset-password?token=${TOKEN}`,
    );
    expect(buildMailLink(API, 'email-change', TOKEN)).toBe(
      `https://pulse.example.org/auth/confirm-email-change?token=${TOKEN}`,
    );
  });

  it('keeps a base path and a port of the public URL', () => {
    expect(buildMailLink('http://localhost:3000', 'verify-email', TOKEN)).toBe(
      `http://localhost:3000/auth/verify-email?token=${TOKEN}`,
    );
    expect(buildMailLink('https://example.org/pulse', 'password-reset', TOKEN)).toBe(
      `https://example.org/pulse/auth/reset-password?token=${TOKEN}`,
    );
  });

  it('has one distinct path per link type', () => {
    expect(new Set(Object.values(MAIL_LINK_PATHS)).size).toBe(3);
  });
});

describe('isMailToken', () => {
  it('accepts URL-safe base64 text of a realistic length', () => {
    expect(isMailToken(TOKEN)).toBe(true);
  });

  it.each(['', 'short', 'has space 0123456789abcdef', 'a&b=c0123456789abcdef', 'x'.repeat(300)])(
    'rejects %j',
    (token) => {
      expect(isMailToken(token)).toBe(false);
    },
  );
});

describe('renderMail', () => {
  const link = buildMailLink(API, 'verify-email', TOKEN);

  it('renders the verification email with the Appendix B copy (US-4.1)', () => {
    const mail = renderMail({ type: 'verify-email', link });
    expect(mail.subject).toBe('Confirm your email');
    expect(mail.text).toContain('Open this link within 24 hours to finish signing up.');
    expect(mail.text).toContain(link);
    expect(mail.html).toContain('Open this link within 24 hours to finish signing up.');
    expect(mail.html).toContain(`href="${link}"`);
  });

  it('renders the password reset email with the Appendix B copy (US-4.4)', () => {
    const resetLink = buildMailLink(API, 'password-reset', TOKEN);
    const mail = renderMail({ type: 'password-reset', link: resetLink });
    expect(mail.subject).toBe('Reset your password');
    expect(mail.text).toContain('This link works once, within 1 hour.');
    expect(mail.text).toContain(resetLink);
    expect(mail.html).toContain('This link works once, within 1 hour.');
    expect(mail.html).toContain(`href="${resetLink}"`);
  });

  it('renders the email change email with the recommended copy (Appendix B)', () => {
    const changeLink = buildMailLink(API, 'email-change', TOKEN);
    const mail = renderMail({ type: 'email-change', link: changeLink });
    expect(mail.subject).toBe('Confirm your new email');
    expect(mail.text).toContain(
      'Open this link within 24 hours to confirm this address for your Pulse account.',
    );
    expect(mail.text).toContain(changeLink);
    expect(mail.html).toContain(`href="${changeLink}"`);
  });

  it('renders the account deleted email without a link (US-4.6)', () => {
    const mail = renderMail({ type: 'account-deleted' });
    expect(mail.subject).toBe('Your Pulse account was deleted');
    expect(mail.text).toContain('All your data has been permanently removed.');
    expect(mail.html).toContain('All your data has been permanently removed.');
    expect(mail.text).not.toContain('http');
    expect(mail.html).not.toContain('href');
  });

  it('has a plain text part and a minimal HTML part without remote content', () => {
    for (const mail of [
      renderMail({ type: 'verify-email', link }),
      renderMail({ type: 'account-deleted' }),
    ]) {
      expect(mail.text).not.toContain('<');
      expect(mail.html).toMatch(/^<!doctype html>/i);
      expect(mail.html).not.toMatch(/<(img|script|link|iframe|style)\b|src=|url\(/i);
    }
  });

  it('escapes every interpolated value in the HTML part', () => {
    const hostile = 'https://x.example/"><script>alert(1)</script>&\'';
    const mail = renderMail({ type: 'verify-email', link: hostile });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('x.example/"');
    expect(mail.html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;&#39;');
  });
});
