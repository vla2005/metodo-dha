import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'node:crypto';
import { CatalogService } from '../catalogo/catalog.service';
import type { CatalogImage } from '../catalogo/catalog.types';
import { ApiError } from '../common/api-error';
import { createOpaqueToken, hashToken } from '../common/session';
import { DatabaseClient, DatabaseService } from '../database/database.service';
import {
  AiOperationType,
  JourneyStatus,
  Movement,
  isRetryableTransactionError,
  isUniqueViolation,
} from '../database/database.types';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { hasRequiredConsents, isValidPosition, REQUIRED_CONSENTS } from './journey-rules';

const MOVEMENTS: Movement[] = [
  Movement.CIRCUNSTANCIA_PERCEBIDA,
  Movement.HISTORIA,
  Movement.CONDICIONAMENTOS,
  Movement.CONSCIENCIA,
  Movement.ESCOLHA_CONSCIENTE,
];

type DrawingJourney = { status: JourneyStatus; currentStep: number };
type StoredSet = {
  id: string;
  position: number;
  movement: Movement;
  wordKey: string | null;
  imageKey: string | null;
  initialImpression: string | null;
  wordDrawnAt: Date | null;
  imageDrawnAt: Date | null;
};

@Injectable()
export class JourneysService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly catalog: CatalogService,
  ) {}

  async create(dto: CreateJourneyDto) {
    if (!hasRequiredConsents(dto.consents)) {
      throw new ApiError('CONSENT_REQUIRED', 'Todos os consentimentos vigentes são obrigatórios.', HttpStatus.BAD_REQUEST);
    }

    const customTheme = dto.customTheme?.trim();
    if ((!dto.themeKey && !customTheme) || (dto.themeKey && customTheme)) {
      throw new ApiError('THEME_REQUIRED', 'Informe um tema cadastrado ou personalizado.', HttpStatus.BAD_REQUEST);
    }

    const catalogTheme = dto.themeKey ? this.catalog.getTheme(dto.themeKey) : undefined;
    if (dto.themeKey && !catalogTheme) {
      throw new ApiError('THEME_NOT_FOUND', 'Tema inválido.', HttpStatus.BAD_REQUEST);
    }

    const themeKey = catalogTheme?.id ?? 'personalizado';
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.get<number>('PUBLIC_SESSION_TTL_HOURS', 72) * 3_600_000);
    const journey = await this.database.$transaction(async (tx) => tx.journey.create({
      data: {
        publicId: `jrn_${randomUUID().replaceAll('-', '')}`,
        catalogVersion: this.catalog.version,
        themeKey,
        customTheme: catalogTheme ? null : customTheme,
        circumstanceText: dto.circumstanceText.trim(),
        contact: { create: { name: dto.name, email: dto.email, emailNormalized: dto.email } },
        consents: {
          create: dto.consents.map((consent) => ({
            consentType: consent.consentType,
            consentVersion: consent.consentVersion,
            accepted: consent.accepted,
            acceptedAt: new Date(),
          })),
        },
        sessions: { create: { tokenHash: hashToken(token), expiresAt } },
        audits: {
          create: {
            action: 'JOURNEY_CREATED',
            entityType: 'Journey',
            entityId: 'self',
            metadata: { consentTypes: REQUIRED_CONSENTS, themeKey, catalogVersion: this.catalog.version },
          },
        },
      },
      select: { publicId: true, status: true, currentStep: true },
    }));

    return { token, journey };
  }

  async get(publicId: string, sessionJourneyId: string) {
    const journey = await this.authorized(publicId, sessionJourneyId);
    const theme = this.resolveTheme(journey.themeKey, journey.customTheme);
    return {
      publicId: journey.publicId,
      status: journey.status,
      currentStep: journey.currentStep,
      theme,
      customTheme: journey.customTheme,
      circumstanceText: journey.circumstanceText,
      sets: journey.sets.map((set: StoredSet) => ({
        position: set.position,
        movement: set.movement,
        initialImpression: set.initialImpression,
        wordDrawnAt: set.wordDrawnAt,
        imageDrawnAt: set.imageDrawnAt,
        wordCard: set.wordKey ? { word: this.requireWord(set.wordKey).texto } : null,
        imageCard: set.imageKey ? this.publicImage(journey.publicId, set.position, this.requireImage(set.imageKey)) : null,
      })),
    };
  }

  async getCurrent(sessionJourneyId: string) {
    const journey = await this.database.journey.findUnique({ where: { id: sessionJourneyId }, select: { publicId: true } });
    if (!journey) throw new ApiError('FORBIDDEN_RESOURCE', 'Jornada não encontrada.', HttpStatus.NOT_FOUND);
    return this.get(journey.publicId, sessionJourneyId);
  }

  async cancel(publicId: string, sessionJourneyId: string) {
    const cancelledAt = new Date();

    return this.database.$transaction(async (tx) => {
      const journey = await tx.journey.findFirst({
        where: { publicId, id: sessionJourneyId },
        select: { id: true, status: true, completedAt: true },
      });
      if (!journey) {
        throw new ApiError(
          'FORBIDDEN_RESOURCE',
          'Jornada não encontrada.',
          HttpStatus.NOT_FOUND,
        );
      }

      if (journey.status !== JourneyStatus.CANCELADA) {
        await tx.journey.update({
          where: { id: journey.id },
          data: {
            status: JourneyStatus.CANCELADA,
            completedAt: journey.completedAt ?? cancelledAt,
          },
        });
        await tx.auditLog.create({
          data: {
            journeyId: journey.id,
            action: 'JOURNEY_CANCELLED',
            entityType: 'Journey',
            entityId: 'self',
            metadata: { previousStatus: journey.status },
          },
        });
      }

      await tx.publicAccessSession.updateMany({
        where: { journeyId: journey.id, revokedAt: null },
        data: { revokedAt: cancelledAt },
      });

      return { status: JourneyStatus.CANCELADA };
    });
  }

  async drawWord(publicId: string, sessionJourneyId: string, position: number) {
    this.validatePosition(position);
    return this.withConcurrencyRetry(async () => this.database.$transaction(async (tx) => {
      const journey = await this.authorizedTx(tx, publicId, sessionJourneyId);
      this.assertDrawingStep(journey, position);
      const existing = journey.sets.find((set: StoredSet) => set.position === position);
      if (existing?.wordKey) return this.wordResponse(journey.publicId, existing);

      const usedKeys = journey.sets.flatMap((set: StoredSet) => (set.wordKey ? [set.wordKey] : []));
      const eligible = this.catalog.availableWords(usedKeys);
      if (!eligible.length) {
        throw new ApiError('CARD_DECK_EXHAUSTED', 'Não há palavras disponíveis.', HttpStatus.CONFLICT);
      }

      const word = eligible[randomInt(eligible.length)];
      const drawnAt = new Date();
      const set = existing
        ? await tx.journeySet.update({
            where: { id: existing.id },
            data: { wordKey: word.id, wordDrawnAt: drawnAt },
            select: this.setSelection(),
          })
        : await tx.journeySet.create({
            data: {
              journeyId: journey.id,
              position,
              movement: MOVEMENTS[position - 1],
              wordKey: word.id,
              wordDrawnAt: drawnAt,
            },
            select: this.setSelection(),
          });
      await tx.auditLog.create({
        data: {
          journeyId: journey.id,
          action: 'WORD_DRAWN',
          entityType: 'JourneySet',
          entityId: String(position),
          metadata: { wordKey: set.wordKey, catalogVersion: this.catalog.version },
        },
      });
      return this.wordResponse(journey.publicId, set);
    }, { isolationLevel: 'Serializable' }));
  }

  async drawImage(publicId: string, sessionJourneyId: string, position: number) {
    this.validatePosition(position);
    return this.withConcurrencyRetry(async () => this.database.$transaction(async (tx) => {
      const journey = await this.authorizedTx(tx, publicId, sessionJourneyId);
      this.assertDrawingStep(journey, position);
      const existing = journey.sets.find((set: StoredSet) => set.position === position);
      if (!existing?.wordKey) {
        throw new ApiError('WORD_REQUIRED_BEFORE_IMAGE', 'Sorteie a palavra antes da imagem.', HttpStatus.CONFLICT);
      }
      if (existing.imageKey) return this.imageResponse(journey.publicId, existing);

      const usedKeys = journey.sets.flatMap((set: StoredSet) => (set.imageKey ? [set.imageKey] : []));
      const eligible = this.catalog.availableImages(usedKeys);
      if (!eligible.length) {
        throw new ApiError('CARD_DECK_EXHAUSTED', 'Não há imagens disponíveis.', HttpStatus.CONFLICT);
      }

      const image = eligible[randomInt(eligible.length)];
      const set = await tx.journeySet.update({
        where: { id: existing.id },
        data: { imageKey: image.id, imageDrawnAt: new Date() },
        select: this.setSelection(),
      });
      await tx.auditLog.create({
        data: {
          journeyId: journey.id,
          action: 'IMAGE_DRAWN',
          entityType: 'JourneySet',
          entityId: String(position),
          metadata: { imageKey: set.imageKey, catalogVersion: this.catalog.version },
        },
      });
      return this.imageResponse(journey.publicId, set);
    }, { isolationLevel: 'Serializable' }));
  }

  async saveImpression(publicId: string, sessionJourneyId: string, position: number, text: string) {
    this.validatePosition(position);
    const journey = await this.authorized(publicId, sessionJourneyId);
    const questionsOperation = await this.database.aiOperation.findFirst({
      where: { journeyId: journey.id, type: AiOperationType.QUESTIONS },
      select: { id: true },
    });
    if (questionsOperation) {
      throw new ApiError(
        'IMPRESSION_LOCKED',
        'A impressão inicial não pode ser alterada depois que a geração de perguntas começa.',
        HttpStatus.CONFLICT,
      );
    }
    const set = journey.sets.find((item: StoredSet) => item.position === position);
    if (!set?.imageKey) {
      throw new ApiError('SET_NOT_COMPLETED', 'Conclua o conjunto antes de registrar a impressão.', HttpStatus.CONFLICT);
    }
    await this.database.journeySet.update({ where: { id: set.id }, data: { initialImpression: text.trim() || null } });
    return { saved: true };
  }

  async getRevealedImage(publicId: string, sessionJourneyId: string, position: number) {
    this.validatePosition(position);
    const set = await this.database.journeySet.findFirst({
      where: {
        position,
        imageKey: { not: null },
        imageDrawnAt: { not: null },
        journey: { publicId, id: sessionJourneyId },
      },
      select: { imageKey: true, journey: { select: { catalogVersion: true } } },
    });
    if (!set?.imageKey || !this.catalog.getImage(set.imageKey)) {
      throw new ApiError('IMAGE_NOT_AVAILABLE', 'Imagem não encontrada.', HttpStatus.NOT_FOUND);
    }
    this.assertCatalogVersion(set.journey.catalogVersion);

    try {
      return await this.catalog.readImage(set.imageKey);
    } catch (error) {
      const integrityFailure = error instanceof Error && error.message.startsWith('Falha de integridade');
      throw new ApiError(
        integrityFailure ? 'IMAGE_INTEGRITY_FAILED' : 'IMAGE_FILE_NOT_FOUND',
        integrityFailure ? 'A integridade do arquivo não pôde ser confirmada.' : 'Arquivo da imagem indisponível.',
        integrityFailure ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.NOT_FOUND,
      );
    }
  }

  async advance(publicId: string, sessionJourneyId: string) {
    const journey = await this.authorized(publicId, sessionJourneyId);
    if (journey.status === JourneyStatus.CARTAS_CONCLUIDAS) return this.readProgress(journey.id);
    if (journey.currentStep === 0) {
      if (journey.status !== JourneyStatus.EM_PREPARACAO) {
        throw new ApiError('INVALID_JOURNEY_STATE', 'A jornada não pode avançar neste estado.', HttpStatus.CONFLICT);
      }
      await this.database.journey.updateMany({
        where: { id: journey.id, status: JourneyStatus.EM_PREPARACAO, currentStep: 0 },
        data: { currentStep: 1, status: JourneyStatus.EM_TIRAGEM },
      });
      return this.readProgress(journey.id);
    }
    if (journey.status !== JourneyStatus.EM_TIRAGEM) {
      throw new ApiError('INVALID_JOURNEY_STATE', 'A jornada não pode avançar neste estado.', HttpStatus.CONFLICT);
    }

    const current = journey.sets.find((set: StoredSet) => set.position === journey.currentStep);
    if (!current?.wordKey || !current.imageKey) {
      throw new ApiError('SET_NOT_COMPLETED', 'Conclua palavra e imagem antes de avançar.', HttpStatus.CONFLICT);
    }
    if (journey.currentStep === 5) {
      await this.database.journey.updateMany({
        where: { id: journey.id, status: JourneyStatus.EM_TIRAGEM, currentStep: 5 },
        data: { status: JourneyStatus.CARTAS_CONCLUIDAS, completedAt: new Date() },
      });
      return this.readProgress(journey.id);
    }
    await this.database.journey.updateMany({
      where: {
        id: journey.id,
        status: JourneyStatus.EM_TIRAGEM,
        currentStep: journey.currentStep,
      },
      data: { currentStep: journey.currentStep + 1 },
    });
    return this.readProgress(journey.id);
  }

  private validatePosition(position: number): void {
    if (!isValidPosition(position)) {
      throw new ApiError('INVALID_POSITION', 'A posição deve estar entre 1 e 5.', HttpStatus.BAD_REQUEST);
    }
  }

  private assertDrawingStep(journey: DrawingJourney, position: number): void {
    if (journey.status !== JourneyStatus.EM_TIRAGEM || journey.currentStep !== position) {
      throw new ApiError('INVALID_JOURNEY_STATE', 'Esta posição ainda não está disponível.', HttpStatus.CONFLICT);
    }
  }

  private wordResponse(publicId: string, set: StoredSet) {
    return {
      publicId,
      position: set.position,
      movement: set.movement,
      word: set.wordKey ? this.requireWord(set.wordKey).texto : undefined,
      drawnAt: set.wordDrawnAt,
      locked: true,
    };
  }

  private imageResponse(publicId: string, set: StoredSet) {
    return {
      publicId,
      position: set.position,
      movement: set.movement,
      image: set.imageKey ? this.publicImage(publicId, set.position, this.requireImage(set.imageKey)) : null,
      drawnAt: set.imageDrawnAt,
      locked: true,
    };
  }

  private publicImage(publicId: string, position: number, image: CatalogImage) {
    return {
      url: `/journeys/${encodeURIComponent(publicId)}/sets/${position}/image`,
      objectiveDescription: image.descricao_imagem,
      alternativeText: image.texto_alternativo,
      descriptionReviewed: false,
      descriptionSource: 'catalog_json_ai_draft',
    };
  }

  private requireWord(key: string) {
    const word = this.catalog.getWord(key);
    if (!word) throw new ApiError('CATALOG_REFERENCE_INVALID', 'Referência de palavra inválida.', HttpStatus.INTERNAL_SERVER_ERROR);
    return word;
  }

  private requireImage(key: string) {
    const image = this.catalog.getImage(key);
    if (!image) throw new ApiError('CATALOG_REFERENCE_INVALID', 'Referência de imagem inválida.', HttpStatus.INTERNAL_SERVER_ERROR);
    return image;
  }

  private resolveTheme(themeKey: string, customTheme: string | null) {
    if (themeKey === 'personalizado') {
      if (!customTheme) throw new ApiError('CATALOG_REFERENCE_INVALID', 'Referência de tema inválida.', HttpStatus.INTERNAL_SERVER_ERROR);
      return { id: themeKey, name: customTheme };
    }
    const theme = this.catalog.getTheme(themeKey);
    if (!theme) throw new ApiError('CATALOG_REFERENCE_INVALID', 'Referência de tema inválida.', HttpStatus.INTERNAL_SERVER_ERROR);
    return { id: theme.id, name: theme.nome };
  }

  private assertCatalogVersion(version: string): void {
    if (version !== this.catalog.version) {
      throw new ApiError(
        'CATALOG_VERSION_UNAVAILABLE',
        'A versão do catálogo desta jornada não está disponível.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private setSelection() {
    return {
      position: true,
      movement: true,
      wordKey: true,
      imageKey: true,
      wordDrawnAt: true,
      imageDrawnAt: true,
    } as const;
  }

  private async authorized(publicId: string, sessionJourneyId: string) {
    const journey = await this.database.journey.findFirst({
      where: { publicId, id: sessionJourneyId },
      include: { sets: { orderBy: { position: 'asc' } } },
    });
    if (!journey) throw new ApiError('FORBIDDEN_RESOURCE', 'Jornada não encontrada.', HttpStatus.NOT_FOUND);
    this.assertCatalogVersion(journey.catalogVersion);
    return journey;
  }

  private async authorizedTx(tx: DatabaseClient, publicId: string, sessionJourneyId: string) {
    const journey = await tx.journey.findFirst({
      where: { publicId, id: sessionJourneyId },
      include: { sets: true },
    });
    if (!journey) throw new ApiError('FORBIDDEN_RESOURCE', 'Jornada não encontrada.', HttpStatus.NOT_FOUND);
    this.assertCatalogVersion(journey.catalogVersion);
    return journey;
  }

  private async readProgress(journeyId: string) {
    const journey = await this.database.journey.findUnique({
      where: { id: journeyId },
      select: { publicId: true, status: true, currentStep: true },
    });
    if (!journey) throw new ApiError('FORBIDDEN_RESOURCE', 'Jornada não encontrada.', HttpStatus.NOT_FOUND);
    return journey;
  }

  private async withConcurrencyRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const knownConcurrencyError = isUniqueViolation(error) || isRetryableTransactionError(error);
      const immutableRace = error instanceof Error
        && (error.message.includes('word card is immutable') || error.message.includes('image card is immutable'));
      if (knownConcurrencyError || immutableRace) {
        return operation();
      }
      throw error;
    }
  }
}
