import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Match } from '../../common/validators/match.decorator.js';

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
export class PasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Za-z]/, { message: 'current password must contain at least one letter' })
  @Matches(/[0-9]/, { message: 'current password must contain at least one number' })
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Za-z]/, { message: 'new password must contain at least one letter' })
  @Matches(/[0-9]/, { message: 'new password must contain at least one number' })
  newPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Za-z]/, {
    message: 'password must contain at least one letter',
  })
  @Matches(/[0-9]/, {
    message: 'password must contain at least one number',
  })
  @Match('newPassword', {
    message: 'confirm password must match new password',
  })
  confirmPassword: string;
}
