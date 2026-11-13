import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES, type PublicUser, type UserRole } from '../user.entity.js';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, MinLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UserResponse implements PublicUser {
  @ApiProperty({
    example: 'aZ3kP9qL0x',
    pattern: '^[A-Za-z0-9]{10}$',
    description: 'รหัสอ้างอิงผู้ใช้ (ใช้แทน id)',
  })
  slug: string;

  @ApiProperty({ example: 'owner@shop.com' })
  email: string;

  @ApiProperty({ example: 'อนันต์ ใจดี' })
  fullName: string;

  @ApiProperty({
    enum: USER_ROLES,
    example: 'shop_owner',
    description: 'บทบาทระดับแพลตฟอร์ม — บทบาทในร้านดูที่ GET /shops/mine',
  })
  role: UserRole;

  @ApiProperty({ description: 'false เฉพาะ Shop Owner ที่สมัครเอง' })
  isEmployee: boolean;

  @ApiProperty({ description: 'สถานะ' })
  status: string

  @ApiProperty()
  createdAt: Date;
}

export const USER_STATUSES = ['active', 'invited', 'suspended'] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName: string

  @IsOptional()
  @IsIn(USER_ROLES)
  role: UserRole

  @IsOptional()
  @IsString()
  branchId: string

  @IsOptional()
  @IsIn(USER_STATUSES)
  status: string
}

export class PaginationDto {
  @ApiProperty({ example: '10' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number

  @ApiProperty({ example: '1' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number

  @ApiProperty({ example: '1' })
  @IsOptional()
  @IsString()
  search: string

  @ApiProperty({ example: '1' })
  @IsOptional()
  shop: string

  @ApiProperty({ example: '1' })
  @IsOptional()
  branch: string

  @ApiProperty({ example: '1' })
  @IsOptional()
  role: string

  @ApiProperty({ example: '1' })
  @IsOptional()
  status: string
}