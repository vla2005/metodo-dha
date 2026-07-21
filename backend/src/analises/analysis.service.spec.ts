import { ConfigService } from '@nestjs/config';
import {
  AiOperationStatus,
  JourneyStatus,
  Movement,
  ReflectiveQuestionType,
  ReflectiveResponseType,
} from '../database/database.types';
import { CatalogService } from '../catalogo/catalog.service';
import { DatabaseService } from '../database/database.service';
import {
  analysisGenerationContextSchema,
  type AnalysisGenerationContext,
  type ProvedorIa,
} from '../ia/provedor-ia';
import { QuotaService } from '../perguntas/quota.service';
import { AnalysisService } from './analysis.service';

type RetryPolicyInput = {
  status: AiOperationStatus;
  completedAt: Date | null;
  providerErrorCode: string | null;
  requestCount: number;
};

describe('AnalysisService', () => {
  const catalog = {
    version: 'dha-2026-v1',
    getTheme: (key: string) => key === 'relacionamentos'
      ? { nome: 'Relacionamentos' }
      : undefined,
    getWord: (key: string | null) => key
      ? { texto: `Palavra ${key.slice(-1)}` }
      : undefined,
    getImage: (key: string | null) => key
      ? { descricao_imagem: `DescriÃ§Ã£o objetiva suficientemente detalhada da imagem ${key.slice(-1)}.` }
      : undefined,
  } as CatalogService;
  const service = new AnalysisService(
    {} as DatabaseService,
    new ConfigService(),
    catalog,
    {} as QuotaService,
    {} as ProvedorIa,
  );

  const assertRetryAllowed = (operation: RetryPolicyInput): void => {
    (service as unknown as {
      assertRetryAllowed(value: RetryPolicyInput): void;
    }).assertRetryAllowed(operation);
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

  it('permite no mÃ¡ximo uma repetiÃ§Ã£o para falha transitÃ³ria', () => {
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

  it('constrÃ³i o contexto completo preservando perguntas legadas e integrativas', () => {
    const movements = [
      Movement.CIRCUNSTANCIA_PERCEBIDA,
      Movement.HISTORIA,
      Movement.CONDICIONAMENTOS,
      Movement.CONSCIENCIA,
      Movement.ESCOLHA_CONSCIENTE,
    ] as const;
    let displayOrder = 0;
    const stepQuestions = movements.flatMap((_, index) => {
      const count = index === 0 ? 2 : 1;
      return Array.from({ length: count }, (_, questionIndex) => ({
        id: `question-step-${index + 1}-${questionIndex + 1}`,
        type: ReflectiveQuestionType.STEP,
        stepNumber: index + 1,
        displayOrder: ++displayOrder,
        text: `Pergunta ${questionIndex + 1} da etapa ${index + 1}?`,
        answer: {
          responseType: questionIndex === 0
            ? ReflectiveResponseType.TEXT
            : ReflectiveResponseType.DONT_KNOW,
          text: questionIndex === 0 ? `Resposta da etapa ${index + 1}.` : null,
        },
      }));
    });
    const integrativeQuestions = [1, 2].map((number) => ({
      id: `question-integrative-${number}`,
      type: ReflectiveQuestionType.INTEGRATIVE,
      stepNumber: null,
      displayOrder: ++displayOrder,
      text: `Pergunta integrativa ${number}?`,
      answer: {
        responseType: ReflectiveResponseType.NO_RELATION,
        text: null,
      },
    }));
    const journey = {
      id: 'journey-id',
      publicId: 'journey-public-id',
      status: JourneyStatus.RESPOSTAS_CONCLUIDAS,
      currentStep: 5,
      catalogVersion: 'dha-2026-v1',
      themeKey: 'relacionamentos',
      customTheme: null,
      circumstanceText: 'Quero observar uma circunstÃ¢ncia importante com mais calma.',
      sets: movements.map((movement, index) => ({
        id: `set-${index + 1}`,
        position: index + 1,
        movement,
        wordKey: `palavra-00${index + 1}`,
        imageKey: `imagem-00${index + 1}`,
        initialImpression: index === 0 ? 'Uma impressÃ£o inicial opcional.' : null,
      })),
      reflectiveQuestions: [...stepQuestions, ...integrativeQuestions],
    };
    const context = (service as unknown as {
      buildContext(value: typeof journey): AnalysisGenerationContext;
    }).buildContext(journey);

    expect(analysisGenerationContextSchema.parse(context)).toEqual(context);
    expect(context.steps).toHaveLength(5);
    expect(context.steps[0]?.questions).toHaveLength(2);
    expect(context.steps[0]?.questions[0]).toMatchObject({
      displayOrder: 1,
      responseType: ReflectiveResponseType.TEXT,
      answer: 'Resposta da etapa 1.',
    });
    expect(context.steps[0]?.questions[1]).toMatchObject({
      responseType: ReflectiveResponseType.DONT_KNOW,
      answer: null,
    });
    expect(context.integrativeQuestions).toHaveLength(2);
    expect(context.integrativeQuestions[0]?.responseType)
      .toBe(ReflectiveResponseType.NO_RELATION);
  });
});


