import { Global, Module } from '@nestjs/common';
import { RevisionService } from './revision.service.js';

/** Provides the per-user revision counter (R-35) to every module that changes data. */
@Global()
@Module({ providers: [RevisionService], exports: [RevisionService] })
export class RevisionModule {}
