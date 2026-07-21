# Modelo de dados sugerido — PostgreSQL e Prisma

## JourneyContact

Dados de contato informados no início de cada análise:

- `id`;
- `journeyId` único;
- `name`;
- `email`;
- `emailNormalized`;
- `createdAt`;
- `updatedAt`.

Não use e-mail como identificador de conta, credencial ou autorização. O mesmo e-mail pode aparecer em mais de uma jornada.

## PublicAccessSession

- `id`;
- `journeyId`;
- `tokenHash` único;
- `createdAt`;
- `lastSeenAt`;
- `expiresAt`;
- `revokedAt` opcional;
- `createdIpHash` opcional, somente se aprovado pela política de privacidade;
- `userAgentHash` opcional, somente se aprovado pela política de privacidade.

Nunca persista o token bruto.

## JourneyResumeToken — opcional

- `id`;
- `journeyId`;
- `tokenHash` único;
- `expiresAt`;
- `usedAt` opcional;
- `createdAt`.

Use somente se houver retomada por link enviado ao e-mail.

## ProfessionalAccount — opcional

- `id`;
- `name`;
- `email` único;
- `passwordHash` ou credencial do provedor escolhido;
- `role`: `PROFESSIONAL` ou `ADMIN`;
- `status`;
- `createdAt`;
- `updatedAt`.

Esta entidade é exclusiva da área restrita. Não crie conta de participante.

## ProfessionalProfile — opcional

- `id`;
- `professionalAccountId` único;
- identificação profissional conforme regra do produto;
- status de acesso.

Não transforme cadastro profissional em validação legal automática.

## ConsentDocument

- `id`;
- `version` única;
- `title`;
- `contentHash`;
- `publishedAt`;
- `active`.

## ConsentAcceptance

- `id`;
- `journeyId` único;
- `consentDocumentId`;
- `acceptedAt`;
- informações técnicas mínimas aprovadas pela política de privacidade.

## Theme

- `id`;
- `name`;
- `description`;
- `active`;
- `order`.

## WordCard

- `id`;
- `word`;
- `active`;
- `version`;
- `createdAt`.

## ImageCard

- `id`;
- `storageKey`;
- `objectiveDescription`;
- `altTextPublic`;
- `mimeType`;
- `contentHash`;
- `active`;
- `version`.

`objectiveDescription` deve descrever apenas elementos visíveis, sem interpretação psicológica.

## Journey

- `id` interno;
- `publicId` único, aleatório e não sequencial;
- `themeId` opcional até a escolha;
- `customTheme` opcional;
- `initialNarrative` opcional até o relato;
- `status`;
- `currentStep`;
- `allowProfessionalAccess`;
- `createdAt`;
- `updatedAt`;
- `completedAt` opcional;
- `expiresAt` opcional conforme política.

## JourneySet

- `id`;
- `journeyId`;
- `stepNumber` de 1 a 5;
- `stepName`;
- `wordCardId`;
- `imageCardId`;
- `wordDrawnAt`;
- `imageDrawnAt`;
- `lockedAt`;
- `createdAt`.

Restrições:

- `UNIQUE(journeyId, stepNumber)`;
- palavra obrigatória antes da imagem;
- não permitir update de carta depois de bloqueada.

## InitialImpression

- `id`;
- `journeySetId` único;
- `text` opcional;
- `responseType`: `TEXT`, `NO_RELATION`, `DONT_KNOW`, `PREFER_NOT_TO_ANSWER`, `SKIPPED`;
- `createdAt`.

## ReflectiveQuestion

- `id`;
- `journeyId`;
- `journeySetId` opcional;
- `type`: `STEP` ou `INTEGRATIVE`;
- `order`;
- `text`;
- `aiOperationId`;
- `createdAt`.

## ReflectiveAnswer

- `id`;
- `questionId` único;
- `journeyId`;
- `text` opcional;
- `responseType`;
- `createdAt`;
- `updatedAt`.

## AiOperation

- `id`;
- `journeyId`;
- `type`: `QUESTIONS`, `ANALYSIS`, `AYA_ROUND`, `REPORT_REVISION`;
- `idempotencyKey` única;
- `inputHash`;
- `promptVersion`;
- `schemaVersion`;
- `model`;
- `status`;
- `requestCount`;
- `promptTokens`;
- `outputTokens`;
- `thoughtTokens`;
- `totalTokens`;
- `latencyMs`;
- `providerErrorCode`;
- `providerRequestId` opcional;
- `resultJson` protegido;
- `createdAt`;
- `completedAt`.

Estados sugeridos:

- `PENDING`;
- `PROCESSING`;
- `COMPLETED`;
- `FAILED`;
- `QUOTA_BLOCKED`;
- `SAFETY_BLOCKED`;
- `INVALID_OUTPUT`.

## AiDailyQuota

- `id`;
- `provider`;
- `model`;
- `quotaDatePacific`;
- `operationalLimit`;
- `reservedCount`;
- `sentCount`;
- `failedCount`;
- `updatedAt`.

Restrição:

- `UNIQUE(provider, model, quotaDatePacific)`.

A reserva de cota deve ser atômica.

## AyaRound

- `id`;
- `journeyId`;
- `roundNumber`;
- `participantInput`;
- `ayaOutputJson`;
- `aiOperationId`;
- `createdAt`.

Restrição:

- `UNIQUE(journeyId, roundNumber)`.

## Report

- `id`;
- `journeyId`;
- `version`;
- `contentJson`;
- `status`: `DRAFT`, `WAITING_REVIEW`, `APPROVED`, `RELEASED`;
- `generatedByOperationId`;
- `reviewedByProfessionalId` opcional;
- `reviewedAt` opcional;
- `releasedAt` opcional;
- `createdAt`.

## AuditLog

- `id`;
- `actorType`: `PUBLIC_SESSION`, `PROFESSIONAL`, `ADMIN`, `SYSTEM`;
- `actorReferenceId` opcional;
- `action`;
- `resourceType`;
- `resourceId`;
- `metadata` sem conteúdo íntimo;
- `createdAt`.

## Migrations

- usar migrations versionadas;
- revisar migrations antes de aplicar;
- separar seed de cartas de seed de contas profissionais;
- nunca usar relatos reais em seed;
- manter hashes ou versões para rastrear alterações nas cartas.
