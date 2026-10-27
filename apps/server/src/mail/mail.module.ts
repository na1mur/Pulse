import { Inject, Logger, Module, type OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '../platform/config/app-config.js';
import { APP_CONFIG } from '../platform/config/config.module.js';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport.js';
import { MailService } from './mail.service.js';
import { createSmtpTransport } from './smtp-transport.js';

/**
 * Outgoing email (OPS-07). Imported by the auth module; controllers never use it. The transport
 * is `undefined` when SMTP is not configured: every send then answers `not-configured`.
 */
@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): MailTransport | undefined =>
        config.mail && createSmtpTransport(config.mail),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule implements OnModuleInit {
  private readonly logger = new Logger(MailModule.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  onModuleInit(): void {
    // Said once at start, so an operator sees it before the first sign-up fails to send.
    if (this.config.mail === undefined) {
      this.logger.warn(
        'Mail is not configured: no verification or reset emails will be sent. ' +
          'Set SMTP_USER and SMTP_APP_PASSWORD, or SMTP_HOST.',
      );
    }
  }
}
