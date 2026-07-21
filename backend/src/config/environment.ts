import { plainToInstance, Type } from 'class-transformer';
import { IsBooleanString, IsEnum, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

enum Environment { Development = 'development', Test = 'test', Production = 'production' }
enum AiProviderMode { Auto = 'auto', Gemini = 'gemini', Demo = 'demo' }
class EnvironmentVariables {
  @IsEnum(Environment) NODE_ENV: Environment = Environment.Development;
  @Type(() => Number) @IsInt() @Min(1) PORT: number = 3000;
  @IsString() API_PREFIX = 'api';
  @IsString() FRONTEND_ORIGINS = 'http://localhost:5173';
  @IsString() DATABASE_URL!: string;
  @Type(() => Number) @IsInt() @Min(1) DATABASE_POOL_MAX: number = 10;
  @IsBooleanString() DATABASE_AUTO_SCHEMA = 'true';
  @IsOptional() @IsString() DATABASE_SCHEMA_PATH?: string;
  @IsString() CARD_IMAGES_DIR = '../imagens';
  @IsString() CATALOG_DIR = 'catalog';
  @IsString() PUBLIC_SESSION_COOKIE_NAME = 'dha_session';
  @Type(() => Number) @IsInt() @Min(1) PUBLIC_SESSION_TTL_HOURS: number = 72;
  @IsBooleanString() PUBLIC_SESSION_COOKIE_SECURE = 'false';
  @IsString() PUBLIC_SESSION_COOKIE_SAME_SITE = 'lax';
  @IsEnum(AiProviderMode) AI_PROVIDER: AiProviderMode = AiProviderMode.Auto;
  @IsOptional() @IsString() GEMINI_API_KEY?: string;
  @IsString() GEMINI_MODEL = 'gemini-3.1-flash-lite';
  @Type(() => Number) @IsInt() @Min(1) GEMINI_DAILY_HARD_LIMIT: number = 500;
  @Type(() => Number) @IsInt() @Min(1) GEMINI_DAILY_OPERATIONAL_LIMIT: number = 450;
  @Type(() => Number) @IsInt() @Min(1000) GEMINI_TIMEOUT_MS: number = 30000;
  @Type(() => Number) @IsInt() @Min(0) GEMINI_MAX_RETRIES: number = 1;
  @Type(() => Number) @IsInt() @Min(256) GEMINI_MAX_OUTPUT_TOKENS: number = 4096;
  @IsString() GEMINI_PROMPT_VERSION = 'questions-v2';
  @IsString() GEMINI_SCHEMA_VERSION = 'questions-v2';
  @IsString() GEMINI_ANALYSIS_PROMPT_VERSION = 'analysis-v2';
  @IsString() GEMINI_ANALYSIS_SCHEMA_VERSION = 'analysis-v2';
}
export function validateEnvironment(input: Record<string, unknown>): EnvironmentVariables {
  const value = plainToInstance(EnvironmentVariables, input, { enableImplicitConversion: true });
  const errors = validateSync(value, { skipMissingProperties: false });
  if (errors.length) throw new Error(`Configuração inválida: ${errors.map((error) => error.property).join(', ')}`);
  if (value.GEMINI_DAILY_OPERATIONAL_LIMIT > value.GEMINI_DAILY_HARD_LIMIT) {
    throw new Error('Configuração inválida: GEMINI_DAILY_OPERATIONAL_LIMIT deve ser menor ou igual a GEMINI_DAILY_HARD_LIMIT.');
  }
  if (value.AI_PROVIDER === AiProviderMode.Gemini && !value.GEMINI_API_KEY?.trim()) {
    throw new Error('Configuração inválida: GEMINI_API_KEY é obrigatória quando AI_PROVIDER=gemini.');
  }
  return value;
}
