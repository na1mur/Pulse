import { Controller } from '@nestjs/common';
import type { OperationBody, OperationResponse } from '@pulse/contract';
import { ClientKey } from '../../platform/http/client-key.decorator.js';
import { ContractBody, ContractRoute } from '../../platform/http/contract-route.js';
import { AccountService } from './account.service.js';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator.js';
import { FirstSignInService } from './first-sign-in.service.js';
import { RegistrationService } from './registration.service.js';
import { SessionService } from './session.service.js';

/** The Auth group (spec 7.2): transport only, the services decide. */
@Controller()
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly sessions: SessionService,
    private readonly account: AccountService,
    private readonly firstSignIn: FirstSignInService,
  ) {}

  @ContractRoute('auth.register')
  register(
    @ContractBody('auth.register') body: OperationBody<'auth.register'>,
    @ClientKey() client: string,
  ): Promise<OperationResponse<'auth.register'>> {
    return this.registration.register(body, client);
  }

  @ContractRoute('auth.verifyEmail')
  verifyEmail(
    @ContractBody('auth.verifyEmail') body: OperationBody<'auth.verifyEmail'>,
    @ClientKey() client: string,
  ): Promise<OperationResponse<'auth.verifyEmail'>> {
    return this.registration.verifyEmail(body.token, client);
  }

  @ContractRoute('auth.resendVerification')
  resendVerification(
    @ContractBody('auth.resendVerification') body: OperationBody<'auth.resendVerification'>,
    @ClientKey() client: string,
  ): OperationResponse<'auth.resendVerification'> {
    this.registration.resendVerification(body, client);
  }

  @ContractRoute('auth.login')
  login(
    @ContractBody('auth.login') body: OperationBody<'auth.login'>,
    @ClientKey() client: string,
  ): Promise<OperationResponse<'auth.login'>> {
    return this.sessions.login(body, client);
  }

  @ContractRoute('auth.refresh')
  refresh(
    @ContractBody('auth.refresh') body: OperationBody<'auth.refresh'>,
    @ClientKey() client: string,
  ): Promise<OperationResponse<'auth.refresh'>> {
    return this.sessions.refresh(body, client);
  }

  @ContractRoute('auth.logout')
  logout(@CurrentUser() user: AuthenticatedUser): Promise<OperationResponse<'auth.logout'>> {
    return this.sessions.logout(user);
  }

  @ContractRoute('auth.getMe')
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<OperationResponse<'auth.getMe'>> {
    return this.account.me(user.userId);
  }

  @ContractRoute('auth.completeFirstSignIn')
  completeFirstSignIn(
    @ContractBody('auth.completeFirstSignIn') body: OperationBody<'auth.completeFirstSignIn'>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OperationResponse<'auth.completeFirstSignIn'>> {
    return this.firstSignIn.complete(user.userId, body);
  }
}
