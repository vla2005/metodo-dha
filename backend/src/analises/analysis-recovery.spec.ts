import { ConfigService } from '@nestjs/config';
import {
  AiOperationStatus,
  AiOperationType,
  ReflectiveResponseType,
  type AiOperation,
} from '../database/database.types';
import { CatalogService } from '../catalogo/catalog.service';
import { DatabaseService } from '../database/database.service';
import {
  DHA_STEP_NAMES,
  IaProviderError,
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

type AnalysisRecoveryInternals = {
  repairVersionedInvalidOutput(operation: AiOperation): Promise<AiOperation>;
  assertRetryAllowed(operation: RetryPolicyInput): void;
  markProviderFailure(
    operationId: string,
    attemptStartedAt: Date,
    error: IaProviderError,
  ): Promise<void>;
};

type GenerateJourney = { id: string };
type GenerateSnapshot = { generationStatus: 'AVAILABLE'; marker: string };
type GenerateInternals = {
  authorized(publicId: string, sessionJourneyId: string): Promise<GenerateJourney>;
  assertReady(journey: GenerateJourney): void;
  buildContext(journey: GenerateJourney): AnalysisGenerationContext;
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

const generationContext: AnalysisGenerationContext = {
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
    questions: [{
      displayOrder: index + 1,
      text: `Pergunta da etapa ${index + 1}?`,
      responseType: ReflectiveResponseType.TEXT,
      answer: `Resposta da etapa ${index + 1}.`,
    }],
  })),
  integrativeQuestions: [],
};

const makeOperation = (overrides: Partial<AiOperation> = {}): AiOperation => ({
  id: 'analysis-operation-id',
  journeyId: 'journey-id',
  type: AiOperationType.ANALYSIS,
  idempotencyKey: 'journey:journey-id:analysis',
  inputHash: 'input-hash',
  provider: 'gemini',
  promptVersion: 'analysis-v1',
  schemaVersion: 'analysis-v1',
  model: 'gemini-test',
  status: AiOperationStatus.INVALID_OUTPUT,
  requestCount: 1,
  promptTokens: 120,
  outputTokens: 30,
  thoughtTokens: 5,
  totalTokens: 155,
  latencyMs: 300,
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
): AnalysisService => new AnalysisService(
  database,
  new ConfigService(),
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

describe('recuperaÃ§Ã£o versionada da anÃ¡lise', () => {
  it('repara INVALID_OUTPUT legado para analysis-v2 preservando identidade e histÃ³rico', async () => {
    let capturedUpdate: RepairUpdateArgs | undefined;
    const updateMany = jest.fn((args: RepairUpdateArgs) => {
      capturedUpdate = args;
      return Promise.resolve({ count: 1 });
    });
    const service = createService({ aiOperation: { updateMany } } as unknown as DatabaseService);
    const operation = makeOperation({ requestCount: 4 });

    const repaired = await (service as unknown as AnalysisRecoveryInternals)
      .repairVersionedInvalidOutput(operation);

    expect(capturedUpdate).toEqual({
      where: {
        id: operation.id,
        status: AiOperationStatus.INVALID_OUTPUT,
        promptVersion: 'analysis-v1',
        schemaVersion: 'analysis-v1',
      },
      data: {
        status: AiOperationStatus.PENDING,
        promptVersion: 'analysis-v2',
        schemaVersion: 'analysis-v2',
        startedAt: null,
        completedAt: null,
        resultJson: null,
        providerErrorCode: null,
      },
    });
    expect(capturedUpdate?.data).not.toHaveProperty('requestCount');
    expect(capturedUpdate?.data).not.toHaveProperty('idempotencyKey');
    expect(capturedUpdate?.data).not.toHaveProperty('promptTokens');
    expect(repaired).toMatchObject({
      id: operation.id,
      idempotencyKey: operation.idempotencyKey,
      requestCount: 4,
      promptTokens: 120,
      providerRequestId: 'provider-request-id',
      status: AiOperationStatus.PENDING,
      promptVersion: 'analysis-v2',
      schemaVersion: 'analysis-v2',
      startedAt: null,
      completedAt: null,
      resultJson: null,
      providerErrorCode: null,
    });
  });

  it('faz apenas uma transiÃ§Ã£o quando duas reparaÃ§Ãµes concorrem', async () => {
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
    const internals = service as unknown as AnalysisRecoveryInternals;

    const results = await Promise.all([
      internals.repairVersionedInvalidOutput(staleOperation),
      internals.repairVersionedInvalidOutput(staleOperation),
    ]);

    expect(transitionCount).toBe(1);
    expect(results.every((operation) => operation.status === AiOperationStatus.PENDING)).toBe(true);
    expect(results.every((operation) => operation.requestCount === staleOperation.requestCount)).toBe(true);
  });

  it('mantÃ©m INVALID_OUTPUT da versÃ£o atual terminal', async () => {
    const updateMany = jest.fn();
    const service = createService({ aiOperation: { updateMany } } as unknown as DatabaseService);
    const operation = makeOperation({
      promptVersion: 'analysis-v2',
      schemaVersion: 'analysis-v2',
    });
    const internals = service as unknown as AnalysisRecoveryInternals;

    const unchanged = await internals.repairVersionedInvalidOutput(operation);

    expect(unchanged).toBe(operation);
    expect(updateMany).not.toHaveBeenCalled();
    expect(errorCode(() => internals.assertRetryAllowed(unchanged))).toBe('AI_OUTPUT_INVALID');
  });

  it('retorna anÃ¡lise COMPLETED legada sem reparar nem chamar o provider', async () => {
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
    const journey: GenerateJourney = { id: 'journey-id' };
    const internals = service as unknown as GenerateInternals;
    internals.authorized = jest.fn().mockResolvedValue(journey);
    internals.assertReady = jest.fn();
    internals.buildContext = jest.fn().mockReturnValue(generationContext);
    internals.findOrCreateOperation = jest.fn((_journeyId, inputHash) => Promise.resolve({
      ...operation,
      inputHash,
    }));
    const readSnapshot = jest.fn().mockResolvedValue(snapshot);
    internals.readSnapshot = readSnapshot;

    await expect(service.generate('public-id', 'journey-id')).resolves.toBe(snapshot);
    expect(updateMany).not.toHaveBeenCalled();
    expect(provider.gerarAnalise).not.toHaveBeenCalled();
    expect(readSnapshot).toHaveBeenCalledWith('journey-id');
  });

  it('persiste diagnÃ³stico seguro e mantÃ©m UNAVAILABLE apto Ã  polÃ­tica transitÃ³ria', async () => {
    const failureUpdates: ProviderFailureUpdateArgs[] = [];
    const updateMany = jest.fn((args: ProviderFailureUpdateArgs) => {
      failureUpdates.push(args);
      return Promise.resolve({ count: 1 });
    });
    const service = createService({ aiOperation: { updateMany } } as unknown as DatabaseService);
    const internals = service as unknown as AnalysisRecoveryInternals;
    const attemptStartedAt = new Date('2026-07-18T12:00:01.000Z');

    await internals.markProviderFailure(
      'analysis-operation-id',
      attemptStartedAt,
      new IaProviderError('INVALID_OUTPUT', false, 'MALFORMED_JSON'),
    );
    await internals.markProviderFailure(
      'analysis-operation-id',
      attemptStartedAt,
      new IaProviderError('UNAVAILABLE', true),
    );

    expect(failureUpdates[0]?.data).toMatchObject({
      status: AiOperationStatus.INVALID_OUTPUT,
      providerErrorCode: 'INVALID_OUTPUT_MALFORMED_JSON',
    });
    expect(failureUpdates[1]?.data).toMatchObject({
      status: AiOperationStatus.FAILED,
      providerErrorCode: 'UNAVAILABLE',
    });
  });
});



