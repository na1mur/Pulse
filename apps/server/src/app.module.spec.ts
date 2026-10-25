import { Injectable, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';

describe('AppModule', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('boots an Express application from the root module', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();

    await app.init();

    expect(app.getHttpAdapter().getType()).toBe('express');
  });

  // Guards the test toolchain: Nest resolves constructor dependencies from emitted
  // decorator metadata, which every later service test relies on.
  it('injects constructor dependencies by type', async () => {
    @Injectable()
    class Dependency {}

    @Injectable()
    class Dependent {
      constructor(readonly dependency: Dependency) {}
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [Dependency, Dependent],
    }).compile();

    expect(moduleRef.get(Dependent).dependency).toBeInstanceOf(Dependency);
  });
});
