-- Método DHA — schema PostgreSQL sem ORM
-- Estado completo exigido pela camada de dados SQL do backend.
--
-- Execute somente no banco vazio "viktorwa_metodo-dha", usando uma ferramenta
-- compatível com PostgreSQL (phpPgAdmin, Adminer/PostgreSQL ou psql).
-- phpMyAdmin é exclusivo para MySQL/MariaDB e não executa este script.

BEGIN;

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "JourneyStatus" AS ENUM (
  'EM_PREPARACAO',
  'EM_TIRAGEM',
  'CARTAS_CONCLUIDAS',
  'PERGUNTAS_DISPONIVEIS',
  'RESPOSTAS_CONCLUIDAS',
  'PAUSADA',
  'CANCELADA',
  'EXPIRADA'
);

CREATE TYPE "Movement" AS ENUM (
  'CIRCUNSTANCIA_PERCEBIDA',
  'HISTORIA',
  'CONDICIONAMENTOS',
  'CONSCIENCIA',
  'ESCOLHA_CONSCIENTE'
);

CREATE TYPE "ConsentType" AS ENUM (
  'INFORMED',
  'PRIVACY',
  'SENSITIVE_DATA'
);

CREATE TYPE "AiOperationType" AS ENUM (
  'QUESTIONS',
  'ANALYSIS',
  'AYA_ROUND',
  'REPORT_REVISION'
);

CREATE TYPE "AiOperationStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'QUOTA_BLOCKED',
  'SAFETY_BLOCKED',
  'INVALID_OUTPUT'
);

CREATE TYPE "ReflectiveQuestionType" AS ENUM (
  'STEP',
  'INTEGRATIVE'
);

CREATE TYPE "ReflectiveResponseType" AS ENUM (
  'TEXT',
  'NO_RELATION',
  'DONT_KNOW',
  'PREFER_NOT_TO_ANSWER',
  'SKIPPED'
);

CREATE TYPE "AiQuotaReservationStatus" AS ENUM (
  'RESERVED',
  'SENT',
  'FAILED'
);

CREATE TABLE "Journey" (
  "id" UUID NOT NULL,
  "publicId" VARCHAR(64) NOT NULL,
  "status" "JourneyStatus" NOT NULL DEFAULT 'EM_PREPARACAO',
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "catalogVersion" VARCHAR(40) NOT NULL,
  "themeKey" VARCHAR(80) NOT NULL,
  "customTheme" VARCHAR(120),
  "circumstanceText" VARCHAR(5000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "Journey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Journey_currentStep_check"
    CHECK ("currentStep" BETWEEN 0 AND 5)
);

CREATE TABLE "JourneyContact" (
  "id" UUID NOT NULL,
  "journeyId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "emailNormalized" VARCHAR(254) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JourneyContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Consent" (
  "id" UUID NOT NULL,
  "journeyId" UUID NOT NULL,
  "consentType" "ConsentType" NOT NULL,
  "consentVersion" VARCHAR(32) NOT NULL,
  "accepted" BOOLEAN NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "ipHash" VARCHAR(64),
  "userAgentHash" VARCHAR(64),

  CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JourneySet" (
  "id" UUID NOT NULL,
  "journeyId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "movement" "Movement" NOT NULL,
  "wordKey" VARCHAR(40),
  "imageKey" VARCHAR(40),
  "initialImpression" VARCHAR(1000),
  "wordDrawnAt" TIMESTAMP(3),
  "imageDrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JourneySet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JourneySet_position_check"
    CHECK ("position" BETWEEN 1 AND 5),
  CONSTRAINT "JourneySet_word_before_image_check"
    CHECK (
      "imageKey" IS NULL
      OR (
        "wordKey" IS NOT NULL
        AND "wordDrawnAt" IS NOT NULL
        AND "imageDrawnAt" >= "wordDrawnAt"
      )
    ),
  CONSTRAINT "JourneySet_word_draw_state_check"
    CHECK (("wordKey" IS NULL) = ("wordDrawnAt" IS NULL)),
  CONSTRAINT "JourneySet_image_draw_state_check"
    CHECK (("imageKey" IS NULL) = ("imageDrawnAt" IS NULL)),
  CONSTRAINT "JourneySet_word_key_format_check"
    CHECK (
      "wordKey" IS NULL
      OR "wordKey" ~ '^palavra-(00[1-9]|0[1-9][0-9]|1[0-5][0-9]|16[0-4])$'
    ),
  CONSTRAINT "JourneySet_image_key_format_check"
    CHECK (
      "imageKey" IS NULL
      OR "imageKey" ~ '^imagem-(00[1-9]|0[1-9][0-9]|1[0-5][0-9]|16[0-4])$'
    )
);

CREATE TABLE "PublicAccessSession" (
  "id" UUID NOT NULL,
  "journeyId" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PublicAccessSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL,
  "journeyId" UUID,
  "action" VARCHAR(80) NOT NULL,
  "entityType" VARCHAR(80) NOT NULL,
  "entityId" VARCHAR(80) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiOperation" (
  "id" UUID NOT NULL,
  "journeyId" UUID NOT NULL,
  "type" "AiOperationType" NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "inputHash" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "promptVersion" VARCHAR(32) NOT NULL,
  "schemaVersion" VARCHAR(32) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "status" "AiOperationStatus" NOT NULL DEFAULT 'PENDING',
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "promptTokens" INTEGER,
  "outputTokens" INTEGER,
  "thoughtTokens" INTEGER,
  "totalTokens" INTEGER,
  "latencyMs" INTEGER,
  "providerErrorCode" VARCHAR(80),
  "providerRequestId" VARCHAR(160),
  "resultJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "AiOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiOperation_provider_not_blank_check"
    CHECK (length(btrim("provider")) > 0),
  CONSTRAINT "AiOperation_schema_version_not_blank_check"
    CHECK (length(btrim("schemaVersion")) > 0),
  CONSTRAINT "AiOperation_thought_tokens_check"
    CHECK ("thoughtTokens" IS NULL OR "thoughtTokens" >= 0)
);

CREATE TABLE "AiDailyQuota" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "quotaDatePacific" DATE NOT NULL,
  "operationalLimit" INTEGER NOT NULL,
  "reservedCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiDailyQuota_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiQuotaReservation" (
  "id" UUID NOT NULL,
  "quotaId" UUID NOT NULL,
  "operationId" UUID,
  "attemptStartedAt" TIMESTAMP(3) NOT NULL,
  "status" "AiQuotaReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt" TIMESTAMP(3),
  "journeySetId" UUID,

  CONSTRAINT "AiQuotaReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiQuotaReservation_finalization_check"
    CHECK (
      ("status" = 'RESERVED' AND "finalizedAt" IS NULL)
      OR ("status" <> 'RESERVED' AND "finalizedAt" IS NOT NULL)
    )
);

CREATE TABLE "ReflectiveQuestion" (
  "id" UUID NOT NULL,
  "journeyId" UUID NOT NULL,
  "journeySetId" UUID,
  "aiOperationId" UUID NOT NULL,
  "type" "ReflectiveQuestionType" NOT NULL,
  "stepNumber" INTEGER,
  "displayOrder" INTEGER NOT NULL,
  "text" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReflectiveQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReflectiveQuestion_display_order_check"
    CHECK ("displayOrder" > 0),
  CONSTRAINT "ReflectiveQuestion_text_not_blank_check"
    CHECK (length(btrim("text")) > 0),
  CONSTRAINT "ReflectiveQuestion_type_scope_check"
    CHECK (
      (
        "type" = 'STEP'
        AND "journeySetId" IS NOT NULL
        AND "stepNumber" BETWEEN 1 AND 5
      )
      OR
      (
        "type" = 'INTEGRATIVE'
        AND "journeySetId" IS NULL
        AND "stepNumber" IS NULL
      )
    )
);

CREATE TABLE "ReflectiveAnswer" (
  "id" UUID NOT NULL,
  "journeyId" UUID NOT NULL,
  "questionId" UUID NOT NULL,
  "responseType" "ReflectiveResponseType" NOT NULL,
  "text" VARCHAR(5000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReflectiveAnswer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReflectiveAnswer_text_response_check"
    CHECK (
      (
        "responseType" = 'TEXT'
        AND "text" IS NOT NULL
        AND length(btrim("text")) > 0
      )
      OR
      (
        "responseType" <> 'TEXT'
        AND "text" IS NULL
      )
    )
);

CREATE UNIQUE INDEX "Journey_publicId_key"
  ON "Journey"("publicId");

CREATE UNIQUE INDEX "JourneyContact_journeyId_key"
  ON "JourneyContact"("journeyId");

CREATE UNIQUE INDEX "Consent_journeyId_consentType_key"
  ON "Consent"("journeyId", "consentType");

CREATE INDEX "JourneySet_journeyId_idx"
  ON "JourneySet"("journeyId");

CREATE UNIQUE INDEX "JourneySet_journeyId_position_key"
  ON "JourneySet"("journeyId", "position");

CREATE UNIQUE INDEX "JourneySet_journeyId_id_position_key"
  ON "JourneySet"("journeyId", "id", "position");

CREATE UNIQUE INDEX "JourneySet_journeyId_wordKey_key"
  ON "JourneySet"("journeyId", "wordKey");

CREATE UNIQUE INDEX "JourneySet_journeyId_imageKey_key"
  ON "JourneySet"("journeyId", "imageKey");

CREATE UNIQUE INDEX "PublicAccessSession_tokenHash_key"
  ON "PublicAccessSession"("tokenHash");

CREATE INDEX "PublicAccessSession_journeyId_idx"
  ON "PublicAccessSession"("journeyId");

CREATE UNIQUE INDEX "AiOperation_idempotencyKey_key"
  ON "AiOperation"("idempotencyKey");

CREATE UNIQUE INDEX "AiOperation_journeyId_id_key"
  ON "AiOperation"("journeyId", "id");

CREATE UNIQUE INDEX "AiOperation_one_questions_per_journey_key"
  ON "AiOperation"("journeyId")
  WHERE "type" = 'QUESTIONS';

CREATE UNIQUE INDEX "AiDailyQuota_provider_model_quotaDatePacific_key"
  ON "AiDailyQuota"("provider", "model", "quotaDatePacific");

CREATE INDEX "AiQuotaReservation_quotaId_status_idx"
  ON "AiQuotaReservation"("quotaId", "status");

CREATE UNIQUE INDEX "AiQuotaReservation_operationId_attemptStartedAt_key"
  ON "AiQuotaReservation"("operationId", "attemptStartedAt");

CREATE INDEX "ReflectiveQuestion_journeySetId_idx"
  ON "ReflectiveQuestion"("journeySetId");

CREATE INDEX "ReflectiveQuestion_aiOperationId_idx"
  ON "ReflectiveQuestion"("aiOperationId");

CREATE UNIQUE INDEX "ReflectiveQuestion_id_journeyId_key"
  ON "ReflectiveQuestion"("id", "journeyId");

CREATE UNIQUE INDEX "ReflectiveQuestion_journeyId_displayOrder_key"
  ON "ReflectiveQuestion"("journeyId", "displayOrder");

CREATE UNIQUE INDEX "ReflectiveAnswer_questionId_key"
  ON "ReflectiveAnswer"("questionId");

CREATE INDEX "ReflectiveAnswer_journeyId_idx"
  ON "ReflectiveAnswer"("journeyId");

CREATE UNIQUE INDEX "ReflectiveAnswer_questionId_journeyId_key"
  ON "ReflectiveAnswer"("questionId", "journeyId");

ALTER TABLE "JourneyContact"
  ADD CONSTRAINT "JourneyContact_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Consent"
  ADD CONSTRAINT "Consent_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JourneySet"
  ADD CONSTRAINT "JourneySet_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicAccessSession"
  ADD CONSTRAINT "PublicAccessSession_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiOperation"
  ADD CONSTRAINT "AiOperation_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiQuotaReservation"
  ADD CONSTRAINT "AiQuotaReservation_quotaId_fkey"
  FOREIGN KEY ("quotaId") REFERENCES "AiDailyQuota"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiQuotaReservation"
  ADD CONSTRAINT "AiQuotaReservation_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiQuotaReservation"
  ADD CONSTRAINT "AiQuotaReservation_journeySetId_fkey"
  FOREIGN KEY ("journeySetId") REFERENCES "JourneySet"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReflectiveQuestion"
  ADD CONSTRAINT "ReflectiveQuestion_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReflectiveQuestion"
  ADD CONSTRAINT "ReflectiveQuestion_journeyId_journeySetId_stepNumber_fkey"
  FOREIGN KEY ("journeyId", "journeySetId", "stepNumber")
  REFERENCES "JourneySet"("journeyId", "id", "position")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReflectiveQuestion"
  ADD CONSTRAINT "ReflectiveQuestion_journeyId_aiOperationId_fkey"
  FOREIGN KEY ("journeyId", "aiOperationId")
  REFERENCES "AiOperation"("journeyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReflectiveAnswer"
  ADD CONSTRAINT "ReflectiveAnswer_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReflectiveAnswer"
  ADD CONSTRAINT "ReflectiveAnswer_questionId_journeyId_fkey"
  FOREIGN KEY ("questionId", "journeyId")
  REFERENCES "ReflectiveQuestion"("id", "journeyId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION prevent_card_replacement()
RETURNS trigger AS $$
BEGIN
  IF OLD."wordKey" IS NOT NULL
     AND NEW."wordKey" IS DISTINCT FROM OLD."wordKey" THEN
    RAISE EXCEPTION 'word card is immutable';
  END IF;

  IF OLD."imageKey" IS NOT NULL
     AND NEW."imageKey" IS DISTINCT FROM OLD."imageKey" THEN
    RAISE EXCEPTION 'image card is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JourneySet_cards_immutable"
BEFORE UPDATE ON "JourneySet"
FOR EACH ROW
EXECUTE FUNCTION prevent_card_replacement();

COMMIT;
