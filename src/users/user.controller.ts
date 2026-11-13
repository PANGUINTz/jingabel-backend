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
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrorResponse } from '../common/swagger/api-error.response.js';
import { UsersService } from './users.service.js';
import { PaginationDto, UpdateUserDto } from './dto/user.response.js';
import { Role, Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

const CREDENTIALS_THROTTLE = { default: { limit: 50, ttl: 60_000 } };

@ApiTags('users')
@ApiTooManyRequestsResponse({
  description: 'เรียกถี่เกิน rate limit',
  type: ApiErrorResponse,
})

@Controller('users')
@UseGuards(RolesGuard) 
export class UserController {
  constructor(
    private readonly users: UsersService,
  ) {}

  @Roles(Role.ADMIN)
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Get('/')
  async GetUsersList(@Query() query: PaginationDto) {
    return this.users.usersList(query)
  }

  @Roles(Role.ADMIN)
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Patch('/:slug')
  async UpdateUser(@Param('slug') slug: string, @Body() dto: UpdateUserDto) {
    return this.users.updateUserBySlug(slug, dto)
  }

  @Roles(Role.ADMIN)
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Delete('/:slug')
  async DeleteUser(@Param('slug') slug: string) {
    return this.users.deleteUser(slug)
  }
}