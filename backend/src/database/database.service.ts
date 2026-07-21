/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import type {
  AiOperationRecord,
  AiQuotaReservationRecord,
  JourneyRecord,
  JourneySetRecord,
  PublicAccessSessionRecord,
  ReflectiveAnswerRecord,
  ReflectiveQuestionRecord,
} from './database.types';

types.setTypeParser(1114, (value: string) => new Date(`${value}Z`));

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;
type ModelName = keyof typeof MODEL_DEFINITIONS;

interface ModelDefinition {
  table: string;
  columns: readonly string[];
  updatedAt?: boolean;
}

const MODEL_DEFINITIONS = {
  journey: {
    table: 'Journey',
    columns: [
      'id', 'publicId', 'status', 'currentStep', 'catalogVersion', 'themeKey',
      'customTheme', 'circumstanceText', 'createdAt', 'updatedAt', 'completedAt',
    ],
    updatedAt: true,
  },
  journeyContact: {
    table: 'JourneyContact',
    columns: ['id', 'journeyId', 'name', 'email', 'emailNormalized', 'createdAt', 'updatedAt'],
    updatedAt: true,
  },
  consent: {
    table: 'Consent',
    columns: [
      'id', 'journeyId', 'consentType', 'consentVersion', 'accepted',
      'acceptedAt', 'ipHash', 'userAgentHash',
    ],
  },
  journeySet: {
    table: 'JourneySet',
    columns: [
      'id', 'journeyId', 'position', 'movement', 'wordKey', 'imageKey',
      'initialImpression', 'wordDrawnAt', 'imageDrawnAt', 'createdAt', 'updatedAt',
    ],
    updatedAt: true,
  },
  publicAccessSession: {
    table: 'PublicAccessSession',
    columns: ['id', 'journeyId', 'tokenHash', 'expiresAt', 'revokedAt', 'createdAt', 'lastSeenAt'],
  },
  auditLog: {
    table: 'AuditLog',
    columns: ['id', 'journeyId', 'action', 'entityType', 'entityId', 'metadata', 'createdAt'],
  },
  aiOperation: {
    table: 'AiOperation',
    columns: [
      'id', 'journeyId', 'type', 'idempotencyKey', 'inputHash', 'provider',
      'promptVersion', 'schemaVersion', 'model', 'status', 'requestCount',
      'promptTokens', 'outputTokens', 'thoughtTokens', 'totalTokens', 'latencyMs',
      'providerErrorCode', 'providerRequestId', 'resultJson', 'createdAt', 'startedAt',
      'updatedAt', 'completedAt',
    ],
    updatedAt: true,
  },
  aiDailyQuota: {
    table: 'AiDailyQuota',
    columns: [
      'id', 'provider', 'model', 'quotaDatePacific', 'operationalLimit',
      'reservedCount', 'sentCount', 'failedCount', 'updatedAt',
    ],
    updatedAt: true,
  },
  aiQuotaReservation: {
    table: 'AiQuotaReservation',
    columns: [
      'id', 'quotaId', 'operationId', 'attemptStartedAt', 'status',
      'createdAt', 'finalizedAt', 'journeySetId',
    ],
  },
  reflectiveQuestion: {
    table: 'ReflectiveQuestion',
    columns: [
      'id', 'journeyId', 'journeySetId', 'aiOperationId', 'type', 'stepNumber',
      'displayOrder', 'text', 'createdAt', 'updatedAt',
    ],
    updatedAt: true,
  },
  reflectiveAnswer: {
    table: 'ReflectiveAnswer',
    columns: [
      'id', 'journeyId', 'questionId', 'responseType', 'text', 'createdAt', 'updatedAt',
    ],
    updatedAt: true,
  },
} as const satisfies Record<string, ModelDefinition>;

const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

export class ModelDelegate<T extends object = Record<string, unknown>> {
  constructor(
    private readonly model: ModelName,
    private readonly queryable: Queryable,
    private readonly client: DatabaseClient,
  ) {}

  async findUnique(args: any): Promise<T | null> {
    return this.findFirst(args);
  }

  async findFirst(args: any): Promise<T | null> {
    const rows = await this.findMany({ ...args, take: 1 });
    return rows[0] ?? null;
  }

  async findMany(args: any = {}): Promise<T[]> {
    const definition = MODEL_DEFINITIONS[this.model];
    const values: unknown[] = [];
    const where = buildWhere(this.model, args.where ?? {}, values, 't');
    const order = buildOrder(args.orderBy, definition);
    const limit = typeof args.take === 'number' ? ` LIMIT ${Math.max(0, Math.trunc(args.take))}` : '';
    const result = await this.queryable.query(
      `SELECT t.* FROM ${quote(definition.table)} t${where}${order}${limit}`,
      values,
    );
    const loaded = await Promise.all(
      result.rows.map((row) => this.loadRelations(row, args)),
    );
    return loaded.map((row) => applySelect(row, args.select)) as T[];
  }

  async create(args: any): Promise<T> {
    if (this.model === 'journey') return this.createJourney(args);
    const row = await this.insert(args.data);
    const loaded = await this.loadRelations(row, args);
    return applySelect(loaded, args.select) as T;
  }

  async createMany(args: any): Promise<{ count: number }> {
    const data = Array.isArray(args.data) ? args.data : [args.data];
    for (const item of data) await this.insert(item);
    return { count: data.length };
  }

  async update(args: any): Promise<T> {
    const rows = await this.updateRows(args.where, args.data, true);
    if (rows.length !== 1) throw new Error(`${MODEL_DEFINITIONS[this.model].table.toUpperCase()}_NOT_FOUND`);
    const loaded = await this.loadRelations(rows[0], args);
    return applySelect(loaded, args.select) as T;
  }

  async updateMany(args: any): Promise<{ count: number }> {
    const rows = await this.updateRows(args.where, args.data, false);
    return { count: rows.length };
  }

  async upsert(args: any): Promise<T> {
    if (this.model !== 'reflectiveAnswer') {
      throw new Error(`UPSERT_NOT_SUPPORTED_${this.model}`);
    }
    const create = withGeneratedFields(this.model, args.create);
    const update = normalizeData(args.update);
    const columns = Object.keys(create);
    const values = columns.map((column) => create[column]);
    const updateColumns = Object.keys(update);
    const updateSql = updateColumns.map((column, index) =>
      `${quote(column)} = $${values.length + index + 1}`,
    );
    values.push(...updateColumns.map((column) => update[column]));
    if (!updateColumns.includes('updatedAt')) updateSql.push('"updatedAt" = NOW()');
    const result = await this.queryable.query(
      `INSERT INTO "ReflectiveAnswer" (${columns.map(quote).join(', ')})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
       ON CONFLICT ("questionId") DO UPDATE SET ${updateSql.join(', ')}
       RETURNING *`,
      values,
    );
    return applySelect(result.rows[0], args.select) as T;
  }

  async count(args: any = {}): Promise<number> {
    const values: unknown[] = [];
    const where = buildWhere(this.model, args.where ?? {}, values, 't');
    const result = await this.queryable.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quote(MODEL_DEFINITIONS[this.model].table)} t${where}`,
      values,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async insert(input: Record<string, unknown>): Promise<any> {
    const data = withGeneratedFields(this.model, input);
    const columns = Object.keys(data);
    assertKnownColumns(this.model, columns);
    const result = await this.queryable.query(
      `INSERT INTO ${quote(MODEL_DEFINITIONS[this.model].table)}
       (${columns.map(quote).join(', ')})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      columns.map((column) => data[column]),
    );
    return result.rows[0];
  }

  private async updateRows(whereInput: any, dataInput: any, one: boolean): Promise<any[]> {
    const definition = MODEL_DEFINITIONS[this.model];
    const data = normalizeData(dataInput);
    const values: unknown[] = [];
    const sets: string[] = [];
    for (const [column, value] of Object.entries(data)) {
      assertKnownColumns(this.model, [column]);
      if (isCounterOperation(value)) {
        const amount = value.increment ?? value.decrement ?? 0;
        values.push(amount);
        sets.push(`${quote(column)} = ${quote(column)} ${value.increment !== undefined ? '+' : '-'} $${values.length}`);
      } else {
        values.push(value);
        sets.push(`${quote(column)} = $${values.length}`);
      }
    }
    if ('updatedAt' in definition && definition.updatedAt && !Object.hasOwn(data, 'updatedAt')) {
      sets.push('"updatedAt" = NOW()');
    }
    if (sets.length === 0) return [];
    const where = buildWhere(this.model, whereInput ?? {}, values, quote(definition.table));
    const result = await this.queryable.query(
      `UPDATE ${quote(definition.table)} SET ${sets.join(', ')}${where} RETURNING *`,
      values,
    );
    if (one && result.rows.length > 1) throw new Error('UPDATE_RETURNED_MULTIPLE_ROWS');
    return result.rows;
  }

  private async createJourney(args: any): Promise<T> {
    const nestedKeys = new Set(['contact', 'consents', 'sessions', 'audits']);
    const data = Object.fromEntries(
      Object.entries(args.data as Record<string, unknown>).filter(([key]) => !nestedKeys.has(key)),
    );
    const journey = await this.insert(data);
    const nested = args.data as Record<string, any>;
    if (nested.contact?.create) {
      await this.client.journeyContact.create({
        data: { journeyId: journey.id, ...nested.contact.create },
      });
    }
    for (const consent of asCreateList(nested.consents)) {
      await this.client.consent.create({ data: { journeyId: journey.id, ...consent } });
    }
    for (const session of asCreateList(nested.sessions)) {
      await this.client.publicAccessSession.create({ data: { journeyId: journey.id, ...session } });
    }
    for (const audit of asCreateList(nested.audits)) {
      await this.client.auditLog.create({ data: { journeyId: journey.id, ...audit } });
    }
    const loaded = await this.loadRelations(journey, args);
    return applySelect(loaded, args.select) as T;
  }

  private async loadRelations(row: any, args: any): Promise<any> {
    if (!row) return row;
    const include = args.include ?? {};
    const select = args.select ?? {};
    const result = { ...row };

    if (this.model === 'journey') {
      const setsArgs = relationArgs(include.sets ?? select.sets);
      if (setsArgs) {
        result.sets = await this.client.journeySet.findMany({
          where: { journeyId: row.id },
          ...setsArgs,
        });
      }
      const questionsArgs = relationArgs(include.reflectiveQuestions ?? select.reflectiveQuestions);
      if (questionsArgs) {
        result.reflectiveQuestions = await this.client.reflectiveQuestion.findMany({
          where: { journeyId: row.id },
          ...questionsArgs,
        });
      }
    }

    if (this.model === 'aiOperation') {
      const questionsArgs = relationArgs(include.reflectiveQuestions ?? select.reflectiveQuestions);
      if (questionsArgs) {
        result.reflectiveQuestions = await this.client.reflectiveQuestion.findMany({
          where: { aiOperationId: row.id },
          ...questionsArgs,
        });
      }
    }

    if (this.model === 'reflectiveQuestion') {
      const answerArgs = relationArgs(include.answer ?? select.answer);
      if (answerArgs) {
        result.answer = await this.client.reflectiveAnswer.findFirst({
          where: { questionId: row.id },
          ...answerArgs,
        });
      }
    }

    if (this.model === 'journeySet') {
      const journeyArgs = relationArgs(include.journey ?? select.journey);
      if (journeyArgs) {
        result.journey = await this.client.journey.findFirst({
          where: { id: row.journeyId },
          ...journeyArgs,
        });
      }
    }

    return result;
  }
}

export class DatabaseClient {
  readonly journey: ModelDelegate<JourneyRecord>;
  readonly journeyContact: ModelDelegate;
  readonly consent: ModelDelegate;
  readonly journeySet: ModelDelegate<JourneySetRecord>;
  readonly publicAccessSession: ModelDelegate<PublicAccessSessionRecord>;
  readonly auditLog: ModelDelegate;
  readonly aiOperation: ModelDelegate<AiOperationRecord>;
  readonly aiDailyQuota: ModelDelegate;
  readonly aiQuotaReservation: ModelDelegate<AiQuotaReservationRecord>;
  readonly reflectiveQuestion: ModelDelegate<ReflectiveQuestionRecord>;
  readonly reflectiveAnswer: ModelDelegate<ReflectiveAnswerRecord>;

  constructor(protected readonly queryable: Queryable) {
    this.journey = new ModelDelegate<JourneyRecord>('journey', queryable, this);
    this.journeyContact = new ModelDelegate('journeyContact', queryable, this);
    this.consent = new ModelDelegate('consent', queryable, this);
    this.journeySet = new ModelDelegate<JourneySetRecord>('journeySet', queryable, this);
    this.publicAccessSession = new ModelDelegate<PublicAccessSessionRecord>('publicAccessSession', queryable, this);
    this.auditLog = new ModelDelegate('auditLog', queryable, this);
    this.aiOperation = new ModelDelegate<AiOperationRecord>('aiOperation', queryable, this);
    this.aiDailyQuota = new ModelDelegate('aiDailyQuota', queryable, this);
    this.aiQuotaReservation = new ModelDelegate<AiQuotaReservationRecord>('aiQuotaReservation', queryable, this);
    this.reflectiveQuestion = new ModelDelegate<ReflectiveQuestionRecord>('reflectiveQuestion', queryable, this);
    this.reflectiveAnswer = new ModelDelegate<ReflectiveAnswerRecord>('reflectiveAnswer', queryable, this);
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.queryable.query<T>(text, values);
    return result.rows;
  }
}

@Injectable()
export class DatabaseService extends DatabaseClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    const pool = new Pool({
      connectionString: normalizeConnectionString(config.getOrThrow<string>('DATABASE_URL')),
      max: config.get<number>('DATABASE_POOL_MAX', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    super(pool);
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query('SELECT 1');
    if (this.config.get<string>('DATABASE_AUTO_SCHEMA', 'true') === 'true') {
      await this.initializeSchema();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async transaction<T>(
    callback: (transaction: DatabaseClient) => Promise<T>,
    options?: { isolationLevel?: 'Serializable' | 'ReadCommitted' },
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      const isolation = options?.isolationLevel === 'Serializable'
        ? 'SERIALIZABLE'
        : 'READ COMMITTED';
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      const result = await callback(new DatabaseClient(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async $transaction<T>(
    callback: (transaction: DatabaseClient) => Promise<T>,
    options?: { isolationLevel?: 'Serializable' | 'ReadCommitted' },
  ): Promise<T> {
    return this.transaction(callback, options);
  }

  private async initializeSchema(): Promise<void> {
    const exists = await this.pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public."Journey"') IS NOT NULL AS exists`,
    );
    if (!exists.rows[0]?.exists) {
      const sql = await this.readSchemaSql();
      await this.pool.query(sql);
      return;
    }

    await this.pool.query(`
      ALTER TABLE "AiQuotaReservation"
      ADD COLUMN IF NOT EXISTS "journeySetId" UUID;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'AiQuotaReservation_journeySetId_fkey'
        ) THEN
          ALTER TABLE "AiQuotaReservation"
          ADD CONSTRAINT "AiQuotaReservation_journeySetId_fkey"
          FOREIGN KEY ("journeySetId") REFERENCES "JourneySet"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
  }

  private async readSchemaSql(): Promise<string> {
    const configured = this.config.get<string>('DATABASE_SCHEMA_PATH')?.trim();
    const candidates = configured
      ? [resolve(configured)]
      : [resolve('sql/schema.sql'), resolve('backend/sql/schema.sql')];
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        return await readFile(candidate, 'utf8');
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('DATABASE_SCHEMA_FILE_NOT_FOUND');
  }
}

function buildWhere(
  model: ModelName,
  input: Record<string, any>,
  values: unknown[],
  alias: string,
): string {
  const conditions: string[] = [];
  const definition = MODEL_DEFINITIONS[model];
  const reference = alias.startsWith('"') ? alias : quote(alias);

  for (const [rawColumn, rawValue] of Object.entries(input)) {
    if (rawColumn === 'operationId_attemptStartedAt') {
      const compound = rawValue as Record<string, unknown>;
      conditions.push(equality(reference, 'operationId', compound.operationId, values));
      conditions.push(equality(reference, 'attemptStartedAt', compound.attemptStartedAt, values));
      continue;
    }
    if (model === 'journeySet' && rawColumn === 'journey') {
      const nestedValues: unknown[] = [];
      const nested = buildWhere('journey', rawValue as Record<string, any>, nestedValues, 'j');
      const offsetNested = nested.replace(/^ WHERE /, ' AND ').replace(/\$(\d+)/g, (_, index: string) =>
        `$${values.length + Number(index)}`,
      );
      values.push(...nestedValues);
      conditions.push(
        `EXISTS (SELECT 1 FROM "Journey" "j" WHERE "j"."id" = ${reference}."journeyId"${offsetNested})`,
      );
      continue;
    }
    if (!definition.columns.includes(rawColumn as never)) {
      throw new Error(`UNKNOWN_WHERE_COLUMN_${definition.table}_${rawColumn}`);
    }
    const column = `${reference}.${quote(rawColumn)}`;
    if (isFilterObject(rawValue)) {
      if (Object.hasOwn(rawValue, 'not')) {
        const notValue = rawValue.not;
        if (notValue === null) conditions.push(`${column} IS NOT NULL`);
        else {
          values.push(notValue);
          conditions.push(`${column} <> $${values.length}`);
        }
      }
      if (Object.hasOwn(rawValue, 'in')) {
        const list = rawValue.in as unknown[];
        if (list.length === 0) conditions.push('FALSE');
        else {
          values.push(list);
          conditions.push(`${column} = ANY($${values.length})`);
        }
      }
      if (Object.hasOwn(rawValue, 'gt')) {
        values.push(rawValue.gt);
        conditions.push(`${column} > $${values.length}`);
      }
      continue;
    }
    conditions.push(equality(reference, rawColumn, rawValue, values));
  }

  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
}

function equality(reference: string, column: string, value: unknown, values: unknown[]): string {
  if (value === null) return `${reference}.${quote(column)} IS NULL`;
  values.push(value);
  return `${reference}.${quote(column)} = $${values.length}`;
}

function buildOrder(input: any, definition: ModelDefinition): string {
  if (!input || typeof input !== 'object') return '';
  const parts = Object.entries(input).map(([column, direction]) => {
    if (!definition.columns.includes(column)) {
      throw new Error(`UNKNOWN_ORDER_COLUMN_${definition.table}_${column}`);
    }
    return `t.${quote(column)} ${direction === 'desc' ? 'DESC' : 'ASC'}`;
  });
  return parts.length ? ` ORDER BY ${parts.join(', ')}` : '';
}

function applySelect(row: any, select?: Record<string, any>): any {
  if (!select) return row;
  const selected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(select)) {
    if (!value) continue;
    if (value === true) selected[key] = row[key];
    else if (row[key] !== undefined) selected[key] = applySelect(row[key], value.select);
  }
  return selected;
}

function relationArgs(value: any): Record<string, unknown> | null {
  if (!value) return null;
  return value === true ? {} : value;
}

function withGeneratedFields(model: ModelName, input: Record<string, unknown>): Record<string, unknown> {
  const definition = MODEL_DEFINITIONS[model];
  const data = normalizeData(input);
  if (!Object.hasOwn(data, 'id')) data.id = randomUUID();
  if ('updatedAt' in definition && definition.updatedAt && !Object.hasOwn(data, 'updatedAt')) {
    data.updatedAt = new Date();
  }
  return data;
}

function normalizeData(input: Record<string, unknown>): Record<string, any> {
  return Object.fromEntries(Object.entries(input));
}

function assertKnownColumns(model: ModelName, columns: string[]): void {
  const definition = MODEL_DEFINITIONS[model];
  for (const column of columns) {
    if (!definition.columns.includes(column as never)) {
      throw new Error(`UNKNOWN_DATA_COLUMN_${definition.table}_${column}`);
    }
  }
}

function isFilterObject(value: unknown): value is Record<string, any> {
  return !!value
    && typeof value === 'object'
    && !(value instanceof Date)
    && (Object.hasOwn(value, 'not') || Object.hasOwn(value, 'in') || Object.hasOwn(value, 'gt'));
}

function isCounterOperation(value: unknown): value is { increment?: number; decrement?: number } {
  return !!value
    && typeof value === 'object'
    && (Object.hasOwn(value, 'increment') || Object.hasOwn(value, 'decrement'));
}

function asCreateList(value: any): Array<Record<string, unknown>> {
  if (!value?.create) return [];
  return Array.isArray(value.create) ? value.create : [value.create];
}

function normalizeConnectionString(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.delete('schema');
    return url.toString();
  } catch {
    return value;
  }
}
