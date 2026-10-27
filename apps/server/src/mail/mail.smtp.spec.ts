// OPS-07 against a real SMTP conversation (in-process server, no external service): every email
// arrives with the right copy, link and parts; failures are results and log lines, never throws.
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG, ConfigModule } from '../platform/config/config.module.js';
import { testConfig } from '../platform/config/config.testing.js';
import { JsonLogger } from '../platform/logging/json-logger.js';
import { MailModule } from './mail.module.js';
import { MailService } from './mail.service.js';
import { DEFAULT_SMTP_TIMEOUTS, createSmtpTransport } from './smtp-transport.js';
import {
  catcherConfig,
  startSilentServer,
  startTestSmtpServer,
  unusedPort,
  type TestSmtpServer,
} from './smtp-test-server.testing.js';

const TOKEN = 'Zk3-0123456789_abcdefABCDEFxyz0123456789';
const API_URL = 'https://pulse.example.org';
const RECIPIENT = 'ada.lovelace@example.org';

let logLines: string[] = [];

function serviceFor(config: ReturnType<typeof catcherConfig>, timeouts = DEFAULT_SMTP_TIMEOUTS) {
  return new MailService(
    createSmtpTransport(config, timeouts),
    testConfig({ publicApiUrl: API_URL, mail: config }),
  );
}

function allLog(): string {
  return logLines.join('\n');
}

describe('mail over SMTP (OPS-07)', () => {
  beforeEach(() => {
    logLines = [];
    Logger.overrideLogger(new JsonLogger((_level, line) => logLines.push(line)));
  });
  afterEach(() => {
    Logger.overrideLogger(['log', 'warn', 'error']);
  });

  describe('delivery to a catcher', () => {
    let catcher: TestSmtpServer;
    let mail: MailService;

    beforeAll(async () => {
      catcher = await startTestSmtpServer();
      mail = serviceFor(catcherConfig(catcher.port));
    });
    afterAll(async () => {
      await catcher.close();
    });

    it('delivers the verification email with subject, copy, link, text and HTML (US-4.1)', async () => {
      const before = catcher.messages.length;
      expect(await mail.sendVerifyEmail({ to: RECIPIENT, token: TOKEN })).toEqual({
        status: 'sent',
      });
      const message = catcher.messages[before];
      const link = `${API_URL}/auth/verify-email?token=${TOKEN}`;
      expect(message?.subject).toBe('Confirm your email');
      expect(message?.from?.value).toMatchObject([{ name: 'Pulse', address: 'pulse@example.org' }]);
      expect(message?.to).toMatchObject({ text: RECIPIENT });
      expect(message?.text).toContain('Open this link within 24 hours to finish signing up.');
      expect(message?.text).toContain(link);
      expect(message?.html).toContain('Open this link within 24 hours to finish signing up.');
      expect(message?.html).toContain(`href="${link}"`);
      expect(message?.headers.get('auto-submitted')).toBe('auto-generated');
    });

    it('delivers the password reset email (US-4.4)', async () => {
      const before = catcher.messages.length;
      expect(await mail.sendPasswordReset({ to: RECIPIENT, token: TOKEN })).toEqual({
        status: 'sent',
      });
      const message = catcher.messages[before];
      expect(message?.subject).toBe('Reset your password');
      expect(message?.text).toContain('This link works once, within 1 hour.');
      expect(message?.text).toContain(`${API_URL}/auth/reset-password?token=${TOKEN}`);
      expect(message?.html).toContain('This link works once, within 1 hour.');
    });

    it('delivers the email change email to the new address', async () => {
      const before = catcher.messages.length;
      expect(await mail.sendEmailChange({ to: 'new.address@example.org', token: TOKEN })).toEqual({
        status: 'sent',
      });
      const message = catcher.messages[before];
      expect(message?.subject).toBe('Confirm your new email');
      expect(message?.to).toMatchObject({ text: 'new.address@example.org' });
      expect(message?.text).toContain(
        'Open this link within 24 hours to confirm this address for your Pulse account.',
      );
      expect(message?.text).toContain(`${API_URL}/auth/confirm-email-change?token=${TOKEN}`);
    });

    it('delivers the account deleted email without a link (US-4.6)', async () => {
      const before = catcher.messages.length;
      expect(await mail.sendAccountDeleted({ to: RECIPIENT })).toEqual({ status: 'sent' });
      const message = catcher.messages[before];
      expect(message?.subject).toBe('Your Pulse account was deleted');
      expect(message?.text).toContain('All your data has been permanently removed.');
      expect(message?.html).toContain('All your data has been permanently removed.');
      expect(message?.text).not.toContain('http');
    });

    it.each([
      'a@example.org\r\nBcc: evil@example.org',
      'a@example.org\nBcc: evil@example.org',
      'a@example.org,evil@example.org',
      'Eve <a@example.org>',
      '"a@example.org"',
    ])('rejects the address %j before anything reaches the server', async (to) => {
      const before = catcher.messages.length;
      expect(await mail.sendVerifyEmail({ to, token: TOKEN })).toEqual({
        status: 'failed',
        reason: 'invalid-address',
      });
      expect(catcher.messages).toHaveLength(before);
      expect(allLog()).not.toContain('evil@example.org');
    });
  });

  describe('failures', () => {
    it('reports connection when nothing listens, logs the reason only, and does not throw', async () => {
      const mail = serviceFor(catcherConfig(await unusedPort()));
      const result = await mail.sendVerifyEmail({ to: RECIPIENT, token: TOKEN });
      expect(result).toEqual({ status: 'failed', reason: 'connection' });
      const log = allLog();
      expect(log).toContain('Email verify-email not sent: connection');
      for (const secret of [RECIPIENT, TOKEN, '127.0.0.1', 'example.org', 'Confirm your email']) {
        expect(log).not.toContain(secret);
      }
    });

    it('reports rejected when the server refuses the recipient, and the server text stays out of the log', async () => {
      const server = await startTestSmtpServer({ rejectRecipients: true });
      try {
        const result = await serviceFor(catcherConfig(server.port)).sendPasswordReset({
          to: RECIPIENT,
          token: TOKEN,
        });
        expect(result).toEqual({ status: 'failed', reason: 'rejected' });
        expect(allLog()).toContain('rejected');
        expect(allLog()).not.toContain(RECIPIENT);
        expect(allLog()).not.toContain('does not exist');
      } finally {
        await server.close();
      }
    });

    it('reports rejected when the server refuses the message', async () => {
      const server = await startTestSmtpServer({ rejectData: true });
      try {
        const result = await serviceFor(catcherConfig(server.port)).sendAccountDeleted({
          to: RECIPIENT,
        });
        expect(result).toEqual({ status: 'failed', reason: 'rejected' });
      } finally {
        await server.close();
      }
    });

    it('reports timeout when the host never answers', async () => {
      const silent = await startSilentServer();
      try {
        const mail = serviceFor(catcherConfig(silent.port), {
          connectionMs: 300,
          greetingMs: 300,
          socketMs: 300,
          overallMs: 1_000,
        });
        const result = await mail.sendVerifyEmail({ to: RECIPIENT, token: TOKEN });
        expect(result).toEqual({ status: 'failed', reason: 'timeout' });
      } finally {
        await silent.close();
      }
    });

    it('never sends the login over an unencrypted connection', async () => {
      const server = await startTestSmtpServer();
      try {
        const config = catcherConfig(server.port, {
          user: 'pulse@example.org',
          password: 'app-password-1234',
        });
        const result = await serviceFor(config).sendVerifyEmail({ to: RECIPIENT, token: TOKEN });
        expect(result).toEqual({ status: 'failed', reason: 'tls' });
        expect(server.authAttempts()).toBe(0);
        expect(server.messages).toHaveLength(0);
        expect(allLog()).not.toContain('app-password-1234');
      } finally {
        await server.close();
      }
    });

    it('refuses a server certificate it cannot verify', async () => {
      const server = await startTestSmtpServer({ offerTls: true });
      try {
        const config = catcherConfig(server.port, {
          user: 'pulse@example.org',
          password: 'app-password-1234',
        });
        const result = await serviceFor(config).sendVerifyEmail({ to: RECIPIENT, token: TOKEN });
        expect(result).toEqual({ status: 'failed', reason: 'tls' });
        expect(server.authAttempts()).toBe(0);
        expect(server.messages).toHaveLength(0);
      } finally {
        await server.close();
      }
    });
  });

  describe('as a Nest module', () => {
    it('wires the service from the configuration and delivers', async () => {
      const server = await startTestSmtpServer();
      try {
        const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, MailModule] })
          .overrideProvider(APP_CONFIG)
          .useValue(testConfig({ publicApiUrl: API_URL, mail: catcherConfig(server.port) }))
          .compile();
        const result = await moduleRef.get(MailService).sendAccountDeleted({ to: RECIPIENT });
        expect(result).toEqual({ status: 'sent' });
        expect(server.messages).toHaveLength(1);
        await moduleRef.close();
      } finally {
        await server.close();
      }
    });

    it('reports not-configured, at start and on every send, when there is no SMTP setting', async () => {
      // compile() installs the testing logger, so the capturing one is set on the builder.
      const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, MailModule] })
        .setLogger(new JsonLogger((_level, line) => logLines.push(line)))
        .overrideProvider(APP_CONFIG)
        .useValue(testConfig({ mail: undefined }))
        .compile();
      await moduleRef.init();
      expect(allLog()).toContain('Mail is not configured');
      const result = await moduleRef
        .get(MailService)
        .sendVerifyEmail({ to: RECIPIENT, token: TOKEN });
      expect(result).toEqual({ status: 'not-configured' });
      expect(allLog()).toContain('Email verify-email not sent: mail is not configured');
      await moduleRef.close();
    });
  });
});
