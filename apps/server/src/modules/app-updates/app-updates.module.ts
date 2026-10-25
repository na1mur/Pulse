import { Module } from '@nestjs/common';
import { AppUpdatesController } from './app-updates.controller.js';
import { AppUpdatesService } from './app-updates.service.js';

@Module({ controllers: [AppUpdatesController], providers: [AppUpdatesService] })
export class AppUpdatesModule {}
