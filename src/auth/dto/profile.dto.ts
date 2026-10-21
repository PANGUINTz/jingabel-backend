import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Mirrors registerSchema in frontend/src/lib/validations/auth.ts.
export class ProfileDto {
  @ApiProperty({ example: 'อนันต์ ใจดี', minLength: 2, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName: string;

  @ApiProperty({ example: 'owner@shop.com' })
  @IsEmail()
  email: string;
}
