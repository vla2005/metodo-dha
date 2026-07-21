import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
export class ImpressionDto { @ApiProperty() @IsString() @MaxLength(1000) text!: string; }

