import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Mirrors registerSchema in frontend/src/lib/validations/auth.ts.
export class RegisterDto {
  @ApiProperty({ example: 'ร้านกาแฟดอยคำ', minLength: 2, maxLength: 60 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  shopName: string;

  @ApiProperty({ example: 'อนันต์ ใจดี', minLength: 2, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName: string;

  @ApiProperty({ example: 'owner@shop.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'passw0rd123',
    minLength: 8,
    maxLength: 128,
    description: 'ต้องมีตัวอักษรอย่างน้อย 1 ตัวและตัวเลขอย่างน้อย 1 ตัว',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Za-z]/, { message: 'password must contain at least one letter' })
  @Matches(/[0-9]/, { message: 'password must contain at least one number' })
  password: string;
}
