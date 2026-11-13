import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Match } from '../../common/validators/match.decorator.js';
import { RoleSummary } from '../../shops/dto/shop.dto.js';

export class InvitationTokenDto {
  @ApiProperty({ description: 'token จากลิงก์ในอีเมล (?token=...)' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  token: string;
}

// Same password rules as RegisterDto.
export class AcceptInvitationDto extends InvitationTokenDto {
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

  @ApiProperty({ example: 'passw0rd123' })
  @IsString()
  @Match<AcceptInvitationDto>('password', { message: 'รหัสผ่านไม่ตรงกัน' })
  confirmPassword: string;
}

export class InvitationPreviewResponse {
  @ApiProperty({ example: 'staff@shop.com' })
  email: string;

  @ApiProperty({ example: 'สมชาย ใจดี' })
  fullName: string;

  @ApiProperty({ example: 'ร้านกาแฟดอยคำ' })
  shopName: string;

  @ApiProperty({ example: 'สาขาหลัก', nullable: true })
  branchName: string | null;

  @ApiProperty({ type: RoleSummary, nullable: true })
  role: RoleSummary | null;

  @ApiProperty()
  expiresAt: Date;
}
