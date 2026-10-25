// QA T0.4 (docs/qa/T0.4.md, bug 1): body-parser failures are client errors, so they must leave
// the server as VALIDATION in the spec 7.1 error shape, never as INTERNAL. A client that sees
// INTERNAL treats the command as a server fault and retries it instead of raising a sync issue
// (R-36), and the server logs every such request as an unhandled error.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorBody, REQUEST_ID_HEADER, SERVER_TIME_HEADER } from '@pulse/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

async function expectValidation(response: Response): Promise<void> {
  expect(response.headers.get(SERVER_TIME_HEADER)).not.toBeNull();
  const body = ErrorBody.parse(await response.json());
  expect(body.requestId).toBe(response.headers.get(REQUEST_ID_HEADER));
  expect({ status: response.status, code: body.code }).toEqual({ status: 400, code: 'VALIDATION' });
}

describe('body-parser errors map to VALIDATION (spec 7.1)', () => {
  it('answers a JSON body over the size limit with VALIDATION, not INTERNAL', async () => {
    const response = await fetch(`${baseUrl}/v1/timer/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x'.repeat(200_000) }),
    });
    await expectValidation(response);
  });

  it('answers an unsupported content encoding with VALIDATION, not INTERNAL', async () => {
    const response = await fetch(`${baseUrl}/v1/timer/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-encoding': 'unknown' },
      body: '{}',
    });
    await expectValidation(response);
  });
});
