import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { isMailToken } from '../../mail/mail-links.js';
import { AppError } from '../../platform/errors/app-error.js';
import { ClientKey } from '../../platform/http/client-key.decorator.js';
import {
  PAGE_HEADERS,
  confirmEmailPage,
  emailConfirmedPage,
  invalidLinkPage,
  tooManyAttemptsPage,
} from './auth-pages.js';
import { RegistrationService } from './registration.service.js';

/** The part of an Express response these pages use. */
interface PageResponse {
  status(code: number): PageResponse;
  setHeader(name: string, value: string): unknown;
  send(body: string): unknown;
}

function send(response: PageResponse, status: number, html: string): void {
  for (const [name, value] of Object.entries(PAGE_HEADERS)) response.setHeader(name, value);
  response.status(status).send(html);
}

/** The token as a single string, or undefined for anything else (missing, repeated, nested). */
function tokenOf(value: unknown): string | undefined {
  return typeof value === 'string' && isMailToken(value) ? value : undefined;
}

/**
 * The pages behind the links in emails (ARCHITECTURE "Email links"). Not contract operations:
 * they answer HTML to a browser, outside `/v1`. A GET only shows a button; the POST behind it
 * uses the token, through the same service call and the same rate limit as `auth.verifyEmail`.
 */
@Controller('auth')
export class AuthPagesController {
  constructor(private readonly registration: RegistrationService) {}

  @Get('verify-email')
  showVerifyEmail(@Query('token') token: unknown, @Res() response: PageResponse): void {
    const valid = tokenOf(token);
    if (valid === undefined) send(response, 400, invalidLinkPage());
    else send(response, 200, confirmEmailPage(valid));
  }

  @Post('verify-email')
  async confirmVerifyEmail(
    @Body() body: unknown,
    @ClientKey() client: string,
    @Res() response: PageResponse,
  ): Promise<void> {
    const token = tokenOf((body as { token?: unknown } | null | undefined)?.token);
    if (token === undefined) {
      send(response, 400, invalidLinkPage());
      return;
    }
    try {
      await this.registration.verifyEmail(token, client);
    } catch (error) {
      if (error instanceof AppError && error.code === 'VALIDATION') {
        send(response, 400, invalidLinkPage());
        return;
      }
      if (error instanceof AppError && error.code === 'RATE_LIMITED') {
        response.setHeader('Retry-After', String(error.retryAfterSeconds ?? 60));
        send(response, 429, tooManyAttemptsPage());
        return;
      }
      throw error;
    }
    send(response, 200, emailConfirmedPage());
  }
}
