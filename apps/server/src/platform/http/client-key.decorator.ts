import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ipKey } from '../../domain/auth/ip-key.js';

/**
 * The rate-limit identity of the caller (`ipKey` of Express's `request.ip`). With `TRUST_PROXY`
 * at 0 that is the socket's address and `X-Forwarded-For` is ignored; with N it is the address
 * the Nth proxy from the server reported, so a client cannot choose it by sending the header
 * itself (spec 9.1, Appendix A).
 */
export const ClientKey = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<IncomingMessage & { ip?: string }>();
  return ipKey(request.ip);
});
