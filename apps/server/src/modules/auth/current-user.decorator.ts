import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { AccessTokenClaims } from './access-token.service.js';

/** The user and device a request is signed in as, as proven by the auth guard. */
export type AuthenticatedUser = AccessTokenClaims;

const AUTHENTICATED = Symbol('pulse:authenticated-user');

type AuthenticatedRequest = IncomingMessage & { [AUTHENTICATED]?: AuthenticatedUser };

/** Called by the auth guard once the token and the device's sign-in are verified. */
export function attachAuthenticatedUser(request: IncomingMessage, user: AuthenticatedUser): void {
  (request as AuthenticatedRequest)[AUTHENTICATED] = user;
}

/**
 * The signed-in user of an `auth: 'user'` operation. Every query of such an operation is scoped by
 * `userId` from here (the owner check): never trust a user ID from the body, query or path.
 * Throws if used on a route the guard does not protect, which is a programming error.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>()[AUTHENTICATED];
    if (user === undefined) throw new Error('CurrentUser used on a route without authentication');
    return user;
  },
);
