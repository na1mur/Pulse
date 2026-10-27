import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MailModule } from '../../mail/mail.module.js';
import { PreferencesModule } from '../preferences/preferences.module.js';
import { TagsModule } from '../tags/tags.module.js';
import { AccessTokenService } from './access-token.service.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthPagesController } from './auth-pages.controller.js';
import { EmailTokensRepository } from './email-tokens.repository.js';
import { FirstSignInService } from './first-sign-in.service.js';
import { PasswordHasher } from './password-hasher.js';
import { RegistrationService } from './registration.service.js';
import { SessionService } from './session.service.js';
import { SessionsRepository } from './sessions.repository.js';
import { UsersRepository } from './users.repository.js';

/** Accounts, sign-up, verification and (T1.5 slices 3-4) sessions and first sign-in. */
@Module({
  imports: [MailModule, PreferencesModule, TagsModule],
  controllers: [AuthController, AuthPagesController],
  providers: [
    RegistrationService,
    SessionService,
    FirstSignInService,
    AccountService,
    SessionsRepository,
    AccessTokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
    UsersRepository,
    EmailTokensRepository,
    PasswordHasher,
  ],
})
export class AuthModule {}
