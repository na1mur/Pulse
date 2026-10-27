import { Module } from '@nestjs/common';
import { PreferencesRepository } from './preferences.repository.js';

/** Preferences: the repository so far (auth creates the row); the operations land in T1.x. */
@Module({ providers: [PreferencesRepository], exports: [PreferencesRepository] })
export class PreferencesModule {}
