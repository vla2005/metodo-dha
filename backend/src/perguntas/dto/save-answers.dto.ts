import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export enum PublicAnswerResponseType {
  TEXT = 'TEXT',
  NO_RELATION = 'NO_RELATION',
  DONT_KNOW = 'DONT_KNOW',
  PREFER_NOT_TO_ANSWER = 'PREFER_NOT_TO_ANSWER',
  SKIPPED = 'SKIPPED',
}

export class SaveAnswerItemDto {
  @IsUUID()
  questionId!: string;

  @IsEnum(PublicAnswerResponseType)
  responseType!: PublicAnswerResponseType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string;
}

export class SaveAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => SaveAnswerItemDto)
  answers!: SaveAnswerItemDto[];
}
