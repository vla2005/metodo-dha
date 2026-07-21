import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PublicRequest } from '../common/public-session.guard';
import { PublicSessionGuard } from '../common/public-session.guard';
import { SaveAnswersDto } from './dto/save-answers.dto';
import { QuestionsService } from './questions.service';

@ApiTags('questions')
@ApiCookieAuth()
@UseGuards(PublicSessionGuard)
@Controller('journeys/:publicId')
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  @Post('questions/generate')
  @ApiOperation({ summary: 'Gera uma única sequência persistida de perguntas reflexivas' })
  generate(@Param('publicId') publicId: string, @Req() request: PublicRequest) {
    return this.service.generate(publicId, request.publicSession!.journeyId);
  }

  @Get('questions')
  @ApiOperation({ summary: 'Retoma as perguntas e respostas já persistidas' })
  get(@Param('publicId') publicId: string, @Req() request: PublicRequest) {
    return this.service.get(publicId, request.publicSession!.journeyId);
  }

  @Put('answers')
  @ApiOperation({ summary: 'Salva respostas reflexivas sem apagar respostas omitidas' })
  saveAnswers(
    @Param('publicId') publicId: string,
    @Req() request: PublicRequest,
    @Body() dto: SaveAnswersDto,
  ) {
    return this.service.saveAnswers(publicId, request.publicSession!.journeyId, dto);
  }
}
