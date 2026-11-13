import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { USER_STATUSES } from '../../users/dto/user.response.js';
import {
  SHOP_PERMISSIONS,
  SHOP_ROLES,
  type ShopPermission,
  type ShopRole,
} from '../permissions.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RoleSummary {
  @ApiProperty({ enum: SHOP_ROLES })
  key: ShopRole;

  @ApiProperty({ example: 'Shop Owner' })
  name: string;
}

export class MyShopResponse {
  @ApiProperty({ example: 'Xy7kP2qL0a' })
  slug: string;

  @ApiProperty({ example: 'ร้านกาแฟดอยคำ' })
  name: string;

  @ApiProperty({
    type: RoleSummary,
    nullable: true,
    description: 'null เมื่อเป็น platform admin',
  })
  role: RoleSummary | null;

  @ApiProperty({
    type: () => MemberBranchSummary,
    nullable: true,
    description: 'สาขาที่ผู้ใช้สังกัดในร้านนี้ — null เมื่อเป็น platform admin ที่ไม่ได้เป็นสมาชิก',
  })
  branch: MemberBranchSummary | null;

  @ApiProperty({
    enum: SHOP_PERMISSIONS,
    isArray: true,
    description: 'สิทธิ์ของผู้ใช้ปัจจุบันในร้านนี้ (ใช้ซ่อน/แสดง UI เท่านั้น)',
  })
  permissions: ShopPermission[];
}

// --- Branches ----------------------------------------------------------------

export class ShopBranchResponse {
  @ApiProperty({ example: 'Bq7kP2qL0a' })
  slug: string;

  @ApiProperty({ example: 'สาขาหลัก' })
  name: string;

  @ApiProperty()
  createdAt: Date;
}

export class RenameShopBranchDto {
  @ApiProperty({ example: 'สาขาสุขุมวิท', minLength: 2, maxLength: 60 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;
}

// --- Members -----------------------------------------------------------------

export class MemberUserSummary {
  @ApiProperty({ example: 'aZ3kP9qL0x' })
  slug: string;

  @ApiProperty({ example: 'อนันต์ ใจดี' })
  fullName: string;

  @ApiProperty({ example: 'staff@shop.com' })
  email: string;

  @ApiProperty({ enum: USER_STATUSES, example: 'active' })
  status: string;
}

export class MemberBranchSummary {
  @ApiProperty({ example: 'Bq7kP2qL0a' })
  slug: string;

  @ApiProperty({ example: 'สาขาหลัก' })
  name: string;
}

export class ShopMemberResponse {
  @ApiProperty({ type: MemberUserSummary })
  user: MemberUserSummary;

  @ApiProperty({
    type: RoleSummary,
    nullable: true,
    description: 'null เมื่อเป็น platform admin',
  })
  role: RoleSummary | null;

  @ApiProperty({ type: MemberBranchSummary })
  branch: MemberBranchSummary;

  @ApiProperty()
  joinedAt: Date;
}

export class ShopMembersPageMeta {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class ShopMembersPageResponse {
  @ApiProperty({ type: ShopMemberResponse, isArray: true })
  data: ShopMemberResponse[];

  @ApiProperty({ type: ShopMembersPageMeta })
  meta: ShopMembersPageMeta;
}

export class ShopMembersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({ description: 'ค้นหาจากชื่อหรืออีเมล' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: SHOP_ROLES })
  @IsOptional()
  @IsIn(SHOP_ROLES)
  role?: ShopRole;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];

  @ApiPropertyOptional({ description: 'ค้นหาจากสาขา' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  branch?: string;
  // @ApiPropertyOptional({ enum: USER_STATUSES })
  // @IsOptional()
  // @IsIn(USER_STATUSES)
  // status?: (typeof USER_STATUSES)[number];
}

export class ChangeMemberRoleDto {
  @ApiProperty({
    enum: SHOP_ROLES,
    description: 'เปลี่ยน users.role — มีผลกับทุกร้านที่ผู้ใช้เป็นสมาชิก',
  })
  @IsIn(SHOP_ROLES)
  role: ShopRole;
}

export const MEMBER_STATUSES = ['active', 'suspended'] as const;

export class ChangeMemberStatusDto {
  @ApiProperty({
    enum: MEMBER_STATUSES,
    description: 'เปลี่ยน users.status — มีผลกับทุกร้านที่ผู้ใช้เป็นสมาชิก',
  })
  @IsIn(MEMBER_STATUSES)
  status: (typeof MEMBER_STATUSES)[number];
}

export class InviteMemberDto {
  @ApiProperty({ example: 'staff@shop.com' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'สมชาย ใจดี', minLength: 2, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName: string;

  @ApiProperty({
    enum: SHOP_ROLES,
    description: 'ต้องต่ำกว่าบทบาทของผู้เชิญ (platform admin ยกเว้น)',
  })
  @IsIn(SHOP_ROLES)
  role: ShopRole;

  @ApiProperty({
    example: 'Bq7kP2qL0a',
    description: 'slug จาก GET /shops/{shopSlug}/branches — Branch Manager เชิญได้เฉพาะสาขาของตัวเอง',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  branchSlug: string;
}
