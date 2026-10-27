import { createTransport } from 'nodemailer';
import { withTimeout } from '../platform/async/with-timeout.js';
import type { MailConfig } from '../platform/config/app-config.js';
import type { MailTransport, OutgoingMail } from './mail-transport.js';

/** Bounds for one send, so a hung mail host cannot hold a request or a shutdown (spec 9.2). */
export interface SmtpTimeouts {
  readonly connectionMs: number;
  readonly greetingMs: number;
  readonly socketMs: number;
  /** The whole send, whatever the host does in between. */
  readonly overallMs: number;
}

export const DEFAULT_SMTP_TIMEOUTS: SmtpTimeouts = {
  connectionMs: 8_000,
  greetingMs: 8_000,
  socketMs: 15_000,
  overallMs: 20_000,
};

// The implicit-TLS port (SMTPS); every other port starts in plain text and upgrades.
const IMPLICIT_TLS_PORT = 465;

/**
 * SMTP over Nodemailer. With a login the connection must be encrypted (implicit TLS on port 465,
 * otherwise STARTTLS is required), so the app password never travels in the clear and a server
 * that cannot encrypt makes the send fail. Without a login (a catcher such as Mailpit) plain SMTP
 * is allowed. Certificates are always verified. A new connection per message: Pulse sends a few
 * emails a day, a pool would only hold idle sockets.
 */
export function createSmtpTransport(
  config: MailConfig,
  timeouts: SmtpTimeouts = DEFAULT_SMTP_TIMEOUTS,
): MailTransport {
  const hasLogin = config.user !== undefined && config.password !== undefined;
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === IMPLICIT_TLS_PORT,
    requireTLS: hasLogin && config.port !== IMPLICIT_TLS_PORT,
    auth: hasLogin ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: timeouts.connectionMs,
    greetingTimeout: timeouts.greetingMs,
    socketTimeout: timeouts.socketMs,
    // A message is built from our own strings only; never let one read a file or fetch a URL.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(mail: OutgoingMail): Promise<void> {
      await withTimeout(
        transport.sendMail({
          from: mail.from,
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          headers: { 'Auto-Submitted': 'auto-generated' },
        }),
        timeouts.overallMs,
        'Sending an email',
      );
    },
  };
}
