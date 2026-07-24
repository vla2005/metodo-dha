import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiOperationStatus,
  AiOperationType,
  JourneyStatus,
  Movement,
  ReflectiveQuestionType,
  ReflectiveResponseType,
  type AiOperation,
  type ReflectiveQuestionCreateInput,
  isRetryableTransactionError,
  isUniqueViolation,
} from '../database/database.types';
import { createHash, randomUUID } from 'node:crypto';
import { CatalogService } from '../catalogo/catalog.service';
import { ApiError } from '../common/api-error';
import { DatabaseService } from '../database/database.service';
import {
  DHA_STEP_NAMES,
  IaProviderError,
  PROVEDOR_IA,
  persistedQuestionGenerationSchema,
  questionGenerationContextSchema,
  type PerguntasGeradas,
  type ProvedorIa,
  type QuestionGenerationContext,
} from '../ia/provedor-ia';
import { parseInitialInterpretation } from '../ia/initial-interpretation';
import {
  PublicAnswerResponseType,
  type SaveAnswerItemDto,
  type SaveAnswersDto,
} from './dto/save-answers.dto';
import { pacificQuotaDate, QuotaService, type QuotaReservation } from './quota.service';

const STEP_DEFINITIONS = [
  {
    number: 1,
    movement: Movement.CIRCUNSTANCIA_PERCEBIDA,
    name: DHA_STEP_NAMES[0],
    purpose: 'Observar como a circunstÃ¢ncia Ã© percebida no presente, sem concluir causas.',
  },
  {
    number: 2,
    movement: Movement.HISTORIA,
    name: DHA_STEP_NAMES[1],
    purpose: 'Explorar lembranÃ§as ou narrativas que a prÃ³pria pessoa reconheÃ§a como relacionadas.',
  },
  {
    number: 3,
    movement: Movement.CONDICIONAMENTOS,
    name: DHA_STEP_NAMES[2],
    purpose: 'Observar hÃ¡bitos e aprendizados percebidos, sem presumir bloqueios ou traumas.',
  },
  {
    number: 4,
    movement: Movement.CONSCIENCIA,
    name: DHA_STEP_NAMES[3],
    purpose: 'Ampliar a observaÃ§Ã£o do que estÃ¡ presente e do que ainda permanece incerto.',
  },
  {
    number: 5,
    movement: Movement.ESCOLHA_CONSCIENTE,
    name: DHA_STEP_NAMES[4],
    purpose: 'Convidar Ã  reflexÃ£o sobre possibilidades de escolha, sem prescrever uma conduta.',
  },
] as const;

const RESPONSE_TYPE_MAP: Record<PublicAnswerResponseType, ReflectiveResponseType> = {
  [PublicAnswerResponseType.TEXT]: ReflectiveResponseType.TEXT,
  [PublicAnswerResponseType.NO_RELATION]: ReflectiveResponseType.NO_RELATION,
  [PublicAnswerResponseType.DONT_KNOW]: ReflectiveResponseType.DONT_KNOW,
  [PublicAnswerResponseType.PREFER_NOT_TO_ANSWER]: ReflectiveResponseType.PREFER_NOT_TO_ANSWER,
  [PublicAnswerResponseType.SKIPPED]: ReflectiveResponseType.SKIPPED,
};

type NormalizedAnswer = {
  questionId: string;
  responseType: ReflectiveResponseType;
  text: string | null;
};

@Injectable()
export class QuestionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly catalog: CatalogService,
    private readonly quota: QuotaService,
    @Inject(PROVEDOR_IA) private readonly provider: ProvedorIa,
  ) {}

  private get currentPromptVersion(): string {
    return this.config.get<string>('GEMINI_PROMPT_VERSION', 'questions-v2');
  }

  private get currentSchemaVersion(): string {
    return this.config.get<string>('GEMINI_SCHEMA_VERSION', 'questions-v2');
  }

  async generate(publicId: string, sessionJourneyId: string) {
    const journey = await this.authorized(publicId, sessionJourneyId);
    this.assertCardsCompleted(journey);
    const context = this.buildContext(journey);
    const inputHash = createHash('sha256')
      .update(JSON.stringify(context))
      .digest('hex');
    let operation: AiOperation = await this.findOrCreateOperation(journey.id, inputHash);

    if (operation.inputHash !== inputHash) {
      throw new ApiError(
        'QUESTIONS_CONTEXT_CHANGED',
        'O contexto desta geraÃ§Ã£o nÃ£o corresponde mais Ã  sequÃªncia salva.',
        HttpStatus.CONFLICT,
      );
    }
    if (operation.status === AiOperationStatus.COMPLETED) {
      return this.readSnapshot(journey.id);
    }

    operation = await this.repairVersionedInvalidOutput(operation);
    if (operation.status === AiOperationStatus.COMPLETED) {
      return this.readSnapshot(journey.id);
    }

    if (operation.resultJson !== null) {
      const recovered = persistedQuestionGenerationSchema.safeParse(operation.resultJson);
      if (recovered.success && operation.status === AiOperationStatus.PROCESSING && operation.startedAt) {
        await this.quota.completeAttempt(operation.id, operation.startedAt, true);
        await this.persistGenerated(
          journey.id,
          journey.sets,
          operation.id,
          operation.startedAt,
          recovered.data,
        );
        return this.readSnapshot(journey.id);
      }
      await this.database.aiOperation.updateMany({
        where: {
          id: operation.id,
          status: operation.status,
          startedAt: operation.startedAt,
        },
        data: {
          status: AiOperationStatus.INVALID_OUTPUT,
          providerErrorCode: 'INVALID_CACHED_OUTPUT',
          resultJson: null,
          completedAt: new Date(),
        },
      });
      throw new ApiError(
        'AI_OUTPUT_INVALID',
        'As perguntas recebidas nÃ£o puderam ser validadas.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.assertRetryAllowed(operation);
    const attemptStartedAt = await this.claimOperation(operation);
    let reservation: QuotaReservation | null = null;
    const startedAt = Date.now();
    let result: Awaited<ReturnType<ProvedorIa['gerarPerguntas']>>;

    try {
      if (this.provider.usesRemoteQuota) {
        reservation = await this.quota.reserve(
          operation.id,
          attemptStartedAt,
          this.provider.name,
          this.provider.model,
        );
      }
      result = await this.provider.gerarPerguntas(context);
    } catch (error) {
      if (reservation) {
        try {
          await this.quota.complete(reservation, false);
        } catch {
          // A falha original continua sendo a resposta pÃºblica; a reserva fica visÃ­vel para auditoria.
        }
      }
      if (error instanceof IaProviderError) {
        await this.markProviderFailure(operation.id, attemptStartedAt, error);
        throw this.publicProviderError(error);
      }
      if (error instanceof ApiError) {
        await this.markApiFailure(operation.id, attemptStartedAt, error);
      }
      throw error;
    }

    let stored: { count: number };
    try {
      stored = await this.database.aiOperation.updateMany({
        where: {
          id: operation.id,
          status: AiOperationStatus.PROCESSING,
          startedAt: attemptStartedAt,
        },
        data: {
          resultJson: this.json(result.data),
          promptTokens: result.usage.promptTokens,
          outputTokens: result.usage.outputTokens,
          thoughtTokens: result.usage.thoughtTokens,
          totalTokens: result.usage.totalTokens,
          latencyMs: Date.now() - startedAt,
          providerRequestId: result.providerRequestId,
          model: result.model,
          providerErrorCode: null,
        },
      });
    } catch (error) {
      if (reservation) {
        try {
          await this.quota.complete(reservation, true);
        } catch {
          // A reserva permanece rastreÃ¡vel para reconciliaÃ§Ã£o operacional.
        }
      }
      throw error;
    }
    if (reservation) await this.quota.complete(reservation, true);
    if (stored.count !== 1) {
      throw new ApiError(
        'AI_OPERATION_OWNERSHIP_LOST',
        'A tentativa de geraÃ§Ã£o nÃ£o Ã© mais a tentativa ativa.',
        HttpStatus.CONFLICT,
      );
    }
    await this.persistGenerated(
      journey.id,
      journey.sets,
      operation.id,
      attemptStartedAt,
      result.data,
    );
    return this.readSnapshot(journey.id);
  }

  async get(publicId: string, sessionJourneyId: string) {
    const journey = await this.authorized(publicId, sessionJourneyId);
    const availableStatuses: readonly JourneyStatus[] = [
      JourneyStatus.PERGUNTAS_DISPONIVEIS,
      JourneyStatus.RESPOSTAS_CONCLUIDAS,
    ];
    if (!availableStatuses.includes(journey.status)) {
      throw new ApiError(
        'QUESTIONS_NOT_AVAILABLE',
        'As perguntas ainda nÃ£o foram geradas para esta jornada.',
        HttpStatus.CONFLICT,
      );
    }
    return this.readSnapshot(journey.id);
  }

  async saveAnswers(publicId: string, sessionJourneyId: string, dto: SaveAnswersDto) {
    const journey = await this.authorized(publicId, sessionJourneyId);
    const availableStatuses: readonly JourneyStatus[] = [
      JourneyStatus.PERGUNTAS_DISPONIVEIS,
      JourneyStatus.RESPOSTAS_CONCLUIDAS,
    ];
    if (!availableStatuses.includes(journey.status)) {
      throw new ApiError(
        'QUESTIONS_NOT_AVAILABLE',
        'As perguntas ainda nÃ£o estÃ£o disponÃ­veis.',
        HttpStatus.CONFLICT,
      );
    }
    await this.assertAnswersAllowed(journey.id);
    const normalized = this.normalizeAnswers(dto.answers);
    if (new Set(normalized.map((answer) => answer.questionId)).size !== normalized.length) {
      throw new ApiError(
        'DUPLICATE_QUESTION_ANSWER',
        'Cada pergunta pode aparecer apenas uma vez na solicitaÃ§Ã£o.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const questions = await this.database.reflectiveQuestion.findMany({
      where: { journeyId: journey.id },
      select: { id: true },
    });
    const validQuestionIds = new Set(questions.map((question) => question.id));
    if (questions.length === 0 || normalized.some((answer) => !validQuestionIds.has(answer.questionId))) {
      throw new ApiError(
        'QUESTION_NOT_FOUND',
        'Uma das perguntas nÃ£o pertence a esta jornada.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.saveAnswersTransaction(journey.id, normalized, questions.length);
    return this.readSnapshot(journey.id);
  }

  private async findOrCreateOperation(journeyId: string, inputHash: string) {
    const existing = await this.database.aiOperation.findFirst({
      where: { journeyId, type: AiOperationType.QUESTIONS },
    });
    if (existing) return existing;

    try {
      return await this.database.aiOperation.create({
        data: {
          journeyId,
          type: AiOperationType.QUESTIONS,
          idempotencyKey: `journey:${journeyId}:questions`,
          inputHash,
          provider: this.provider.name,
          promptVersion: this.currentPromptVersion,
          schemaVersion: this.currentSchemaVersion,
          model: this.provider.model,
          status: AiOperationStatus.PENDING,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const raced = await this.database.aiOperation.findFirst({
        where: { journeyId, type: AiOperationType.QUESTIONS },
      });
      if (!raced) throw error;
      return raced;
    }
  }

  private async repairVersionedInvalidOutput(operation: AiOperation): Promise<AiOperation> {
    const versionsAreCurrent = operation.promptVersion === this.currentPromptVersion
      && operation.schemaVersion === this.currentSchemaVersion;
    if (operation.status !== AiOperationStatus.INVALID_OUTPUT || versionsAreCurrent) {
      return operation;
    }

    const repaired = await this.database.aiOperation.updateMany({
      where: {
        id: operation.id,
        status: AiOperationStatus.INVALID_OUTPUT,
        promptVersion: operation.promptVersion,
        schemaVersion: operation.schemaVersion,
      },
      data: {
        status: AiOperationStatus.PENDING,
        promptVersion: this.currentPromptVersion,
        schemaVersion: this.currentSchemaVersion,
        startedAt: null,
        completedAt: null,
        resultJson: null,
        providerErrorCode: null,
      },
    });
    if (repaired.count === 1) {
      return {
        ...operation,
        status: AiOperationStatus.PENDING,
        promptVersion: this.currentPromptVersion,
        schemaVersion: this.currentSchemaVersion,
        startedAt: null,
        completedAt: null,
        resultJson: null,
        providerErrorCode: null,
      };
    }

    const current = await this.database.aiOperation.findUnique({ where: { id: operation.id } });
    if (!current) throw new Error('AI_OPERATION_NOT_FOUND');
    return current;
  }

  private assertRetryAllowed(operation: {
    status: AiOperationStatus;
    completedAt: Date | null;
    providerErrorCode: string | null;
    requestCount: number;
  }): void {
    if (operation.status === AiOperationStatus.PROCESSING) {
      throw new ApiError(
        'AI_OPERATION_IN_PROGRESS',
        'As perguntas jÃ¡ estÃ£o sendo preparadas. Aguarde alguns instantes.',
        HttpStatus.CONFLICT,
      );
    }
    if (operation.status === AiOperationStatus.SAFETY_BLOCKED) {
      throw new ApiError(
        'AI_CONTENT_BLOCKED',
        'A geraÃ§Ã£o automÃ¡tica foi interrompida com seguranÃ§a e nÃ£o serÃ¡ repetida nesta jornada.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (operation.status === AiOperationStatus.INVALID_OUTPUT) {
      throw new ApiError(
        'AI_OUTPUT_INVALID',
        'As perguntas recebidas nÃ£o puderam ser validadas e a chamada nÃ£o serÃ¡ repetida automaticamente.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (operation.status === AiOperationStatus.QUOTA_BLOCKED && operation.completedAt) {
      const blockedDate = pacificQuotaDate(operation.completedAt).toISOString();
      if (blockedDate === pacificQuotaDate().toISOString()) {
        throw new ApiError(
          'AI_DAILY_LIMIT_REACHED',
          'O limite diÃ¡rio da IA foi atingido. Sua jornada permanece salva.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    if (operation.status === AiOperationStatus.FAILED) {
      const retryableCodes = new Set(['TIMEOUT', 'UNAVAILABLE']);
      if (!operation.providerErrorCode || !retryableCodes.has(operation.providerErrorCode) || operation.requestCount >= 2) {
        throw new ApiError(
          'AI_TEMPORARILY_UNAVAILABLE',
          'NÃ£o foi possÃ­vel preparar as perguntas nesta jornada sem repetir chamadas adicionais.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }
  }

  private async claimOperation(operation: {
    id: string;
    status: AiOperationStatus;
    startedAt: Date | null;
  }): Promise<Date> {
    if (operation.status === AiOperationStatus.PROCESSING) {
      throw new ApiError(
        'AI_OPERATION_IN_PROGRESS',
        'As perguntas jÃ¡ estÃ£o sendo preparadas. Aguarde alguns instantes.',
        HttpStatus.CONFLICT,
      );
    }

    const startedAt = new Date();
    const claimed = await this.database.aiOperation.updateMany({
      where: {
        id: operation.id,
        status: operation.status,
        startedAt: operation.startedAt,
      },
      data: {
        status: AiOperationStatus.PROCESSING,
        startedAt,
        completedAt: null,
        requestCount: { increment: 1 },
        provider: this.provider.name,
        model: this.provider.model,
        promptVersion: this.currentPromptVersion,
        schemaVersion: this.currentSchemaVersion,
        providerErrorCode: null,
      },
    });
    if (claimed.count !== 1) {
      throw new ApiError(
        'AI_OPERATION_IN_PROGRESS',
        'As perguntas jÃ¡ estÃ£o sendo preparadas. Aguarde alguns instantes.',
        HttpStatus.CONFLICT,
      );
    }
    return startedAt;
  }

  private async persistGenerated(
    journeyId: string,
    sets: Array<{ id: string; position: number }>,
    operationId: string,
    attemptStartedAt: Date,
    generated: PerguntasGeradas,
  ): Promise<void> {
    const questions = this.buildQuestionsForPersistence(journeyId, sets, operationId, generated);

    try {
      await this.database.$transaction(async (transaction) => {
        const operation = await transaction.aiOperation.findFirst({
          where: {
            id: operationId,
            status: AiOperationStatus.PROCESSING,
            startedAt: attemptStartedAt,
          },
          select: { id: true },
        });
        if (!operation) throw new Error('AI_OPERATION_OWNERSHIP_LOST');
        const existing = await transaction.reflectiveQuestion.findMany({
          where: { journeyId },
          select: {
            journeyId: true,
            journeySetId: true,
            aiOperationId: true,
            type: true,
            stepNumber: true,
            displayOrder: true,
            text: true,
          },
          orderBy: { displayOrder: 'asc' },
        });
        if (existing.length === 0) {
          await transaction.reflectiveQuestion.createMany({ data: questions });
        } else if (!this.questionsMatch(existing, questions)) {
          throw new Error('REFLECTIVE_QUESTIONS_INCONSISTENT');
        }
        const completed = await transaction.aiOperation.updateMany({
          where: {
            id: operationId,
            status: AiOperationStatus.PROCESSING,
            startedAt: attemptStartedAt,
          },
          data: {
            status: AiOperationStatus.COMPLETED,
            completedAt: new Date(),
            providerErrorCode: null,
          },
        });
        if (completed.count !== 1) throw new Error('AI_OPERATION_OWNERSHIP_LOST');
        const journeyUpdated = await transaction.journey.updateMany({
          where: { id: journeyId, status: JourneyStatus.CARTAS_CONCLUIDAS },
          data: { status: JourneyStatus.PERGUNTAS_DISPONIVEIS },
        });
        if (journeyUpdated.count !== 1) throw new Error('JOURNEY_STATUS_INCONSISTENT');
        await transaction.auditLog.create({
          data: {
            journeyId,
            action: 'REFLECTIVE_QUESTIONS_CREATED',
            entityType: 'AiOperation',
            entityId: operationId,
            metadata: { questionCount: questions.length, provider: this.provider.name },
          },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      const concurrentCompletion = isUniqueViolation(error) || isRetryableTransactionError(error);
      if (!concurrentCompletion) throw error;
      const [current, persisted] = await Promise.all([
        this.database.aiOperation.findUnique({ where: { id: operationId }, select: { status: true } }),
        this.database.reflectiveQuestion.findMany({
          where: { journeyId },
          select: {
            journeyId: true,
            journeySetId: true,
            aiOperationId: true,
            type: true,
            stepNumber: true,
            displayOrder: true,
            text: true,
          },
          orderBy: { displayOrder: 'asc' },
        }),
      ]);
      if (current?.status !== AiOperationStatus.COMPLETED || !this.questionsMatch(persisted, questions)) {
        throw error;
      }
    }
  }

  private buildQuestionsForPersistence(
    journeyId: string,
    sets: Array<{ id: string; position: number }>,
    operationId: string,
    generated: PerguntasGeradas,
  ): ReflectiveQuestionCreateInput[] {
    const setIds = new Map(sets.map((set) => [set.position, set.id]));
    const interpretation = parseInitialInterpretation(generated);
    const movements = new Map(
      interpretation.movements.map((movement) => [
        movement.stepNumber,
        movement,
      ]),
    );
    let displayOrder = 0;
    const questions: ReflectiveQuestionCreateInput[] = [];
    for (const stage of generated.etapas) {
      const journeySetId = setIds.get(stage.numeroEtapa);
      if (!journeySetId) throw new Error('REFLECTIVE_QUESTION_SET_NOT_FOUND');
      const text = movements.get(stage.numeroEtapa)?.reflectionQuestion;
      if (!text) throw new Error('REFLECTIVE_QUESTION_TEXT_NOT_FOUND');
      questions.push({
        id: randomUUID(),
        journeyId,
        journeySetId,
        aiOperationId: operationId,
        type: ReflectiveQuestionType.STEP,
        stepNumber: stage.numeroEtapa,
        displayOrder: ++displayOrder,
        text,
      });
    }
    if (questions.length !== STEP_DEFINITIONS.length) {
      throw new Error('REFLECTIVE_QUESTION_COUNT_INVALID');
    }
    return questions;
  }

  private questionsMatch(
    stored: Array<{
      journeyId: string;
      journeySetId: string | null;
      aiOperationId: string;
      type: ReflectiveQuestionType;
      stepNumber: number | null;
      displayOrder: number;
      text: string;
    }>,
    expected: ReflectiveQuestionCreateInput[],
  ): boolean {
    return stored.length === expected.length && stored.every((question, index) => {
      const candidate = expected[index];
      return !!candidate
        && question.journeyId === candidate.journeyId
        && question.journeySetId === candidate.journeySetId
        && question.aiOperationId === candidate.aiOperationId
        && question.type === candidate.type
        && question.stepNumber === candidate.stepNumber
        && question.displayOrder === candidate.displayOrder
        && question.text === candidate.text;
    });
  }

  private async readSnapshot(journeyId: string) {
    const operation = await this.database.aiOperation.findFirst({
      where: { journeyId, type: AiOperationType.QUESTIONS },
      include: {
        reflectiveQuestions: {
          orderBy: { displayOrder: 'asc' },
          include: { answer: true },
        },
      },
    });
    if (!operation || operation.status !== AiOperationStatus.COMPLETED || operation.resultJson === null) {
      throw new ApiError(
        'QUESTIONS_NOT_AVAILABLE',
        'As perguntas ainda nÃ£o estÃ£o disponÃ­veis.',
        HttpStatus.CONFLICT,
      );
    }
    const generated = persistedQuestionGenerationSchema.safeParse(operation.resultJson);
    if (!generated.success || operation.reflectiveQuestions.length === 0) {
      throw new ApiError(
        'QUESTIONS_DATA_INVALID',
        'As perguntas salvas nÃ£o puderam ser validadas.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const answeredCount = operation.reflectiveQuestions.filter((question) => question.answer).length;
    const totalCount = operation.reflectiveQuestions.length;
    const answersComplete = totalCount > 0 && answeredCount === totalCount;
    const interpretation = parseInitialInterpretation(generated.data);
    const interpretationByStep = new Map(
      interpretation.movements.map((movement) => [
        movement.stepNumber,
        movement,
      ]),
    );
    const questionIdsByStep = new Map(
      operation.reflectiveQuestions
        .filter((question) => question.stepNumber !== null)
        .map((question) => [question.stepNumber, question.id]),
    );
    return {
      generationStatus: answersComplete ? 'ANSWERS_COMPLETED' as const : 'AVAILABLE' as const,
      generationMode: operation.provider === 'demo' ? 'DEMO' as const : 'GEMINI' as const,
      reflectionSequence: interpretation.sequenceView,
      initialInterpretation: {
        sequenceView: interpretation.sequenceView,
        movements: interpretation.movements.map((movement) => ({
          ...movement,
          questionId: questionIdsByStep.get(movement.stepNumber) ?? null,
        })),
        initialSynthesis: interpretation.initialSynthesis,
        disclaimer: interpretation.disclaimer,
      },
      questions: operation.reflectiveQuestions.map((question) => ({
        id: question.id,
        type: question.type,
        displayOrder: question.displayOrder,
        stepNumber: question.stepNumber,
        stageName: question.stepNumber ? DHA_STEP_NAMES[question.stepNumber - 1] ?? null : null,
        text: question.stepNumber
          ? interpretationByStep.get(question.stepNumber)?.reflectionQuestion
            ?? question.text
          : question.text,
        answer: question.answer ? {
          responseType: question.answer.responseType,
          text: question.answer.text,
        } : null,
      })),
      safety: {
        requiresPause: generated.data.sinalizacaoSeguranca.requerPausa,
        requiresProfessionalReview: generated.data.sinalizacaoSeguranca.requerRevisaoProfissional,
        reason: generated.data.sinalizacaoSeguranca.motivo,
      },
      notice: generated.data.aviso,
      answeredCount,
      totalCount,
      answersComplete,
    };
  }

  private async saveAnswersTransaction(
    journeyId: string,
    answers: NormalizedAnswer[],
    totalQuestions: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.database.$transaction(async (transaction) => {
          const current = await transaction.journey.findUnique({
            where: { id: journeyId },
            select: { status: true },
          });
          if (!current) throw new Error('JOURNEY_NOT_FOUND');
          if (current.status === JourneyStatus.RESPOSTAS_CONCLUIDAS) {
            const existing = await transaction.reflectiveAnswer.findMany({
              where: { journeyId, questionId: { in: answers.map((answer) => answer.questionId) } },
              select: { questionId: true, responseType: true, text: true },
            });
            const isSameRequest = answers.every((answer) => existing.some((stored) =>
              stored.questionId === answer.questionId
              && stored.responseType === answer.responseType
              && stored.text === answer.text));
            if (isSameRequest) return;
            throw new ApiError(
              'ANSWERS_ALREADY_COMPLETED',
              'As respostas desta etapa jÃ¡ foram finalizadas.',
              HttpStatus.CONFLICT,
            );
          }
          if (current.status !== JourneyStatus.PERGUNTAS_DISPONIVEIS) {
            throw new ApiError(
              'QUESTIONS_NOT_AVAILABLE',
              'As perguntas ainda nÃ£o estÃ£o disponÃ­veis.',
              HttpStatus.CONFLICT,
            );
          }

          for (const answer of answers) {
            await transaction.reflectiveAnswer.upsert({
              where: { questionId: answer.questionId },
              create: { journeyId, ...answer },
              update: { responseType: answer.responseType, text: answer.text },
            });
          }
          const answeredCount = await transaction.reflectiveAnswer.count({ where: { journeyId } });
          if (answeredCount === totalQuestions) {
            await transaction.journey.update({
              where: { id: journeyId },
              data: { status: JourneyStatus.RESPOSTAS_CONCLUIDAS },
            });
          }
          await transaction.auditLog.create({
            data: {
              journeyId,
              action: answeredCount === totalQuestions ? 'REFLECTIVE_ANSWERS_COMPLETED' : 'REFLECTIVE_ANSWERS_SAVED',
              entityType: 'Journey',
              entityId: journeyId,
              metadata: { savedCount: answers.length, answeredCount, totalQuestions },
            },
          });
        }, { isolationLevel: 'Serializable' });
        return;
      } catch (error) {
        const retryable = isRetryableTransactionError(error);
        if (!retryable || attempt === 1) throw error;
      }
    }
  }

  private normalizeAnswers(answers: SaveAnswerItemDto[]): NormalizedAnswer[] {
    return answers.map((answer) => {
      const text = answer.text?.trim() ?? '';
      if (answer.responseType === PublicAnswerResponseType.TEXT && !text) {
        throw new ApiError(
          'ANSWER_TEXT_REQUIRED',
          'Escreva uma resposta ou escolha uma das outras opÃ§Ãµes.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (answer.responseType !== PublicAnswerResponseType.TEXT && text) {
        throw new ApiError(
          'ANSWER_TEXT_NOT_ALLOWED',
          'Esta opÃ§Ã£o de resposta nÃ£o aceita texto adicional.',
          HttpStatus.BAD_REQUEST,
        );
      }
      return {
        questionId: answer.questionId,
        responseType: RESPONSE_TYPE_MAP[answer.responseType],
        text: answer.responseType === PublicAnswerResponseType.TEXT ? text : null,
      };
    });
  }

  private async assertAnswersAllowed(journeyId: string): Promise<void> {
    const operation = await this.database.aiOperation.findFirst({
      where: { journeyId, type: AiOperationType.QUESTIONS },
      select: { status: true, resultJson: true },
    });
    if (!operation || operation.status !== AiOperationStatus.COMPLETED || operation.resultJson === null) {
      throw new ApiError(
        'QUESTIONS_NOT_AVAILABLE',
        'As perguntas ainda nÃ£o estÃ£o disponÃ­veis.',
        HttpStatus.CONFLICT,
      );
    }
    const generated = persistedQuestionGenerationSchema.safeParse(operation.resultJson);
    if (!generated.success) {
      throw new ApiError(
        'QUESTIONS_DATA_INVALID',
        'As perguntas salvas nÃ£o puderam ser validadas.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (generated.data.sinalizacaoSeguranca.requerPausa) {
      throw new ApiError(
        'SAFETY_PAUSE_REQUIRED',
        'Esta jornada recomenda uma pausa antes de qualquer nova resposta.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private buildContext(journey: {
    catalogVersion: string;
    themeKey: string;
    customTheme: string | null;
    circumstanceText: string;
    sets: Array<{
      position: number;
      movement: Movement;
      wordKey: string | null;
      imageKey: string | null;
      initialImpression: string | null;
    }>;
  }): QuestionGenerationContext {
    const theme = journey.themeKey === 'personalizado'
      ? journey.customTheme
      : this.catalog.getTheme(journey.themeKey)?.nome;
    if (!theme) throw new Error('JOURNEY_THEME_NOT_FOUND');
    const sets = new Map(journey.sets.map((set) => [set.position, set]));
    return questionGenerationContextSchema.parse({
      theme,
      initialNarrative: journey.circumstanceText,
      catalogVersion: journey.catalogVersion,
      steps: STEP_DEFINITIONS.map((definition) => {
        const set = sets.get(definition.number);
        const word = this.catalog.getWord(set?.wordKey ?? null);
        const image = this.catalog.getImage(set?.imageKey ?? null);
        if (!set || set.movement !== definition.movement || !word || !image) {
          throw new Error('JOURNEY_SET_CATALOG_REFERENCE_INVALID');
        }
        return {
          number: definition.number,
          name: definition.name,
          purpose: definition.purpose,
          word: word.texto,
          imageDescription: image.descricao_imagem,
          initialImpression: set.initialImpression,
        };
      }),
    });
  }

  private assertCardsCompleted(journey: {
    status: JourneyStatus;
    currentStep: number;
    sets: Array<{ position: number; movement: Movement; wordKey: string | null; imageKey: string | null }>;
  }): void {
    const allowed: readonly JourneyStatus[] = [
      JourneyStatus.CARTAS_CONCLUIDAS,
      JourneyStatus.PERGUNTAS_DISPONIVEIS,
      JourneyStatus.RESPOSTAS_CONCLUIDAS,
    ];
    const complete = journey.currentStep === 5
      && journey.sets.length === 5
      && STEP_DEFINITIONS.every((definition) => {
        const set = journey.sets.find((item) => item.position === definition.number);
        return set?.movement === definition.movement && !!set.wordKey && !!set.imageKey;
      });
    if (!allowed.includes(journey.status) || !complete) {
      throw new ApiError(
        'CARDS_NOT_COMPLETED',
        'Conclua os cinco movimentos antes de gerar as perguntas.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async authorized(publicId: string, sessionJourneyId: string) {
    const journey = await this.database.journey.findFirst({
      where: { publicId, id: sessionJourneyId },
      include: { sets: { orderBy: { position: 'asc' } } },
    });
    if (!journey) {
      throw new ApiError('FORBIDDEN_RESOURCE', 'Jornada nÃ£o encontrada.', HttpStatus.NOT_FOUND);
    }
    if (journey.catalogVersion !== this.catalog.version) {
      throw new ApiError(
        'CATALOG_VERSION_UNAVAILABLE',
        'A versÃ£o do catÃ¡logo desta jornada nÃ£o estÃ¡ disponÃ­vel.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return journey;
  }

  private async markProviderFailure(
    operationId: string,
    attemptStartedAt: Date,
    error: IaProviderError,
  ): Promise<void> {
    const status = error.code === 'QUOTA_EXHAUSTED'
      ? AiOperationStatus.QUOTA_BLOCKED
      : error.code === 'SAFETY_BLOCKED'
        ? AiOperationStatus.SAFETY_BLOCKED
        : error.code === 'INVALID_OUTPUT'
          ? AiOperationStatus.INVALID_OUTPUT
          : AiOperationStatus.FAILED;
    await this.database.aiOperation.updateMany({
      where: {
        id: operationId,
        status: AiOperationStatus.PROCESSING,
        startedAt: attemptStartedAt,
      },
      data: {
        status,
        providerErrorCode: this.providerFailureCode(error),
        completedAt: new Date(),
      },
    });
  }

  private providerFailureCode(error: IaProviderError): string {
    if (error.code !== 'INVALID_OUTPUT') return error.code;
    const diagnosticCode = (error as IaProviderError & { diagnosticCode?: unknown }).diagnosticCode;
    if (typeof diagnosticCode !== 'string') return error.code;
    const normalized = diagnosticCode.trim().toUpperCase();
    return /^[A-Z][A-Z0-9_]{0,64}$/.test(normalized)
      ? `INVALID_OUTPUT_${normalized}`
      : error.code;
  }

  private async markApiFailure(
    operationId: string,
    attemptStartedAt: Date,
    error: ApiError,
  ): Promise<void> {
    await this.database.aiOperation.updateMany({
      where: {
        id: operationId,
        status: AiOperationStatus.PROCESSING,
        startedAt: attemptStartedAt,
      },
      data: {
        status: error.code === 'AI_DAILY_LIMIT_REACHED'
          ? AiOperationStatus.QUOTA_BLOCKED
          : AiOperationStatus.FAILED,
        providerErrorCode: error.code,
        completedAt: new Date(),
      },
    });
  }

  private publicProviderError(error: IaProviderError): ApiError {
    if (error.code === 'NOT_CONFIGURED') {
      return new ApiError('AI_NOT_CONFIGURED', 'A geraÃ§Ã£o de perguntas nÃ£o estÃ¡ configurada.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (error.code === 'QUOTA_EXHAUSTED') {
      return new ApiError('AI_DAILY_LIMIT_REACHED', 'O limite da IA foi atingido. Sua jornada permanece salva.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error.code === 'SAFETY_BLOCKED') {
      return new ApiError('AI_CONTENT_BLOCKED', 'A geraÃ§Ã£o automÃ¡tica foi interrompida com seguranÃ§a.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (error.code === 'INVALID_OUTPUT') {
      return new ApiError('AI_OUTPUT_INVALID', 'As perguntas recebidas nÃ£o puderam ser validadas.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return new ApiError('AI_TEMPORARILY_UNAVAILABLE', 'NÃ£o foi possÃ­vel preparar as perguntas agora.', HttpStatus.SERVICE_UNAVAILABLE);
  }

  private json(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value)) as unknown;
  }
}

