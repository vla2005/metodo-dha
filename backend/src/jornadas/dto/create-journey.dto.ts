import { ApiProperty } from '@nestjs/swagger';
import { ConsentType } from '../../database/database.types';
import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';

export class ConsentDto {
  @ApiProperty({ enum: ConsentType }) @IsEnum(ConsentType) consentType!: ConsentType;
  @ApiProperty({ example: '2026-07-v1' }) @IsString() @Length(1, 32) consentVersion!: string;
  @ApiProperty() @IsBoolean() accepted!: boolean;
}
export class CreateJourneyDto {
  @ApiProperty() @IsString() @Length(2, 120) @Transform(({ value }) => String(value).trim()) name!: string;
  @ApiProperty() @IsEmail() @MaxLength(254) @Transform(({ value }) => String(value).trim().toLowerCase()) email!: string;
  @ApiProperty({ required: false, example: 'relacionamentos' }) @IsOptional() @IsString() @Length(1, 80) themeKey?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(2, 120) customTheme?: string;
  @ApiProperty() @IsString() @Length(10, 5000) circumstanceText!: string;
  @ApiProperty({ type: [ConsentDto] }) @IsArray() @ArrayMinSize(3) @ValidateNested({ each: true }) @Type(() => ConsentDto) consents!: ConsentDto[];
}
