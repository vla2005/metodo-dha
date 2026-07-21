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
  isRetryableTransactionError,
  isUniqueViolation,
} from '../database/database.types';
import { createHash } from 'node:crypto';
import { CatalogService } from '../catalogo/catalog.service';
import { ApiError } from '../common/api-error';
import { DatabaseService } from '../database/database.service';
import {
  DHA_STEP_NAMES,
  IaProviderError,
  PROVEDOR_IA,
  analysisGenerationContextSchema,
  analysisGenerationSchema,
  type AnaliseGerada,
  type AnalysisGenerationContext,
  type ProvedorIa,
} from '../ia/provedor-ia';
import { pacificQuotaDate, QuotaService, type QuotaReservation } from '../perguntas/quota.service';

const ANALYSIS_PROMPT_VERSION = 'analysis-v2';
const ANALYSIS_SCHEMA_VERSION = 'analysis-v2';

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

type AnalysisJourney = {
  id: string;
  publicId: string;
  status: JourneyStatus;
  currentStep: number;
  catalogVersion: string;
  themeKey: string;
  customTheme: string | null;
  circumstanceText: string;
  sets: Array<{
    id: string;
    position: number;
    movement: Movement;
    wordKey: string | null;
    imageKey: string | null;
    initialImpression: string | null;
  }>;
  reflectiveQuestions: Array<{
    id: string;
    type: ReflectiveQuestionType;
    stepNumber: number | null;
    displayOrder: number;
    text: string;
    answer: {
      responseType: ReflectiveResponseType;
      text: string | null;
    } | null;
  }>;
};

type RetryPolicyInput = {
  status: AiOperationStatus;
  completedAt: Date | null;
  providerErrorCode: string | null;
  requestCount: number;
};

@Injectable()
export class AnalysisService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly catalog: CatalogService,
    private readonly quota: QuotaService,
    @Inject(PROVEDOR_IA) private readonly provider: ProvedorIa,
  ) {}

  async generate(publicId: string, sessionJourneyId: string) {
    const journey = await this.authorized(publicId, sessionJourneyId);
    this.assertReady(journey);
    const context = this.buildContext(journey);
    const inputHash = createHash('sha256')
      .update(JSON.stringify(context))
      .digest('hex');
    let operation: AiOperation = await this.findOrCreateOperation(journey.id, inputHash);

    if (operation.inputHash !== inputHash) {
      throw new ApiError(
        'ANALYSIS_CONTEXT_CHANGED',
        'O contexto da anÃ¡lise nÃ£o corresponde mais Ã s respostas salvas.',
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
      const recovered = analysisGenerationSchema.safeParse(operation.resultJson);
      if (
        recovered.success
        && operation.status === AiOperationStatus.PROCESSING
        && operation.startedAt
      ) {
        await this.quota.completeAttempt(operation.id, operation.startedAt, true);
        await this.persistCompleted(journey.id, operation.id, operation.startedAt);
        return this.readSnapshot(journey.id);
      }
      await this.invalidateCachedResult(operation);
      throw new ApiError(
        'AI_OUTPUT_INVALID',
        'A anÃ¡lise recebida nÃ£o pÃ´de ser validada.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.assertRetryAllowed(operation);
    const attemptStartedAt = await this.claimOperation(operation);
    let reservation: QuotaReservation | null = null;
    const startedAt = Date.now();
    let result: Awaited<ReturnType<ProvedorIa['gerarAnalise']>>;

    try {
      if (this.provider.usesRemoteQuota) {
        reservation = await this.quota.reserve(
          operation.id,
          attemptStartedAt,
          this.provider.name,
          this.provider.model,
        );
      }
      const providerResult = await this.provider.gerarAnalise(context);
      const validated = analysisGenerationSchema.safeParse(providerResult.data);
      if (!validated.success) {
        throw new IaProviderError('INVALID_OUTPUT', false, 'SCHEMA_VALIDATION');
      }
      result = { ...providerResult, data: validated.data };
    } catch (error) {
      if (reservation) {
        try {
          await this.quota.complete(reservation, false);
        } catch {
          // A reserva permanece rastreÃ¡vel para reconciliaÃ§Ã£o operacional.
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
        'A tentativa de anÃ¡lise nÃ£o Ã© mais a tentativa ativa.',
        HttpStatus.CONFLICT,
      );
    }

    await this.persistCompleted(journey.id, operation.id, attemptStartedAt);
    return this.readSnapshot(journey.id);
  }

  async get(publicId: string, sessionJourneyId: string) {
    const journey = await this.authorized(publicId, sessionJourneyId);
    this.assertReady(journey);
    return this.readSnapshot(journey.id);
  }

  private async findOrCreateOperation(journeyId: string, inputHash: string) {
    const existing = await this.database.aiOperation.findFirst({
      where: { journeyId, type: AiOperationType.ANALYSIS },
    });
    if (existing) return existing;

    try {
      return await this.database.aiOperation.create({
        data: {
          journeyId,
          type: AiOperationType.ANALYSIS,
          idempotencyKey: `journey:${journeyId}:analysis`,
          inputHash,
          provider: this.provider.name,
          promptVersion: this.analysisPromptVersion,
          schemaVersion: this.analysisSchemaVersion,
          model: this.provider.model,
          status: AiOperationStatus.PENDING,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const raced = await this.database.aiOperation.findFirst({
        where: { journeyId, type: AiOperationType.ANALYSIS },
      });
      if (!raced) throw error;
      return raced;
    }
  }

  private async repairVersionedInvalidOutput(operation: AiOperation): Promise<AiOperation> {
    const versionsAreCurrent = operation.promptVersion === this.analysisPromptVersion
      && operation.schemaVersion === this.analysisSchemaVersion;
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
        promptVersion: this.analysisPromptVersion,
        schemaVersion: this.analysisSchemaVersion,
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
        promptVersion: this.analysisPromptVersion,
        schemaVersion: this.analysisSchemaVersion,
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

  private assertRetryAllowed(operation: RetryPolicyInput): void {
    if (operation.status === AiOperationStatus.PROCESSING) {
      throw new ApiError(
        'AI_OPERATION_IN_PROGRESS',
        'A anÃ¡lise jÃ¡ estÃ¡ sendo preparada. Aguarde alguns instantes.',
        HttpStatus.CONFLICT,
      );
    }
    if (operation.status === AiOperationStatus.SAFETY_BLOCKED) {
      throw new ApiError(
        'AI_CONTENT_BLOCKED',
        'A anÃ¡lise automÃ¡tica foi interrompida com seguranÃ§a e nÃ£o serÃ¡ repetida nesta jornada.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (operation.status === AiOperationStatus.INVALID_OUTPUT) {
      throw new ApiError(
        'AI_OUTPUT_INVALID',
        'A anÃ¡lise recebida nÃ£o pÃ´de ser validada e a chamada nÃ£o serÃ¡ repetida automaticamente.',
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
      if (
        !operation.providerErrorCode
        || !retryableCodes.has(operation.providerErrorCode)
        || operation.requestCount >= 2
      ) {
        throw new ApiError(
          'AI_TEMPORARILY_UNAVAILABLE',
          'NÃ£o foi possÃ­vel preparar a anÃ¡lise nesta jornada sem repetir chamadas adicionais.',
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
        'A anÃ¡lise jÃ¡ estÃ¡ sendo preparada. Aguarde alguns instantes.',
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
        promptVersion: this.analysisPromptVersion,
        schemaVersion: this.analysisSchemaVersion,
        providerErrorCode: null,
      },
    });
    if (claimed.count !== 1) {
      throw new ApiError(
        'AI_OPERATION_IN_PROGRESS',
        'A anÃ¡lise jÃ¡ estÃ¡ sendo preparada. Aguarde alguns instantes.',
        HttpStatus.CONFLICT,
      );
    }
    return startedAt;
  }

  private async persistCompleted(
    journeyId: string,
    operationId: string,
    attemptStartedAt: Date,
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.database.$transaction(async (transaction) => {
          const activeOperation = await transaction.aiOperation.findFirst({
            where: {
              id: operationId,
              journeyId,
              type: AiOperationType.ANALYSIS,
              status: AiOperationStatus.PROCESSING,
              startedAt: attemptStartedAt,
              resultJson: { not: null },
            },
            select: { provider: true },
          });
          if (!activeOperation) throw new Error('AI_OPERATION_OWNERSHIP_LOST');
          const completed = await transaction.aiOperation.updateMany({
            where: {
              id: operationId,
              journeyId,
              type: AiOperationType.ANALYSIS,
              status: AiOperationStatus.PROCESSING,
              startedAt: attemptStartedAt,
              resultJson: { not: null },
            },
            data: {
              status: AiOperationStatus.COMPLETED,
              completedAt: new Date(),
              providerErrorCode: null,
            },
          });
          if (completed.count !== 1) throw new Error('AI_OPERATION_OWNERSHIP_LOST');
          await transaction.auditLog.create({
            data: {
              journeyId,
              action: 'FINAL_ANALYSIS_CREATED',
              entityType: 'AiOperation',
              entityId: operationId,
              metadata: {
                provider: activeOperation.provider,
                stageCount: STEP_DEFINITIONS.length,
              },
            },
          });
        }, { isolationLevel: 'Serializable' });
        return;
      } catch (error) {
        const retryable = isRetryableTransactionError(error);
        if (retryable && attempt === 0) continue;
        const current = await this.database.aiOperation.findUnique({
          where: { id: operationId },
          select: { status: true },
        });
        if (current?.status === AiOperationStatus.COMPLETED) return;
        throw error;
      }
    }
  }

  private async readSnapshot(journeyId: string) {
    const operation = await this.database.aiOperation.findFirst({
      where: { journeyId, type: AiOperationType.ANALYSIS },
      select: {
        provider: true,
        status: true,
        resultJson: true,
      },
    });
    if (
      !operation
      || operation.status !== AiOperationStatus.COMPLETED
      || operation.resultJson === null
    ) {
      throw new ApiError(
        'ANALYSIS_NOT_AVAILABLE',
        'A anÃ¡lise ainda nÃ£o estÃ¡ disponÃ­vel.',
        HttpStatus.CONFLICT,
      );
    }
    const generated = analysisGenerationSchema.safeParse(operation.resultJson);
    if (!generated.success) {
      throw new ApiError(
        'ANALYSIS_DATA_INVALID',
        'A anÃ¡lise salva nÃ£o pÃ´de ser validada.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return this.toSnapshot(operation.provider, generated.data);
  }

  private toSnapshot(provider: string, generated: AnaliseGerada) {
    return {
      generationStatus: 'AVAILABLE' as const,
      generationMode: provider === 'demo' ? 'DEMO' as const : 'GEMINI' as const,
      summary: generated.resumoCircunstancia,
      stages: generated.reflexoesEtapas.map((stage) => ({
        stepNumber: stage.numeroEtapa,
        stageName: stage.nomeEtapa,
        groundedFacts: stage.fatosFundamentados,
        participantAssociations: stage.associacoesParticipante,
        reflectivePossibilities: stage.possibilidadesReflexivas,
        openQuestions: stage.perguntasAbertas,
        synthesis: stage.sintese,
      })),
      sequenceSynthesis: generated.sinteseSequencia,
      possibleConnections: generated.conexoesPossiveis,
      uncertainties: generated.incertezas,
      nextReflections: generated.proximasReflexoes,
      safety: {
        requiresPause: generated.sinalizacaoSeguranca.requerPausa,
        requiresProfessionalReview:
          generated.sinalizacaoSeguranca.requerRevisaoProfissional,
        reason: generated.sinalizacaoSeguranca.motivo,
      },
      notice: generated.aviso,
    };
  }

  private buildContext(journey: AnalysisJourney): AnalysisGenerationContext {
    const theme = journey.themeKey === 'personalizado'
      ? journey.customTheme
      : this.catalog.getTheme(journey.themeKey)?.nome;
    if (!theme) {
      throw new ApiError(
        'ANALYSIS_CONTEXT_INVALID',
        'O tema salvo nÃ£o pÃ´de ser preparado para a anÃ¡lise.',
        HttpStatus.CONFLICT,
      );
    }
    const sets = new Map(journey.sets.map((set) => [set.position, set]));
    const stepQuestions = new Map<number, AnalysisJourney['reflectiveQuestions']>();
    const integrativeQuestions: AnalysisJourney['reflectiveQuestions'] = [];

    for (const question of journey.reflectiveQuestions) {
      if (question.type === ReflectiveQuestionType.INTEGRATIVE) {
        integrativeQuestions.push(question);
        continue;
      }
      if (
        question.stepNumber === null
        || question.stepNumber < 1
        || question.stepNumber > STEP_DEFINITIONS.length
      ) {
        throw new ApiError(
          'ANALYSIS_CONTEXT_INVALID',
          'Uma pergunta salva nÃ£o estÃ¡ associada a uma etapa vÃ¡lida.',
          HttpStatus.CONFLICT,
        );
      }
      const current = stepQuestions.get(question.stepNumber) ?? [];
      current.push(question);
      stepQuestions.set(question.stepNumber, current);
    }

    const candidate = {
      theme,
      initialNarrative: journey.circumstanceText,
      catalogVersion: journey.catalogVersion,
      steps: STEP_DEFINITIONS.map((definition) => {
        const set = sets.get(definition.number);
        const word = this.catalog.getWord(set?.wordKey ?? null);
        const image = this.catalog.getImage(set?.imageKey ?? null);
        if (!set || set.movement !== definition.movement || !word || !image) {
          throw new ApiError(
            'ANALYSIS_CONTEXT_INVALID',
            'A sequÃªncia salva nÃ£o pÃ´de ser preparada para a anÃ¡lise.',
            HttpStatus.CONFLICT,
          );
        }
        return {
          number: definition.number,
          name: definition.name,
          purpose: definition.purpose,
          word: word.texto,
          imageDescription: image.descricao_imagem,
          initialImpression: set.initialImpression,
          questions: (stepQuestions.get(definition.number) ?? []).map((question) =>
            this.contextQuestion(question)),
        };
      }),
      integrativeQuestions: integrativeQuestions.map((question) =>
        this.contextQuestion(question)),
    };
    const parsed = analysisGenerationContextSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new ApiError(
        'ANALYSIS_CONTEXT_INVALID',
        'As perguntas e respostas salvas nÃ£o puderam ser preparadas para a anÃ¡lise.',
        HttpStatus.CONFLICT,
      );
    }
    return parsed.data;
  }

  private contextQuestion(question: AnalysisJourney['reflectiveQuestions'][number]) {
    if (!question.answer) {
      throw new ApiError(
        'ANSWERS_NOT_COMPLETED',
        'Responda ou marque uma opÃ§Ã£o em todas as perguntas antes da anÃ¡lise.',
        HttpStatus.CONFLICT,
      );
    }
    return {
      displayOrder: question.displayOrder,
      text: question.text,
      responseType: question.answer.responseType,
      answer: question.answer.responseType === ReflectiveResponseType.TEXT
        ? question.answer.text
        : null,
    };
  }

  private assertReady(journey: AnalysisJourney): void {
    if (journey.status !== JourneyStatus.RESPOSTAS_CONCLUIDAS) {
      throw new ApiError(
        'ANSWERS_NOT_COMPLETED',
        'Conclua todas as respostas antes de gerar a anÃ¡lise.',
        HttpStatus.CONFLICT,
      );
    }
    if (
      journey.reflectiveQuestions.length === 0
      || journey.reflectiveQuestions.some((question) => !question.answer)
    ) {
      throw new ApiError(
        'ANSWERS_NOT_COMPLETED',
        'Responda ou marque uma opÃ§Ã£o em todas as perguntas antes da anÃ¡lise.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async authorized(
    publicId: string,
    sessionJourneyId: string,
  ): Promise<AnalysisJourney> {
    const journey = await this.database.journey.findFirst({
      where: { publicId, id: sessionJourneyId },
      include: {
        sets: { orderBy: { position: 'asc' } },
        reflectiveQuestions: {
          orderBy: { displayOrder: 'asc' },
          include: { answer: true },
        },
      },
    });
    if (!journey) {
      throw new ApiError(
        'FORBIDDEN_RESOURCE',
        'Jornada nÃ£o encontrada.',
        HttpStatus.NOT_FOUND,
      );
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

  private async invalidateCachedResult(operation: {
    id: string;
    status: AiOperationStatus;
    startedAt: Date | null;
  }): Promise<void> {
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
    if (error.code !== 'INVALID_OUTPUT' || !error.diagnosticCode) return error.code;
    const normalized = error.diagnosticCode.trim().toUpperCase();
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
      return new ApiError(
        'AI_NOT_CONFIGURED',
        'A geraÃ§Ã£o da anÃ¡lise nÃ£o estÃ¡ configurada.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (error.code === 'QUOTA_EXHAUSTED') {
      return new ApiError(
        'AI_DAILY_LIMIT_REACHED',
        'O limite da IA foi atingido. Sua jornada permanece salva.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (error.code === 'SAFETY_BLOCKED') {
      return new ApiError(
        'AI_CONTENT_BLOCKED',
        'A anÃ¡lise automÃ¡tica foi interrompida com seguranÃ§a.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (error.code === 'INVALID_OUTPUT') {
      return new ApiError(
        'AI_OUTPUT_INVALID',
        'A anÃ¡lise recebida nÃ£o pÃ´de ser validada.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return new ApiError(
      'AI_TEMPORARILY_UNAVAILABLE',
      'NÃ£o foi possÃ­vel preparar a anÃ¡lise agora.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private get analysisPromptVersion(): string {
    return this.config.get<string>(
      'GEMINI_ANALYSIS_PROMPT_VERSION',
      ANALYSIS_PROMPT_VERSION,
    );
  }

  private get analysisSchemaVersion(): string {
    return this.config.get<string>(
      'GEMINI_ANALYSIS_SCHEMA_VERSION',
      ANALYSIS_SCHEMA_VERSION,
    );
  }

  private json(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value)) as unknown;
  }
}

