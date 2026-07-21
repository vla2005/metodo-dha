import { ConfigService } from '@nestjs/config';
import {
  AiOperationStatus,
  AiOperationType,
  type AiOperation,
} from '../src/database/database.types';
import { CatalogService } from '../src/catalogo/catalog.service';
import { DatabaseService } from '../src/database/database.service';
import {
  DHA_STEP_NAMES,
  IaProviderError,
  type ProvedorIa,
  type QuestionGenerationContext,
} from '../src/ia/provedor-ia';
import { QuestionsService } from '../src/perguntas/questions.service';
import { QuotaService } from '../src/perguntas/quota.service';

type RetryPolicyInput = {
  status: AiOperationStatus;
  completedAt: Date | null;
  providerErrorCode: string | null;
  requestCount: number;
};

type QuestionsRecoveryInternals = {
  repairVersionedInvalidOutput(operation: AiOperation): Promise<AiOperation>;
  assertRetryAllowed(operation: RetryPolicyInput): void;
  markProviderFailure(
    operationId: string,
    attemptStartedAt: Date,
    error: IaProviderError,
  ): Promise<void>;
};

type GenerateJourney = { id: string; sets: never[] };
type GenerateSnapshot = { generationStatus: 'AVAILABLE'; marker: string };
type GenerateInternals = {
  authorized(publicId: string, sessionJourneyId: string): Promise<GenerateJourney>;
  assertCardsCompleted(journey: GenerateJourney): void;
  buildContext(journey: GenerateJourney): QuestionGenerationContext;
  findOrCreateOperation(journeyId: string, inputHash: string): Promise<AiOperation>;
  readSnapshot(journeyId: string): Promise<GenerateSnapshot>;
};

type RepairUpdateArgs = {
  where: {
    id: string;
    status: AiOperationStatus;
    promptVersion: string;
    schemaVersion: string;
  };
  data: {
    status: AiOperationStatus;
    promptVersion: string;
    schemaVersion: string;
    startedAt: null;
    completedAt: null;
    resultJson: unknown;
    providerErrorCode: null;
  };
};

type ProviderFailureUpdateArgs = {
  where: {
    id: string;
    status: AiOperationStatus;
    startedAt: Date;
  };
  data: {
    status: AiOperationStatus;
    providerErrorCode: string;
    completedAt: Date;
  };
};

const generationContext: QuestionGenerationContext = {
  theme: 'Relacionamentos',
  initialNarrative: 'Quero observar uma situaÃ§Ã£o importante com calma.',
  catalogVersion: 'dha-2026-v1',
  steps: DHA_STEP_NAMES.map((name, index) => ({
    number: (index + 1) as 1 | 2 | 3 | 4 | 5,
    name,
    purpose: `FunÃ§Ã£o reflexiva da etapa ${index + 1}.`,
    word: `Palavra ${index + 1}`,
    imageDescription: `DescriÃ§Ã£o objetiva suficientemente detalhada da imagem ${index + 1}.`,
    initialImpression: null,
  })),
};

const makeOperation = (overrides: Partial<AiOperation> = {}): AiOperation => ({
  id: 'operation-id',
  journeyId: 'journey-id',
  type: AiOperationType.QUESTIONS,
  idempotencyKey: 'journey:journey-id:questions',
  inputHash: 'input-hash',
  provider: 'gemini',
  promptVersion: 'questions-v1',
  schemaVersion: 'questions-v1',
  model: 'gemini-test',
  status: AiOperationStatus.INVALID_OUTPUT,
  requestCount: 1,
  promptTokens: 100,
  outputTokens: 20,
  thoughtTokens: 5,
  totalTokens: 125,
  latencyMs: 250,
  providerErrorCode: 'INVALID_OUTPUT_SCHEMA_VALIDATION',
  providerRequestId: 'provider-request-id',
  resultJson: { invalid: true },
  createdAt: new Date('2026-07-18T12:00:00.000Z'),
  startedAt: new Date('2026-07-18T12:00:01.000Z'),
  updatedAt: new Date('2026-07-18T12:00:02.000Z'),
  completedAt: new Date('2026-07-18T12:00:02.000Z'),
  ...overrides,
});

const createProvider = () => ({
  name: 'gemini' as const,
  usesRemoteQuota: true,
  model: 'gemini-test',
  gerarPerguntas: jest.fn(),
  gerarAnalise: jest.fn(),
  executarRodadaAya: jest.fn(),
});

const createService = (
  database: DatabaseService,
  provider: ProvedorIa = createProvider(),
): QuestionsService => new QuestionsService(
  database,
  new ConfigService({
    GEMINI_PROMPT_VERSION: 'questions-v2',
    GEMINI_SCHEMA_VERSION: 'questions-v2',
  }),
  {} as CatalogService,
  {} as QuotaService,
  provider,
);

const errorCode = (action: () => void): string | null => {
  try {
    action();
    return null;
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error)) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
};

describe('recuperaÃ§Ã£o versionada de perguntas invÃ¡lidas', () => {
  it('repara uma operaÃ§Ã£o antiga sem zerar requestCount nem substituir a idempotencyKey', async () => {
    let capturedUpdate: RepairUpdateArgs | undefined;
    const updateMany = jest.fn((args: RepairUpdateArgs) => {
      capturedUpdate = args;
      return Promise.resolve({ count: 1 });
    });
    const service = createService({ aiOperation: { updateMany } } as unknown as DatabaseService);
    const operation = makeOperation({ requestCount: 3 });

    const repaired = await (service as unknown as QuestionsRecoveryInternals)
      .repairVersionedInvalidOutput(operation);

    expect(capturedUpdate).toEqual({
      where: {
        id: operation.id,
        status: AiOperationStatus.INVALID_OUTPUT,
        promptVersion: 'questions-v1',
        schemaVersion: 'questions-v1',
      },
      data: {
        status: AiOperationStatus.PENDING,
        promptVersion: 'questions-v2',
        schemaVersion: 'questions-v2',
        startedAt: null,
        completedAt: null,
        resultJson: null,
        providerErrorCode: null,
      },
    });
    const updateData = capturedUpdate?.data;
    expect(updateData).not.toHaveProperty('requestCount');
    expect(updateData).not.toHaveProperty('idempotencyKey');
    expect(updateData).not.toHaveProperty('promptTokens');
    expect(updateData).not.toHaveProperty('providerRequestId');
    expect(repaired).toMatchObject({
      id: operation.id,
      idempotencyKey: operation.idempotencyKey,
      requestCount: 3,
      promptTokens: 100,
      totalTokens: 125,
      providerRequestId: 'provider-request-id',
      status: AiOperationStatus.PENDING,
      promptVersion: 'questions-v2',
      schemaVersion: 'questions-v2',
      startedAt: null,
      completedAt: null,
      resultJson: null,
      providerErrorCode: null,
    });
  });

  it('permite somente uma transiÃ§Ã£o atÃ´mica quando duas reparaÃ§Ãµes concorrem', async () => {
    let state = makeOperation();
    let transitionCount = 0;
    const updateMany = jest.fn((args: RepairUpdateArgs) => {
      const matches = state.status === args.where.status
        && state.promptVersion === args.where.promptVersion
        && state.schemaVersion === args.where.schemaVersion;
      if (!matches) return Promise.resolve({ count: 0 });
      transitionCount += 1;
      state = {
        ...state,
        status: args.data.status,
        promptVersion: args.data.promptVersion,
        schemaVersion: args.data.schemaVersion,
        startedAt: null,
        completedAt: null,
        resultJson: null,
        providerErrorCode: null,
      };
      return Promise.resolve({ count: 1 });
    });
    const findUnique = jest.fn(() => Promise.resolve(state));
    const service = createService({
      aiOperation: { updateMany, findUnique },
    } as unknown as DatabaseService);
    const staleOperation = makeOperation();

    const results = await Promise.all([
      (service as unknown as QuestionsRecoveryInternals)
        .repairVersionedInvalidOutput(staleOperation),
      (service as unknown as QuestionsRecoveryInternals)
        .repairVersionedInvalidOutput(staleOperation),
    ]);

    expect(transitionCount).toBe(1);
    expect(results).toHaveLength(2);
    expect(results.every((operation) => operation.status === AiOperationStatus.PENDING)).toBe(true);
    expect(results.every((operation) => operation.requestCount === staleOperation.requestCount)).toBe(true);
  });

  it('mantÃ©m INVALID_OUTPUT da versÃ£o atual como terminal', async () => {
    const updateMany = jest.fn();
    const service = createService({ aiOperation: { updateMany } } as unknown as DatabaseService);
    const operation = makeOperation({
      promptVersion: 'questions-v2',
      schemaVersion: 'questions-v2',
    });
    const internals = service as unknown as QuestionsRecoveryInternals;

    const unchanged = await internals.repairVersionedInvalidOutput(operation);

    expect(unchanged).toBe(operation);
    expect(updateMany).not.toHaveBeenCalled();
    expect(errorCode(() => internals.assertRetryAllowed(unchanged))).toBe('AI_OUTPUT_INVALID');
  });

  it('retorna uma operaÃ§Ã£o COMPLETED legada sem reparar nem chamar novamente o provider', async () => {
    const updateMany = jest.fn();
    const provider = createProvider();
    const service = createService(
      { aiOperation: { updateMany } } as unknown as DatabaseService,
      provider,
    );
    const operation = makeOperation({
      status: AiOperationStatus.COMPLETED,
      resultJson: { legacy: true },
    });
    const snapshot: GenerateSnapshot = { generationStatus: 'AVAILABLE', marker: 'legacy' };
    const journey: GenerateJourney = { id: 'journey-id', sets: [] };
    const internals = service as unknown as GenerateInternals;
    internals.authorized = jest.fn().mockResolvedValue(journey);
    internals.assertCardsCompleted = jest.fn();
    internals.buildContext = jest.fn().mockReturnValue(generationContext);
    internals.findOrCreateOperation = jest.fn((_journeyId, inputHash) => Promise.resolve({
      ...operation,
      inputHash,
    }));
    const readSnapshot = jest.fn().mockResolvedValue(snapshot);
    internals.readSnapshot = readSnapshot;

    await expect(service.generate('public-id', 'journey-id')).resolves.toBe(snapshot);
    expect(updateMany).not.toHaveBeenCalled();
    expect(provider.gerarPerguntas).not.toHaveBeenCalled();
    expect(readSnapshot).toHaveBeenCalledWith('journey-id');
  });

  it('persiste diagnÃ³stico seguro de INVALID_OUTPUT e preserva cÃ³digos transitÃ³rios', async () => {
    const failureUpdates: ProviderFailureUpdateArgs[] = [];
    const updateMany = jest.fn((args: ProviderFailureUpdateArgs) => {
      failureUpdates.push(args);
      return Promise.resolve({ count: 1 });
    });
    const service = createService({ aiOperation: { updateMany } } as unknown as DatabaseService);
    const internals = service as unknown as QuestionsRecoveryInternals;
    const attemptStartedAt = new Date('2026-07-18T12:00:01.000Z');
    const invalidOutput = Object.assign(
      new IaProviderError('INVALID_OUTPUT', false),
      { diagnosticCode: 'schema_validation' },
    );

    await internals.markProviderFailure('operation-id', attemptStartedAt, invalidOutput);
    await internals.markProviderFailure(
      'operation-id',
      attemptStartedAt,
      new IaProviderError('TIMEOUT', true),
    );

    expect(failureUpdates[0]?.data).toMatchObject({
      status: AiOperationStatus.INVALID_OUTPUT,
      providerErrorCode: 'INVALID_OUTPUT_SCHEMA_VALIDATION',
    });
    expect(failureUpdates[1]?.data).toMatchObject({
      status: AiOperationStatus.FAILED,
      providerErrorCode: 'TIMEOUT',
    });
  });
});



