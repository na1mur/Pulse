import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppConfig } from '../platform/config/app-config.js';
import { APP_CONFIG } from '../platform/config/config.module.js';
import { summarizeError } from '../platform/logging/safe-error.js';
import { isSafeMailAddress } from './mail-address.js';
import { classifyMailFailure, type MailFailureReason, type MailResult } from './mail-failure.js';
import { buildMailLink, isMailToken, type MailLinkType } from './mail-links.js';
import { renderMail, type MailTemplate } from './mail-templates.js';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport.js';

/** A recipient and the single-use token the link carries (made by auth, T1.5 and T1.7). */
export interface MailWithToken {
  readonly to: string;
  readonly token: string;
}

export interface MailRecipient {
  readonly to: string;
}

/**
 * Outgoing email (OPS-07): one method per email type, each returning a `MailResult` instead of
 * throwing, so a caller in the middle of a transaction decides what a failed send means (the
 * verification email can be resent; a reset never reveals whether the address exists). A failure
 * is logged here with the email type, a reason and the error class and code only: never the
 * recipient, link, token or body (OPS-04); the log context adds the request and user IDs.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | undefined,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** US-4.1: the link is valid 24 hours. */
  sendVerifyEmail(input: MailWithToken): Promise<MailResult> {
    return this.sendWithLink('verify-email', input);
  }

  /** US-4.4: the link works once, within 1 hour. */
  sendPasswordReset(input: MailWithToken): Promise<MailResult> {
    return this.sendWithLink('password-reset', input);
  }

  /** Goes to the new address; the link is valid 24 hours. */
  sendEmailChange(input: MailWithToken): Promise<MailResult> {
    return this.sendWithLink('email-change', input);
  }

  /** US-4.6: the confirmation after a hard delete; the address is not stored any more. */
  sendAccountDeleted(input: MailRecipient): Promise<MailResult> {
    return this.deliver('account-deleted', input.to, () => ({ type: 'account-deleted' }));
  }

  private sendWithLink(type: MailLinkType, input: MailWithToken): Promise<MailResult> {
    if (!isMailToken(input.token)) return Promise.resolve(this.refuse(type, 'invalid-token'));
    return this.deliver(type, input.to, () => ({
      type,
      link: buildMailLink(this.config.publicApiUrl, type, input.token),
    }));
  }

  private async deliver(
    type: MailTemplate['type'],
    to: string,
    template: () => MailTemplate,
  ): Promise<MailResult> {
    const mailConfig = this.config.mail;
    if (this.transport === undefined || mailConfig === undefined) {
      this.logger.warn(
        `Email ${type} not sent: mail is not configured (set SMTP_HOST or SMTP_USER).`,
      );
      return { status: 'not-configured' };
    }
    if (!isSafeMailAddress(to)) return this.refuse(type, 'invalid-address');
    try {
      await this.transport.send({ from: mailConfig.from, to, ...renderMail(template()) });
      return { status: 'sent' };
    } catch (error) {
      const reason = classifyMailFailure(error);
      this.logger.error(`Email ${type} not sent: ${reason} (${summarizeError(error)}).`);
      return { status: 'failed', reason };
    }
  }

  private refuse(type: MailTemplate['type'], reason: MailFailureReason): MailResult {
    this.logger.error(`Email ${type} not sent: ${reason}.`);
    return { status: 'failed', reason };
  }
}
