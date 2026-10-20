import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES, type PublicUser, type UserRole } from '../user.entity.js';

export class UserResponse implements PublicUser {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'owner@shop.com' })
  email: string;

  @ApiProperty({ example: 'อนันต์ ใจดี' })
  fullName: string;

  @ApiProperty({ enum: USER_ROLES, example: 'shop_owner' })
  role: UserRole;

  @ApiProperty({ description: 'false เฉพาะ Shop Owner ที่สมัครเอง' })
  isEmployee: boolean;

  @ApiProperty()
  createdAt: Date;
}
