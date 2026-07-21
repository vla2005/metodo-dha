import { Module } from '@nestjs/common';
import { PublicSessionGuard } from '../common/public-session.guard';
import { IaModule } from '../ia/ia.module';
import { QuotaService } from '../perguntas/quota.service';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

@Module({
  imports: [IaModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, QuotaService, PublicSessionGuard],
})
export class AnalysisModule {}
