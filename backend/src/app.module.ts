import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AnalysisModule } from './analises/analysis.module';
import { validateEnvironment } from './config/environment';
import { CatalogModule } from './catalogo/catalog.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { JourneysModule } from './jornadas/journeys.module';
import { QuestionsModule } from './perguntas/questions.module';
import { ThemesModule } from './temas/themes.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    CatalogModule,
    DatabaseModule,
    HealthModule,
    ThemesModule,
    JourneysModule,
    QuestionsModule,
    AnalysisModule
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class AppModule {}
