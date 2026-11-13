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

export class ForgotPasswordDto {
  @ApiProperty({ example: 'staff@shop.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class PasswordResetTokenDto {
  @ApiProperty({ description: 'token จากลิงก์ในอีเมล (?token=...)' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  token: string;
}

// Same password rules as RegisterDto.
export class ResetPasswordDto extends PasswordResetTokenDto {
  @ApiProperty({
    example: 'newpassw0rd',
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

  @ApiProperty({ example: 'newpassw0rd' })
  @IsString()
  @Match<ResetPasswordDto>('password', { message: 'รหัสผ่านไม่ตรงกัน' })
  confirmPassword: string;
}

export class PasswordResetPreviewResponse {
  @ApiProperty({ example: 'staff@shop.com' })
  email: string;

  @ApiProperty()
  expiresAt: Date;
}
