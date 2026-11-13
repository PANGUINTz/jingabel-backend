import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role, Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ACCESS_TOKEN_COOKIE, type AuthUser } from '../auth/auth.types.js';
import { ApiErrorResponse } from '../common/swagger/api-error.response.js';
import type { PublicUser } from './user.entity.js';
import { UsersService } from './users.service.js';
import {
  PaginationDto,
  UpdateUserDto,
  UserResponse,
} from './dto/user.response.js';

const ADMIN_THROTTLE = { default: { limit: 50, ttl: 60_000 } };

// Platform-admin user management. Every write is audit-logged.
@ApiTags('users')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'ไม่ใช่ admin', type: ApiErrorResponse })
@ApiTooManyRequestsResponse({
  description: 'เรียกถี่เกิน rate limit',
  type: ApiErrorResponse,
})
@Roles(Role.ADMIN)
@Throttle(ADMIN_THROTTLE)
@UseGuards(RolesGuard)
@Controller('users')
export class UserController {
  constructor(private readonly users: UsersService) {}

  @ApiOperation({ summary: 'รายชื่อผู้ใช้ทั้งระบบ (แบ่งหน้า)' })
  @ApiOkResponse({ description: '{ data: UserResponse[], meta }' })
  @Get()
  list(@Query() query: PaginationDto) {
    return this.users.usersList(query);
  }

  @ApiOperation({
    summary: 'แก้ไขชื่อ บทบาท หรือสถานะของผู้ใช้',
    description:
      'เปลี่ยนของตัวเองไม่ได้, ตั้งเป็น pending ไม่ได้, ลด Shop Owner คนสุดท้ายของร้านไม่ได้. ' +
      'ระงับบัญชีแล้วจะออกจากระบบทุกอุปกรณ์',
  })
  @ApiOkResponse({ type: UserResponse })
  @ApiBadRequestResponse({
    description: 'ข้อมูลไม่ผ่าน validation หรือบัญชียัง pending',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'ไม่พบผู้ใช้', type: ApiErrorResponse })
  @ApiConflictResponse({
    description: 'ร้านจะไม่เหลือ Shop Owner',
    type: ApiErrorResponse,
  })
  @Patch(':slug')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: UpdateUserDto,
  ): Promise<PublicUser> {
    return this.users.adminUpdate(actor.id, slug, dto);
  }

  @ApiOperation({
    summary: 'ลบบัญชีผู้ใช้',
    description: 'ลบบัญชีตัวเองไม่ได้ และลบ Shop Owner คนสุดท้ายของร้านไม่ได้',
  })
  @ApiNoContentResponse({ description: 'ลบแล้ว' })
  @ApiNotFoundResponse({ description: 'ไม่พบผู้ใช้', type: ApiErrorResponse })
  @ApiConflictResponse({
    description: 'ร้านจะไม่เหลือ Shop Owner',
    type: ApiErrorResponse,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':slug')
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('slug') slug: string,
  ): Promise<void> {
    return this.users.adminDelete(actor.id, slug);
  }
}
