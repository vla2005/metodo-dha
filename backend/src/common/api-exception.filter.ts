import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

const PUBLIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const correlationId = randomUUID();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const body = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const code = this.publicCode(body.code, status);
    const safeLogEntry = { correlationId, status, code };

    if (status >= 500) {
      this.logger.error(safeLogEntry);
    } else {
      this.logger.warn(safeLogEntry);
    }

    response.status(status).json({
      code,
      message: body.message ?? (status === 500 ? 'Não foi possível concluir a solicitação.' : typeof raw === 'string' ? raw : 'Solicitação inválida.'),
      correlationId,
      details: body.details ?? null
    });
  }

  private publicCode(candidate: unknown, status: number): string {
    if (typeof candidate === 'string' && PUBLIC_CODE_PATTERN.test(candidate)) return candidate;
    return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
}
