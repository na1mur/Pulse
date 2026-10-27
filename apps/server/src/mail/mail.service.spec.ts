// OPS-07 (US-4.1, US-4.4, US-4.6): the typed send result, with a fake transport.
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonLogger } from '../platform/logging/json-logger.js';
import { testConfig } from '../platform/config/config.testing.js';
import { runWithLogContext, setLogUser } from '../platform/logging/log-context.js';
import { classifyMailFailure } from './mail-failure.js';
import type { MailTransport, OutgoingMail } from './mail-transport.js';
import { MailService } from './mail.service.js';
import { catcherConfig } from './smtp-test-server.testing.js';

const TOKEN = 'tok3nTOKEN-abcdef_0123456789ABCDEFghij';
const RECIPIENT = 'private.person@example.org';

class FakeTransport implements MailTransport {
  readonly sent: OutgoingMail[] = [];
  failure: Error | undefined = undefined;

  send(mail: OutgoingMail): Promise<void> {
    if (this.failure !== undefined) return Promise.reject(this.failure);
    this.sent.push(mail);
    return Promise.resolve();
  }
}

let logLines: string[] = [];

function serviceWith(transport: MailTransport | undefined): MailService {
  const config = testConfig({
    publicApiUrl: 'https://pulse.example.org',
    mail: transport === undefined ? undefined : catcherConfig(25),
  });
  return new MailService(transport, config);
}

describe('MailService (OPS-07)', () => {
  beforeEach(() => {
    logLines = [];
    Logger.overrideLogger(new JsonLogger((_level, line) => logLines.push(line)));
  });
  afterEach(() => {
    Logger.overrideLogger(['log', 'warn', 'error']);
  });

  describe('sending', () => {
    it('sends the verification email with its link from the public URL (US-4.1)', async () => {
      const transport = new FakeTransport();
      const result = await serviceWith(transport).sendVerifyEmail({ to: RECIPIENT, token: TOKEN });
      expect(result).toEqual({ status: 'sent' });
      expect(transport.sent).toHaveLength(1);
      expect(transport.sent[0]).toMatchObject({
        from: 'Pulse <pulse@example.org>',
        to: RECIPIENT,
        subject: 'Confirm your email',
      });
      expect(transport.sent[0]?.text).toContain(
        `https://pulse.example.org/auth/verify-email?token=${TOKEN}`,
      );
    });

    it('sends the password reset email (US-4.4)', async () => {
      const transport = new FakeTransport();
      const result = await serviceWith(transport).sendPasswordReset({
        to: RECIPIENT,
        token: TOKEN,
      });
      expect(result).toEqual({ status: 'sent' });
      expect(transport.sent[0]?.subject).toBe('Reset your password');
      expect(transport.sent[0]?.html).toContain(
        `https://pulse.example.org/auth/reset-password?token=${TOKEN}`,
      );
    });

    it('sends the email change email to the new address', async () => {
      const transport = new FakeTransport();
      const result = await serviceWith(transport).sendEmailChange({ to: RECIPIENT, token: TOKEN });
      expect(result).toEqual({ status: 'sent' });
      expect(transport.sent[0]).toMatchObject({ to: RECIPIENT, subject: 'Confirm your new email' });
      expect(transport.sent[0]?.text).toContain('/auth/confirm-email-change?token=');
    });

    it('sends the account deleted confirmation (US-4.6)', async () => {
      const transport = new FakeTransport();
      const result = await serviceWith(transport).sendAccountDeleted({ to: RECIPIENT });
      expect(result).toEqual({ status: 'sent' });
      expect(transport.sent[0]?.subject).toBe('Your Pulse account was deleted');
      expect(transport.sent[0]?.text).toContain('All your data has been permanently removed.');
    });
  });

  describe('when mail is not configured', () => {
    it('reports not-configured and logs it, without the address or the token', async () => {
      const service = serviceWith(undefined);
      const result = await service.sendVerifyEmail({ to: RECIPIENT, token: TOKEN });
      expect(result).toEqual({ status: 'not-configured' });
      const log = logLines.join('\n');
      expect(log).toContain('not configured');
      expect(log).not.toContain(RECIPIENT);
      expect(log).not.toContain(TOKEN);
    });

    it('reports it for every email type', async () => {
      const service = serviceWith(undefined);
      expect(await service.sendPasswordReset({ to: RECIPIENT, token: TOKEN })).toEqual({
        status: 'not-configured',
      });
      expect(await service.sendEmailChange({ to: RECIPIENT, token: TOKEN })).toEqual({
        status: 'not-configured',
      });
      expect(await service.sendAccountDeleted({ to: RECIPIENT })).toEqual({
        status: 'not-configured',
      });
    });
  });

  describe('when the input is unsafe', () => {
    it.each([
      'a@example.org\r\nBcc: evil@example.org',
      'a@example.org,evil@example.org',
      'Eve <a@example.org>',
      '',
    ])('refuses the address %j without calling the transport', async (to) => {
      const transport = new FakeTransport();
      const result = await serviceWith(transport).sendVerifyEmail({ to, token: TOKEN });
      expect(result).toEqual({ status: 'failed', reason: 'invalid-address' });
      expect(transport.sent).toHaveLength(0);
      expect(logLines.join('\n')).not.toContain('evil@example.org');
    });

    it('refuses a token that is not URL-safe', async () => {
      const transport = new FakeTransport();
      const result = await serviceWith(transport).sendPasswordReset({
        to: RECIPIENT,
        token: 'x"><script>alert(1)</script>0123456789',
      });
      expect(result).toEqual({ status: 'failed', reason: 'invalid-token' });
      expect(transport.sent).toHaveLength(0);
      expect(logLines.join('\n')).not.toContain('script');
    });
  });

  describe('when the send fails', () => {
    it('reports failed with a safe reason, never throws, and logs without recipient, link or token', async () => {
      const transport = new FakeTransport();
      // Real drivers put the recipient and server text into the message.
      transport.failure = Object.assign(
        new Error(`550 5.1.1 <${RECIPIENT}> rejected, link ${TOKEN}`),
        { code: 'EENVELOPE' },
      );
      const result = await runWithLogContext({ requestId: 'req-9' }, () => {
        setLogUser('user-42');
        return serviceWith(transport).sendVerifyEmail({ to: RECIPIENT, token: TOKEN });
      });
      expect(result).toEqual({ status: 'failed', reason: 'rejected' });
      const log = logLines.join('\n');
      expect(log).toContain('verify-email');
      expect(log).toContain('rejected');
      expect(log).toContain('EENVELOPE');
      expect(log).toContain('user-42');
      for (const secret of [RECIPIENT, TOKEN, 'example.org', '/auth/', 'Confirm your email']) {
        expect(log).not.toContain(secret);
      }
      expect(JSON.parse(logLines[0] ?? '{}')).toMatchObject({ level: 'error' });
    });

    it('survives a transport that throws synchronously or throws a non-error', async () => {
      const throwing: MailTransport = {
        send: () => {
          throw new TypeError('boom');
        },
      };
      expect(await serviceWith(throwing).sendAccountDeleted({ to: RECIPIENT })).toEqual({
        status: 'failed',
        reason: 'unknown',
      });
      // A driver may reject with a non-Error; the service must still answer with a result.
      const rejecting: MailTransport = {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberate
        send: () => Promise.reject('plain string'),
      };
      expect(await serviceWith(rejecting).sendAccountDeleted({ to: RECIPIENT })).toEqual({
        status: 'failed',
        reason: 'unknown',
      });
    });
  });
});

describe('classifyMailFailure', () => {
  const withCode = (code: string): Error => Object.assign(new Error('x'), { code });

  it.each([
    ['EAUTH', 'authentication'],
    ['ETIMEDOUT', 'timeout'],
    ['EENVELOPE', 'rejected'],
    ['EMESSAGE', 'rejected'],
    ['ECONNECTION', 'connection'],
    ['ECONNREFUSED', 'connection'],
    ['ECONNRESET', 'connection'],
    ['ESOCKET', 'connection'],
    ['ENOTFOUND', 'connection'],
    ['EDNS', 'connection'],
    ['ETLS', 'tls'],
    ['EREQUIRETLS', 'tls'],
    ['SOMETHING_ELSE', 'unknown'],
  ])('maps the code %s to %s', (code, reason) => {
    expect(classifyMailFailure(withCode(code))).toBe(reason);
  });

  it('maps the timeout error of our own deadline to timeout', () => {
    const error = new Error('x');
    error.name = 'TimeoutError';
    expect(classifyMailFailure(error)).toBe('timeout');
  });

  it('maps a certificate verification failure to tls', () => {
    expect(classifyMailFailure(withCode('DEPTH_ZERO_SELF_SIGNED_CERT'))).toBe('tls');
    expect(classifyMailFailure(withCode('ERR_TLS_CERT_ALTNAME_INVALID'))).toBe('tls');
  });

  it('maps a wrapped certificate failure (ESOCKET with the cause in originalCode) to tls', () => {
    const error = Object.assign(withCode('ESOCKET'), {
      originalCode: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    });
    expect(classifyMailFailure(error)).toBe('tls');
  });

  it('maps anything else, a non-error included, to unknown', () => {
    expect(classifyMailFailure(new Error('x'))).toBe('unknown');
    expect(classifyMailFailure(undefined)).toBe('unknown');
    expect(classifyMailFailure('text')).toBe('unknown');
  });
});
