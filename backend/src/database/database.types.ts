export enum JourneyStatus {
  EM_PREPARACAO = 'EM_PREPARACAO',
  EM_TIRAGEM = 'EM_TIRAGEM',
  CARTAS_CONCLUIDAS = 'CARTAS_CONCLUIDAS',
  PERGUNTAS_DISPONIVEIS = 'PERGUNTAS_DISPONIVEIS',
  RESPOSTAS_CONCLUIDAS = 'RESPOSTAS_CONCLUIDAS',
  PAUSADA = 'PAUSADA',
  CANCELADA = 'CANCELADA',
  EXPIRADA = 'EXPIRADA',
}

export enum Movement {
  CIRCUNSTANCIA_PERCEBIDA = 'CIRCUNSTANCIA_PERCEBIDA',
  HISTORIA = 'HISTORIA',
  CONDICIONAMENTOS = 'CONDICIONAMENTOS',
  CONSCIENCIA = 'CONSCIENCIA',
  ESCOLHA_CONSCIENTE = 'ESCOLHA_CONSCIENTE',
}

export enum ConsentType {
  INFORMED = 'INFORMED',
  PRIVACY = 'PRIVACY',
  SENSITIVE_DATA = 'SENSITIVE_DATA',
}

export enum AiOperationType {
  QUESTIONS = 'QUESTIONS',
  ANALYSIS = 'ANALYSIS',
  AYA_ROUND = 'AYA_ROUND',
  REPORT_REVISION = 'REPORT_REVISION',
}

export enum AiOperationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  QUOTA_BLOCKED = 'QUOTA_BLOCKED',
  SAFETY_BLOCKED = 'SAFETY_BLOCKED',
  INVALID_OUTPUT = 'INVALID_OUTPUT',
}

export enum ReflectiveQuestionType {
  STEP = 'STEP',
  INTEGRATIVE = 'INTEGRATIVE',
}

export enum ReflectiveResponseType {
  TEXT = 'TEXT',
  NO_RELATION = 'NO_RELATION',
  DONT_KNOW = 'DONT_KNOW',
  PREFER_NOT_TO_ANSWER = 'PREFER_NOT_TO_ANSWER',
  SKIPPED = 'SKIPPED',
}

export enum AiQuotaReservationStatus {
  RESERVED = 'RESERVED',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export interface AiOperation {
  id: string;
  journeyId: string;
  type: AiOperationType;
  idempotencyKey: string;
  inputHash: string;
  provider: string;
  promptVersion: string;
  schemaVersion: string;
  model: string;
  status: AiOperationStatus;
  requestCount: number;
  promptTokens: number | null;
  outputTokens: number | null;
  thoughtTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  providerErrorCode: string | null;
  providerRequestId: string | null;
  resultJson: unknown;
  createdAt: Date;
  startedAt: Date | null;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface AiOperationRecord extends AiOperation {
  reflectiveQuestions: ReflectiveQuestionRecord[];
}

export interface JourneySetRecord {
  id: string;
  journeyId: string;
  position: number;
  movement: Movement;
  wordKey: string | null;
  imageKey: string | null;
  initialImpression: string | null;
  wordDrawnAt: Date | null;
  imageDrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  journey: JourneyRecord;
}

export interface JourneyRecord {
  id: string;
  publicId: string;
  status: JourneyStatus;
  currentStep: number;
  catalogVersion: string;
  themeKey: string;
  customTheme: string | null;
  circumstanceText: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  sets: JourneySetRecord[];
  reflectiveQuestions: ReflectiveQuestionRecord[];
}

export interface PublicAccessSessionRecord {
  id: string;
  journeyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface AiQuotaReservationRecord {
  id: string;
  quotaId: string;
  operationId: string | null;
  attemptStartedAt: Date;
  status: AiQuotaReservationStatus;
  createdAt: Date;
  finalizedAt: Date | null;
  journeySetId: string | null;
}

export interface ReflectiveQuestionRecord {
  id: string;
  journeyId: string;
  journeySetId: string | null;
  aiOperationId: string;
  type: ReflectiveQuestionType;
  stepNumber: number | null;
  displayOrder: number;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  answer: ReflectiveAnswerRecord | null;
}

export interface ReflectiveAnswerRecord {
  id: string;
  journeyId: string;
  questionId: string;
  responseType: ReflectiveResponseType;
  text: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReflectiveQuestionCreateInput {
  id?: string;
  journeyId: string;
  journeySetId: string | null;
  aiOperationId: string;
  type: ReflectiveQuestionType;
  stepNumber: number | null;
  displayOrder: number;
  text: string;
}

export interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && (error as DatabaseError).code === '23505';
}

export function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return ['40001', '40P01'].includes((error as DatabaseError).code ?? '');
}
