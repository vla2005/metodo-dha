import { Module } from '@nestjs/common';
import { PublicSessionGuard } from '../common/public-session.guard';
import { IaModule } from '../ia/ia.module';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { QuotaService } from './quota.service';

@Module({
  imports: [IaModule],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuotaService, PublicSessionGuard],
})
export class QuestionsModule {}
