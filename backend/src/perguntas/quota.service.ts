import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../common/api-error';
import { DatabaseService } from '../database/database.service';
import {
  AiQuotaReservationStatus,
  isRetryableTransactionError,
} from '../database/database.types';

export interface QuotaReservation {
  id: string;
}

type ReservedRow = { id: string };

export function pacificQuotaDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return new Date(`${read('year')}-${read('month')}-${read('day')}T00:00:00.000Z`);
}

@Injectable()
export class QuotaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async reserve(
    operationId: string,
    attemptStartedAt: Date,
    provider: string,
    model: string,
  ): Promise<QuotaReservation> {
    const hardLimit = this.config.get<number>('GEMINI_DAILY_HARD_LIMIT', 500);
    const operationalLimit = Math.min(
      hardLimit,
      this.config.get<number>('GEMINI_DAILY_OPERATIONAL_LIMIT', 450),
    );
    const quotaDateKey = pacificQuotaDate().toISOString().slice(0, 10);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.$transaction(async (transaction) => {
          const rows = await transaction.query<ReservedRow>(`
            INSERT INTO "AiDailyQuota" (
              "id", "provider", "model", "quotaDatePacific", "operationalLimit",
              "reservedCount", "sentCount", "failedCount", "updatedAt"
            ) VALUES (
              $1::uuid, $2, $3, $4::date, $5,
              1, 0, 0, NOW()
            )
            ON CONFLICT ("provider", "model", "quotaDatePacific") DO UPDATE SET
              "operationalLimit" = EXCLUDED."operationalLimit",
              "reservedCount" = "AiDailyQuota"."reservedCount" + 1,
              "updatedAt" = NOW()
            WHERE (
              "AiDailyQuota"."reservedCount"
              + "AiDailyQuota"."sentCount"
              + "AiDailyQuota"."failedCount"
            ) < EXCLUDED."operationalLimit"
            RETURNING "id"
          `, [randomUUID(), provider, model, quotaDateKey, operationalLimit]);
          const quota = rows[0];
          if (!quota) {
            throw new ApiError(
              'AI_DAILY_LIMIT_REACHED',
              'O limite diário de perguntas foi atingido. Sua jornada permanece salva para continuar depois.',
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
          return transaction.aiQuotaReservation.create({
            data: {
              quotaId: quota.id,
              operationId,
              attemptStartedAt,
              status: AiQuotaReservationStatus.RESERVED,
            },
            select: { id: true },
          });
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        const retryable = isRetryableTransactionError(error);
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error('AI_QUOTA_RESERVATION_RETRY_EXHAUSTED');
  }

  async complete(reservation: QuotaReservation, succeeded: boolean): Promise<void> {
    await this.finalize(reservation.id, succeeded);
  }

  async completeAttempt(operationId: string, attemptStartedAt: Date, succeeded: boolean): Promise<void> {
    const reservation = await this.database.aiQuotaReservation.findUnique({
      where: { operationId_attemptStartedAt: { operationId, attemptStartedAt } },
      select: { id: true },
    });
    if (reservation) await this.finalize(reservation.id, succeeded);
  }

  private async finalize(reservationId: string, succeeded: boolean): Promise<void> {
    const targetStatus = succeeded
      ? AiQuotaReservationStatus.SENT
      : AiQuotaReservationStatus.FAILED;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.database.$transaction(async (transaction) => {
          const reservation = await transaction.aiQuotaReservation.findUnique({
            where: { id: reservationId },
            select: { status: true, quotaId: true },
          });
          if (!reservation) throw new Error('AI_QUOTA_RESERVATION_NOT_FOUND');
          if (reservation.status === targetStatus) return;
          if (reservation.status !== AiQuotaReservationStatus.RESERVED) {
            throw new Error('AI_QUOTA_RESERVATION_ALREADY_FINALIZED');
          }
          const finalized = await transaction.aiQuotaReservation.updateMany({
            where: { id: reservationId, status: AiQuotaReservationStatus.RESERVED },
            data: { status: targetStatus, finalizedAt: new Date() },
          });
          if (finalized.count !== 1) throw new Error('AI_QUOTA_RESERVATION_CONFLICT');
          const quota = await transaction.aiDailyQuota.updateMany({
            where: { id: reservation.quotaId, reservedCount: { gt: 0 } },
            data: {
              reservedCount: { decrement: 1 },
              ...(succeeded
                ? { sentCount: { increment: 1 } }
                : { failedCount: { increment: 1 } }),
            },
          });
          if (quota.count !== 1) throw new Error('AI_QUOTA_COUNTER_INCONSISTENT');
        }, { isolationLevel: 'Serializable' });
        return;
      } catch (error) {
        const retryable = isRetryableTransactionError(error);
        if (!retryable || attempt === 2) throw error;
      }
    }
  }
}
