import { ConfigService } from '@nestjs/config';
import { AiOperationStatus } from '../src/database/database.types';
import { CatalogService } from '../src/catalogo/catalog.service';
import { DatabaseService } from '../src/database/database.service';
import type { ProvedorIa } from '../src/ia/provedor-ia';
import { QuestionsService } from '../src/perguntas/questions.service';
import { QuotaService } from '../src/perguntas/quota.service';

type RetryPolicyInput = {
  status: AiOperationStatus;
  completedAt: Date | null;
  providerErrorCode: string | null;
  requestCount: number;
};

describe('polÃ­tica de repetiÃ§Ã£o da geraÃ§Ã£o', () => {
  const service = new QuestionsService(
    {} as DatabaseService,
    new ConfigService(),
    {} as CatalogService,
    {} as QuotaService,
    {} as ProvedorIa,
  );
  const assertRetryAllowed = (operation: RetryPolicyInput): void => {
    (service as unknown as { assertRetryAllowed(value: RetryPolicyInput): void })
      .assertRetryAllowed(operation);
  };
  const thrownCode = (operation: RetryPolicyInput): string | null => {
    try {
      assertRetryAllowed(operation);
      return null;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        return typeof code === 'string' ? code : null;
      }
      return null;
    }
  };

  it.each([
    [AiOperationStatus.PROCESSING, 'AI_OPERATION_IN_PROGRESS'],
    [AiOperationStatus.SAFETY_BLOCKED, 'AI_CONTENT_BLOCKED'],
    [AiOperationStatus.INVALID_OUTPUT, 'AI_OUTPUT_INVALID'],
  ] as const)('trata %s como estado terminal sem nova chamada', (status, code) => {
    expect(thrownCode({
      status,
      completedAt: new Date(),
      providerErrorCode: null,
      requestCount: 1,
    })).toBe(code);
  });

  it('permite somente uma repetiÃ§Ã£o explÃ­cita para indisponibilidade transitÃ³ria', () => {
    expect(() => assertRetryAllowed({
      status: AiOperationStatus.FAILED,
      completedAt: new Date(),
      providerErrorCode: 'TIMEOUT',
      requestCount: 1,
    })).not.toThrow();
    expect(thrownCode({
      status: AiOperationStatus.FAILED,
      completedAt: new Date(),
      providerErrorCode: 'TIMEOUT',
      requestCount: 2,
    })).toBe('AI_TEMPORARILY_UNAVAILABLE');
  });

  it('nÃ£o repete uma operaÃ§Ã£o bloqueada pela cota no mesmo dia do PacÃ­fico', () => {
    expect(thrownCode({
      status: AiOperationStatus.QUOTA_BLOCKED,
      completedAt: new Date(),
      providerErrorCode: 'AI_DAILY_LIMIT_REACHED',
      requestCount: 1,
    })).toBe('AI_DAILY_LIMIT_REACHED');
  });
});


