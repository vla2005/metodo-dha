import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { ApiError } from './api-error';
import { hashToken } from './session';

export interface PublicRequest extends Request { publicSession?: { id: string; journeyId: string } }
@Injectable()
export class PublicSessionGuard implements CanActivate {
  constructor(private readonly database: DatabaseService, private readonly config: ConfigService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PublicRequest>();
    const token = request.cookies?.[this.config.get<string>('PUBLIC_SESSION_COOKIE_NAME', 'dha_session')] as string | undefined;
    if (!token) throw new ApiError('PUBLIC_SESSION_REQUIRED', 'Sessão pública necessária.', HttpStatus.UNAUTHORIZED);
    const session = await this.database.publicAccessSession.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ApiError('PUBLIC_SESSION_EXPIRED', 'A sessão expirou ou não é válida.', HttpStatus.UNAUTHORIZED);
    request.publicSession = { id: session.id, journeyId: session.journeyId };
    await this.database.publicAccessSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return true;
  }
}
