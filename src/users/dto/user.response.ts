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

  @ApiProperty({ description: 'สถานะ' })
  status: string

  @ApiProperty()
  createdAt: Date;
}

export class ProfileShopSummary {
  @ApiProperty({ example: 'Xy7kP2qL0a' })
  slug: string;

  @ApiProperty({ example: 'ร้านกาแฟดอยคำ' })
  name: string;
}

export class ProfileBranchSummary {
  @ApiProperty({ example: 'Bq7kP2qL0a' })
  slug: string;

  @ApiProperty({ example: 'สาขาหลัก' })
  name: string;
}

// GET /auth/me: the profile plus where the user works, from shop_members →
// shops / shop_branches. The UI is single-shop: the oldest membership.
export class ProfileResponse extends UserResponse {
  @ApiProperty({
    type: ProfileShopSummary,
    nullable: true,
    description: 'ร้านที่เป็นสมาชิก (ร้านแรก) — null สำหรับ platform admin ที่ไม่ได้เป็นสมาชิกร้าน',
  })
  shop: ProfileShopSummary | null;

  @ApiProperty({
    type: ProfileBranchSummary,
    nullable: true,
    description: 'สาขาที่สังกัดในร้านนั้น',
  })
  branch: ProfileBranchSummary | null;

  @ApiProperty({
    type: ProfileBranchSummary,
    isArray: true,
    description:
      'สาขาที่สลับไปดูได้ — Shop Owner ได้ทุกสาขาของร้าน (เรียงตามวันที่สร้าง), บทบาทอื่นได้เฉพาะสาขาของตัวเอง',
  })
  branches: ProfileBranchSummary[];
}

// pending = invited, hasn't accepted the emailed link (set a password) yet.
export const USER_STATUSES = ['active', 'pending', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

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