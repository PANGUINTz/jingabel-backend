import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  SHOP_PERMISSIONS,
  SHOP_ROLES,
  type ShopPermission,
  type ShopRole,
} from '../permissions.js';

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
    enum: SHOP_PERMISSIONS,
    isArray: true,
    description: 'สิทธิ์ของผู้ใช้ปัจจุบันในร้านนี้ (ใช้ซ่อน/แสดง UI เท่านั้น)',
  })
  permissions: ShopPermission[];
}

export class MemberUserSummary {
  @ApiProperty({ example: 'aZ3kP9qL0x' })
  slug: string;

  @ApiProperty({ example: 'อนันต์ ใจดี' })
  fullName: string;

  @ApiProperty({ example: 'staff@shop.com' })
  email: string;

  @ApiProperty({ example: 'active' })
  status: string;
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

  @ApiProperty()
  joinedAt: Date;
}

export class ChangeMemberRoleDto {
  @ApiProperty({
    enum: SHOP_ROLES,
    description: 'เปลี่ยน users.role — มีผลกับทุกร้านที่ผู้ใช้เป็นสมาชิก',
  })
  @IsIn(SHOP_ROLES)
  role: ShopRole;
}
