import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { ApiErrorResponse } from '../common/swagger/api-error.response.js';
import { Env } from '../config/env.js';
import { UserResponse } from '../users/dto/user.response.js';
import type { PublicUser } from '../users/user.entity.js';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  type AuthUser,
} from './auth.types.js';
import { AuthResponse } from './dto/auth.response.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

// The refresh token is only ever sent to the auth endpoints.
const REFRESH_COOKIE_PATH = '/api/auth';

const CREDENTIALS_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

const SETS_COOKIES =
  'ตั้ง cookie `access_token` และ `refresh_token` (httpOnly) — token ไม่อยู่ใน response body';

@ApiTags('auth')
@ApiTooManyRequestsResponse({
  description: 'เรียกถี่เกิน rate limit',
  type: ApiErrorResponse,
})
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @ApiOperation({
    summary: 'สมัครเป็น Shop Owner',
    description: `${SETS_COOKIES}. จำกัด 10 ครั้งต่อนาที`,
  })
  @ApiCreatedResponse({ type: AuthResponse })
  @ApiBadRequestResponse({
    description: 'ข้อมูลไม่ผ่าน validation',
    type: ApiErrorResponse,
  })
  @ApiConflictResponse({
    description: 'อีเมลนี้ถูกใช้งานแล้ว',
    type: ApiErrorResponse,
  })
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(res, await this.auth.register(dto));
  }

  @ApiOperation({
    summary: 'เข้าสู่ระบบ',
    description: `${SETS_COOKIES}. จำกัด 10 ครั้งต่อนาที`,
  })
  @ApiOkResponse({ type: AuthResponse })
  @ApiBadRequestResponse({
    description: 'ข้อมูลไม่ผ่าน validation',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    type: ApiErrorResponse,
  })
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(res, await this.auth.login(dto));
  }

  @ApiOperation({
    summary: 'ขอ token คู่ใหม่',
    description:
      'ใช้ cookie `refresh_token` ไม่ต้องส่ง body. refresh token เดิมใช้ไม่ได้อีก; ' +
      'ถ้านำตัวเก่ามาใช้ซ้ำ ทุก session ของผู้ใช้นั้นจะถูกยกเลิก. ' +
      `${SETS_COOKIES}`,
  })
  @ApiOkResponse({ type: AuthResponse })
  @ApiUnauthorizedResponse({
    description:
      'ไม่มี refresh token, หมดอายุ หรือถูกยกเลิกแล้ว — cookie ถูกล้าง',
    type: ApiErrorResponse,
  })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      const result = await this.auth.refresh(readRefreshToken(req));
      return this.respondWithSession(res, result);
    } catch (error) {
      this.clearCookies(res);
      throw error;
    }
  }

  @ApiOperation({
    summary: 'ออกจากระบบ',
    description:
      'ยกเลิก session ของ cookie `refresh_token` และล้าง cookie ทั้งสอง. สำเร็จเสมอแม้ไม่ได้ login',
  })
  @ApiNoContentResponse({ description: 'ออกจากระบบแล้ว' })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshToken(req));
    this.clearCookies(res);
  }

  @ApiOperation({ summary: 'ข้อมูลผู้ใช้ที่ login อยู่' })
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserResponse })
  @ApiUnauthorizedResponse({
    description: 'ไม่มี access token หรือหมดอายุ',
    type: ApiErrorResponse,
  })
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.auth.getProfile(user.id);
  }

  private respondWithSession(res: Response, result: AuthResult): AuthResponse {
    const { accessToken, refreshToken } = result.tokens;
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.baseCookieOptions(),
      path: '/',
      maxAge: this.config.get('JWT_ACCESS_TTL', { infer: true }) * 1000,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.baseCookieOptions(),
      path: REFRESH_COOKIE_PATH,
      // Without "remember me" this is a session cookie, gone when the browser closes.
      ...(result.remember && {
        maxAge: this.config.get('JWT_REFRESH_TTL', { infer: true }) * 1000,
      }),
    });
    return { user: result.user };
  }

  private clearCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      ...this.baseCookieOptions(),
      path: '/',
    });
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.baseCookieOptions(),
      path: REFRESH_COOKIE_PATH,
    });
  }

  private baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
    };
  }
}

function readRefreshToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
  return typeof token === 'string' ? token : undefined;
}
