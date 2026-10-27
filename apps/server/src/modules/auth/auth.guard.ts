import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import { OPERATION_AUTH } from '../../platform/http/contract-route.js';
import { setLogUser } from '../../platform/logging/log-context.js';
import { AccessTokenService } from './access-token.service.js';
import { unauthenticated } from './auth-errors.js';
import { attachAuthenticatedUser } from './current-user.decorator.js';
import { SessionService } from './session.service.js';

// RFC 6750: `Bearer` (any letter case), one space, a token of base64url-and-dot characters.
const BEARER = /^bearer ([A-Za-z0-9._~+/=-]+)$/i;

/**
 * Enforces the catalogue's `auth: 'user'` on every operation bound with `ContractRoute`, for the
 * whole application (registered as the global guard). It accepts a request only when the access
 * token verifies (HS256, issuer, audience, expiry) AND the device it was issued to is still
 * signed in: the token's credential family must hold an unrevoked, unexpired credential, so
 * logout, revocation and reuse detection take effect on the next request instead of when the
 * 15-minute token expires. Every failure is the same 401. Sets the user on the log context.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.get<string | undefined>(
      OPERATION_AUTH,
      context.getHandler(),
    );
    if (requirement !== 'user') return true;

    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const header = request.headers.authorization;
    const token = header === undefined ? undefined : BEARER.exec(header)?.[1];
    const claims = token === undefined ? undefined : await this.accessTokens.verify(token);
    const signedIn = claims !== undefined && (await this.sessions.isSignedIn(claims));
    if (!signedIn) throw unauthenticated();

    attachAuthenticatedUser(request, claims);
    setLogUser(claims.userId);
    return true;
  }
}
