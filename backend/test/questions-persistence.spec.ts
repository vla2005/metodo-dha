import { ConfigService } from '@nestjs/config';
import {
  AiOperationStatus,
  ReflectiveQuestionType,
  type ReflectiveQuestionCreateInput,
} from '../src/database/database.types';
import { CatalogService } from '../src/catalogo/catalog.service';
import { DatabaseService } from '../src/database/database.service';
import {
  DHA_STEP_NAMES,
  type PerguntasGeradas,
  type ProvedorIa,
} from '../src/ia/provedor-ia';
import { QuestionsService } from '../src/perguntas/questions.service';
import { QuotaService } from '../src/perguntas/quota.service';

type BuildQuestionsForPersistence = {
  buildQuestionsForPersistence(
    journeyId: string,
    sets: Array<{ id: string; position: number }>,
    operationId: string,
    generated: PerguntasGeradas,
  ): ReflectiveQuestionCreateInput[];
};

type QuestionsSnapshot = {
  questions: Array<{ type: ReflectiveQuestionType; text: string }>;
  totalCount: number;
  answeredCount: number;
  answersComplete: boolean;
};

type ReadSnapshot = {
  readSnapshot(journeyId: string): Promise<QuestionsSnapshot>;
};

const generatedResult = (questionsPerStep: number, integrativeCount: number): PerguntasGeradas => ({
  reflexaoSequencia: 'Uma reflexÃ£o possÃ­vel sobre a sequÃªncia completa.',
  etapas: DHA_STEP_NAMES.map((name, index) => ({
    numeroEtapa: (index + 1) as 1 | 2 | 3 | 4 | 5,
    nomeEtapa: name,
    perguntas: Array.from(
      { length: questionsPerStep },
      (_, questionIndex) => `Pergunta ${questionIndex + 1} da etapa ${index + 1}?`,
    ),
  })),
  perguntasIntegradoras: Array.from(
    { length: integrativeCount },
    (_, index) => `Pergunta integradora ${index + 1}?`,
  ),
  sinalizacaoSeguranca: {
    requerPausa: false,
    requerRevisaoProfissional: false,
    motivo: '',
  },
  aviso: 'Este conteÃºdo Ã© reflexivo e nÃ£o substitui acompanhamento profissional.',
});

const provider = {
  name: 'gemini',
  usesRemoteQuota: true,
  model: 'gemini-test',
} as ProvedorIa;

const createService = (database: DatabaseService): QuestionsService => new QuestionsService(
  database,
  new ConfigService(),
  {} as CatalogService,
  {} as QuotaService,
  provider,
);

describe('persistÃªncia das perguntas reflexivas', () => {
  it('normaliza uma saÃ­da com perguntas extras para exatamente uma STEP por movimento', () => {
    const service = createService({} as DatabaseService);
    const questions = (service as unknown as BuildQuestionsForPersistence)
      .buildQuestionsForPersistence(
        'journey-id',
        DHA_STEP_NAMES.map((_, index) => ({ id: `set-${index + 1}`, position: index + 1 })),
        'operation-id',
        generatedResult(2, 2),
      );

    expect(questions).toHaveLength(5);
    expect(questions.map((question) => ({
      type: question.type,
      stepNumber: question.stepNumber,
      displayOrder: question.displayOrder,
      journeySetId: question.journeySetId,
      text: question.text,
    }))).toEqual(DHA_STEP_NAMES.map((_, index) => ({
      type: ReflectiveQuestionType.STEP,
      stepNumber: index + 1,
      displayOrder: index + 1,
      journeySetId: `set-${index + 1}`,
      text: `Pergunta 1 da etapa ${index + 1}?`,
    })));
    expect(questions.some((question) => question.type === ReflectiveQuestionType.INTEGRATIVE))
      .toBe(false);
  });

  it('mantÃ©m perguntas extras jÃ¡ persistidas em uma jornada legada', async () => {
    const legacyResult = generatedResult(2, 2);
    const reflectiveQuestions = [
      ...legacyResult.etapas.flatMap((stage) => stage.perguntas.map((text) => ({
        id: `question-${stage.numeroEtapa}-${text}`,
        type: ReflectiveQuestionType.STEP,
        displayOrder: 0,
        stepNumber: stage.numeroEtapa,
        text,
        answer: null,
      }))),
      ...legacyResult.perguntasIntegradoras.map((text) => ({
        id: `question-integrative-${text}`,
        type: ReflectiveQuestionType.INTEGRATIVE,
        displayOrder: 0,
        stepNumber: null,
        text,
        answer: null,
      })),
    ].map((question, index) => ({ ...question, displayOrder: index + 1 }));
    const findFirst = jest.fn().mockResolvedValue({
      status: AiOperationStatus.COMPLETED,
      provider: 'gemini',
      resultJson: legacyResult,
      reflectiveQuestions,
    });
    const service = createService({ aiOperation: { findFirst } } as unknown as DatabaseService);

    const snapshot = await (service as unknown as ReadSnapshot).readSnapshot('journey-id');

    expect(snapshot.totalCount).toBe(12);
    expect(snapshot.questions).toHaveLength(12);
    expect(snapshot.questions.filter((question) => question.type === ReflectiveQuestionType.INTEGRATIVE))
      .toHaveLength(2);
    expect(snapshot.answeredCount).toBe(0);
    expect(snapshot.answersComplete).toBe(false);
  });
});



