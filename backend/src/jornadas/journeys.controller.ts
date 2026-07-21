import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { PublicRequest } from '../common/public-session.guard';
import { PublicSessionGuard } from '../common/public-session.guard';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { ImpressionDto } from './dto/impression.dto';
import { JourneysService } from './journeys.service';

@ApiTags('journeys')
@Controller('journeys')
export class JourneysController {
  constructor(private readonly service: JourneysService, private readonly config: ConfigService) {}

  private sessionCookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<string>('PUBLIC_SESSION_COOKIE_SECURE', 'false') === 'true',
      sameSite: this.config.get<'lax' | 'strict' | 'none'>('PUBLIC_SESSION_COOKIE_SAME_SITE', 'lax'),
      path: '/',
    } as const;
  }

  @Post() @ApiOperation({ summary: 'Cria jornada e sessão pública sem login' })
  async create(@Body() dto: CreateJourneyDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.service.create(dto);
    const ttlHours = this.config.get<number>('PUBLIC_SESSION_TTL_HOURS', 72);
    response.cookie(this.config.get<string>('PUBLIC_SESSION_COOKIE_NAME', 'dha_session'), result.token, {
      ...this.sessionCookieOptions(),
      maxAge: ttlHours * 60 * 60 * 1000,
    });
    return result.journey;
  }
  @Get('session/current') @UseGuards(PublicSessionGuard) @ApiCookieAuth() current(@Req() req: PublicRequest) { return this.service.getCurrent(req.publicSession!.journeyId); }
  @Delete(':publicId/session') @UseGuards(PublicSessionGuard) @ApiCookieAuth()
  async cancel(@Param('publicId') publicId: string, @Req() req: PublicRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.service.cancel(publicId, req.publicSession!.journeyId);
    response.clearCookie(
      this.config.get<string>('PUBLIC_SESSION_COOKIE_NAME', 'dha_session'),
      this.sessionCookieOptions(),
    );
    return result;
  }
  @Get(':publicId') @UseGuards(PublicSessionGuard) @ApiCookieAuth() get(@Param('publicId') publicId: string, @Req() req: PublicRequest) { return this.service.get(publicId, req.publicSession!.journeyId); }
  @Get(':publicId/progress') @UseGuards(PublicSessionGuard) @ApiCookieAuth() progress(@Param('publicId') publicId: string, @Req() req: PublicRequest) { return this.service.get(publicId, req.publicSession!.journeyId); }
  @Post(':publicId/sets/:position/draw-word') @UseGuards(PublicSessionGuard) @ApiCookieAuth() drawWord(@Param('publicId') publicId: string, @Param('position', ParseIntPipe) position: number, @Req() req: PublicRequest) { return this.service.drawWord(publicId, req.publicSession!.journeyId, position); }
  @Post(':publicId/sets/:position/draw-image') @UseGuards(PublicSessionGuard) @ApiCookieAuth() drawImage(@Param('publicId') publicId: string, @Param('position', ParseIntPipe) position: number, @Req() req: PublicRequest) { return this.service.drawImage(publicId, req.publicSession!.journeyId, position); }
  @Get(':publicId/sets/:position/image') @UseGuards(PublicSessionGuard) @ApiCookieAuth()
  async image(@Param('publicId') publicId: string, @Param('position', ParseIntPipe) position: number, @Req() req: PublicRequest, @Res({ passthrough: true }) response: Response) {
    const image = await this.service.getRevealedImage(publicId, req.publicSession!.journeyId, position);
    response.setHeader('Content-Type', image.contentType);
    response.setHeader('Content-Length', image.content.length);
    response.setHeader('Content-Disposition', 'inline; filename="carta.webp"');
    response.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.setHeader('Vary', 'Cookie, Origin');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    return new StreamableFile(image.content);
  }
  @Patch(':publicId/sets/:position/impression') @UseGuards(PublicSessionGuard) @ApiCookieAuth() impression(@Param('publicId') publicId: string, @Param('position', ParseIntPipe) position: number, @Body() dto: ImpressionDto, @Req() req: PublicRequest) { return this.service.saveImpression(publicId, req.publicSession!.journeyId, position, dto.text); }
  @Post(':publicId/advance') @UseGuards(PublicSessionGuard) @ApiCookieAuth() advance(@Param('publicId') publicId: string, @Req() req: PublicRequest) { return this.service.advance(publicId, req.publicSession!.journeyId); }
}
