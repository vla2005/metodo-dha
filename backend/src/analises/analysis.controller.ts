import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PublicRequest } from '../common/public-session.guard';
import { PublicSessionGuard } from '../common/public-session.guard';
import { AnalysisService } from './analysis.service';

@ApiTags('analysis')
@ApiCookieAuth()
@UseGuards(PublicSessionGuard)
@Controller('journeys/:journeyId/analysis')
export class AnalysisController {
  constructor(private readonly service: AnalysisService) {}

  @Post()
  @ApiOperation({ summary: 'Gera uma única análise final persistida para a jornada' })
  generate(
    @Param('journeyId') journeyId: string,
    @Req() request: PublicRequest,
  ) {
    return this.service.generate(journeyId, request.publicSession!.journeyId);
  }

  @Get()
  @ApiOperation({ summary: 'Retoma a análise final já persistida' })
  get(
    @Param('journeyId') journeyId: string,
    @Req() request: PublicRequest,
  ) {
    return this.service.get(journeyId, request.publicSession!.journeyId);
  }
}
