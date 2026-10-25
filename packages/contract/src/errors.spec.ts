import { describe, expect, it } from 'vitest';
import { ERROR_HTTP_STATUS, ErrorBody, ErrorCode, fieldErrors } from './errors.js';

describe('error model (spec 7.1)', () => {
  it('has exactly the eight codes of spec 7.1', () => {
    expect(ErrorCode.options).toEqual([
      'VALIDATION',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'RATE_LIMITED',
      'UNAVAILABLE',
      'INTERNAL',
    ]);
  });

  it('maps every code to one HTTP status', () => {
    expect(ERROR_HTTP_STATUS).toEqual({
      VALIDATION: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      RATE_LIMITED: 429,
      UNAVAILABLE: 503,
      INTERNAL: 500,
    });
  });

  it('requires code, message and requestId; details are optional', () => {
    expect(
      ErrorBody.safeParse({ code: 'NOT_FOUND', message: 'Not found', requestId: 'r-1' }).success,
    ).toBe(true);
    expect(ErrorBody.safeParse({ code: 'NOT_FOUND', message: 'Not found' }).success).toBe(false);
    expect(ErrorBody.safeParse({ code: 'TEAPOT', message: 'x', requestId: 'r-1' }).success).toBe(
      false,
    );
  });

  it('carries field errors and the conflicting session ID in details', () => {
    const body = {
      code: 'CONFLICT',
      message: 'The session overlaps another session',
      requestId: 'r-2',
      details: { conflictingSessionId: '0192f1a6-7b3c-7d4e-8f00-1234567890ab' },
    };
    expect(ErrorBody.parse(body)).toEqual(body);
    const validation = {
      code: 'VALIDATION',
      message: 'Invalid request',
      requestId: 'r-3',
      details: { fields: [{ path: 'body.title', message: 'Too long' }] },
    };
    expect(ErrorBody.parse(validation)).toEqual(validation);
  });
});

describe('fieldErrors', () => {
  it('joins the location and the issue path with dots', () => {
    expect(
      fieldErrors('body', [
        { message: 'Required', path: ['commandId'] },
        { message: 'Too long', path: ['notifications', { key: 'creditLow' }] },
        { message: 'Invalid' },
      ]),
    ).toEqual([
      { path: 'body.commandId', message: 'Required' },
      { path: 'body.notifications.creditLow', message: 'Too long' },
      { path: 'body', message: 'Invalid' },
    ]);
  });
});
