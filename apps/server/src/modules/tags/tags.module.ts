import { Module } from '@nestjs/common';
import { TagsRepository } from './tags.repository.js';

/** Tags: the repository so far (auth creates the starter tags); the tag operations land in T2.x. */
@Module({ providers: [TagsRepository], exports: [TagsRepository] })
export class TagsModule {}
