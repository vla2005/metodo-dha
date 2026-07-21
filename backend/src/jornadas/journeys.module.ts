import { Module } from '@nestjs/common';
import { PublicSessionGuard } from '../common/public-session.guard';
import { JourneysController } from './journeys.controller';
import { JourneysService } from './journeys.service';
@Module({ controllers: [JourneysController], providers: [JourneysService, PublicSessionGuard] })
export class JourneysModule {}

