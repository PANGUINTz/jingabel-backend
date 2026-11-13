import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
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
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
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
import { ProfileResponse, UserResponse } from '../users/dto/user.response.js';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  type AuthUser,
} from './auth.types.js';
import { AuthResponse } from './dto/auth.response.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import {
  AcceptInvitationDto,
  InvitationPreviewResponse,
  InvitationTokenDto,
} from './dto/invitation.dto.js';
import {
  ForgotPasswordDto,
  PasswordResetPreviewResponse,
  PasswordResetTokenDto,
  ResetPasswordDto,
} from './dto/password-reset.dto.js';
import { PasswordDto, ProfileDto } from './dto/profile.dto.js';
import { SessionResponse } from '../user_sessions/dto/session.response.js';
import type { SessionClient } from '../user_sessions/user_sessions.service.js';

const CREDENTIALS_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
// Each request can send an email.
const FORGOT_PASSWORD_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(
      res,
      await this.auth.register(dto, sessionClient(req)),
    );
  }

  @ApiOperation({
    summary: 'ดูรายละเอียดคำเชิญ',
    description:
      'ใช้ token จากลิงก์ในอีเมล (ส่งใน body ไม่ใช่ URL เพื่อไม่ให้ไปอยู่ใน log). จำกัด 10 ครั้งต่อนาที',
  })
  @ApiOkResponse({ type: InvitationPreviewResponse })
  @ApiNotFoundResponse({ description: 'ลิงก์ไม่ถูกต้อง', type: ApiErrorResponse })
  @ApiGoneResponse({
    description: 'ลิงก์หมดอายุ ถูกใช้แล้ว หรือบัญชีไม่อยู่ในสถานะ pending',
    type: ApiErrorResponse,
  })
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('invitations/preview')
  previewInvitation(
    @Body() dto: InvitationTokenDto,
  ): Promise<InvitationPreviewResponse> {
    return this.auth.previewInvitation(dto.token);
  }

  @ApiOperation({
    summary: 'ยอมรับคำเชิญและตั้งรหัสผ่าน',
    description: `เปลี่ยนสถานะบัญชีจาก pending เป็น active แล้วเข้าสู่ระบบทันที — ${SETS_COOKIES}. ลิงก์ใช้ได้ครั้งเดียว. จำกัด 10 ครั้งต่อนาที`,
  })
  @ApiOkResponse({ type: AuthResponse })
  @ApiBadRequestResponse({
    description: 'ข้อมูลไม่ผ่าน validation',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({ description: 'ลิงก์ไม่ถูกต้อง', type: ApiErrorResponse })
  @ApiGoneResponse({ description: 'ลิงก์หมดอายุหรือถูกใช้แล้ว', type: ApiErrorResponse })
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('invitations/accept')
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(
      res,
      await this.auth.acceptInvitation(dto, sessionClient(req)),
    );
  }

  @ApiOperation({
    summary: 'ขอลิงก์ตั้งรหัสผ่านใหม่',
    description:
      'ตอบ 204 เสมอ ไม่บอกว่ามีบัญชีหรือไม่. บัญชี active ได้อีเมลลิงก์ตั้งรหัสผ่านใหม่, ' +
      'บัญชีที่ถูกระงับได้อีเมลแจ้งว่าถูกระงับ (ไม่มีลิงก์), บัญชี pending ไม่ได้อะไร. จำกัด 5 ครั้งต่อนาที',
  })
  @ApiNoContentResponse({ description: 'รับคำขอแล้ว' })
  @ApiBadRequestResponse({ description: 'อีเมลไม่ถูกรูปแบบ', type: ApiErrorResponse })
  @Public()
  @Throttle(FORGOT_PASSWORD_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/forgot')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.requestPasswordReset(dto.email);
  }

  @ApiOperation({
    summary: 'ตรวจลิงก์ตั้งรหัสผ่านใหม่',
    description: 'ใช้ token จากลิงก์ในอีเมล (ส่งใน body ไม่ใช่ URL). จำกัด 10 ครั้งต่อนาที',
  })
  @ApiOkResponse({ type: PasswordResetPreviewResponse })
  @ApiNotFoundResponse({ description: 'ลิงก์ไม่ถูกต้อง', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'บัญชีถูกระงับ', type: ApiErrorResponse })
  @ApiGoneResponse({ description: 'ลิงก์หมดอายุหรือถูกใช้แล้ว', type: ApiErrorResponse })
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('password/reset/preview')
  previewPasswordReset(
    @Body() dto: PasswordResetTokenDto,
  ): Promise<PasswordResetPreviewResponse> {
    return this.auth.previewPasswordReset(dto.token);
  }

  @ApiOperation({
    summary: 'ตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล',
    description:
      'ลิงก์ใช้ได้ครั้งเดียว และทุกอุปกรณ์ที่เข้าสู่ระบบอยู่จะถูกออกจากระบบ — เข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่. จำกัด 10 ครั้งต่อนาที',
  })
  @ApiNoContentResponse({ description: 'เปลี่ยนรหัสผ่านแล้ว' })
  @ApiBadRequestResponse({ description: 'ข้อมูลไม่ผ่าน validation', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'ลิงก์ไม่ถูกต้อง', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'บัญชีถูกระงับ', type: ApiErrorResponse })
  @ApiGoneResponse({ description: 'ลิงก์หมดอายุหรือถูกใช้แล้ว', type: ApiErrorResponse })
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
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
  @ApiForbiddenResponse({
    description: 'บัญชีถูกระงับ (ตอบหลังรหัสผ่านถูกต้องเท่านั้น)',
    type: ApiErrorResponse,
  })
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respondWithSession(
      res,
      await this.auth.login(dto, sessionClient(req)),
    );
  }

  @ApiOperation({
    summary: 'ขอ access token ใหม่',
    description:
      'ใช้ cookie `refresh_token` ไม่ต้องส่ง body. ตั้ง cookie `access_token` ใหม่เท่านั้น — ' +
      'refresh token เดิมใช้ต่อได้จนหมดอายุหรือออกจากระบบ',
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
      console.log(readRefreshToken(req));
      const result = await this.auth.refresh(readRefreshToken(req));
      this.setAccessCookie(
        res,
        result.accessToken,
        result.remember ? result.sessionExpiresAt - Date.now() : undefined,
      );
      return { user: result.user };
    } catch (error) {
      console.log(error);
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
  // Identified by the refresh cookie, so it must work after the access token
  // has expired — the frontend calls it without the refresh-and-retry.
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshToken(req));
    this.clearCookies(res);
  }

  @ApiOperation({
    summary: 'ออกจากระบบอุปกรณ์อื่นทั้งหมด',
    description:
      'ยกเลิกทุก session ของผู้ใช้ ยกเว้น session ของ cookie `refresh_token` ที่ส่งมา — ' +
      'อุปกรณ์อื่นจะต่อ access token ไม่ได้อีก (access token ที่ออกไปแล้วใช้ได้จนหมดอายุ)',
  })
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'ออกจากระบบอุปกรณ์อื่นแล้ว' })
  @ApiBadRequestResponse({
    description: 'ไม่มี cookie `refresh_token`',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'access token หรือ refresh token ไม่ถูกต้อง/หมดอายุ',
    type: ApiErrorResponse,
  })
  @ApiForbiddenResponse({
    description: 'refresh token เป็นของผู้ใช้คนอื่น',
    type: ApiErrorResponse,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  async logoutAll(
    @Req() req: Request,
    @CurrentUser() user: AuthUser
  ): Promise<void> {
    await this.auth.logoutAll(user.id, readRefreshToken(req));
  }

  @ApiOperation({
    summary: 'รายการอุปกรณ์ที่ login อยู่',
    description:
      'session ที่ยังไม่ถูกยกเลิกและยังไม่หมดอายุ เรียงจากใช้งานล่าสุด — ' +
      '`current` บอกว่าเป็นอุปกรณ์ที่เรียก (ดูจาก cookie `refresh_token`)',
  })
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiBearerAuth()
  @ApiOkResponse({ type: SessionResponse, isArray: true })
  @ApiUnauthorizedResponse({
    description: 'ไม่มี access token หรือหมดอายุ',
    type: ApiErrorResponse,
  })
  @Get('sessions')
  sessions(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ): Promise<SessionResponse[]> {
    return this.auth.listSessions(user.id, readRefreshToken(req));
  }

  @ApiOperation({
    summary: 'ออกจากระบบอุปกรณ์ที่เลือก',
    description:
      'ยกเลิก session ของอุปกรณ์อื่นของผู้ใช้เอง — อุปกรณ์นั้นต่อ access token ไม่ได้อีก. ' +
      'อุปกรณ์ที่เรียกอยู่ให้ใช้ `POST /auth/logout`',
  })
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'ยกเลิก session แล้ว' })
  @ApiBadRequestResponse({
    description: 'id ไม่ใช่ตัวเลข หรือเป็นอุปกรณ์ที่เรียกอยู่',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'ไม่มี access token หรือหมดอายุ',
    type: ApiErrorResponse,
  })
  @ApiNotFoundResponse({
    description: 'ไม่มี session นี้, ถูกยกเลิกแล้ว หรือเป็นของผู้ใช้อื่น',
    type: ApiErrorResponse,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('sessions/:id')
  async revokeSession(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.auth.revokeSession(user.id, id, readRefreshToken(req));
  }

  @ApiOperation({ summary: 'ข้อมูลผู้ใช้ที่ login อยู่' })
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiBearerAuth()
  @ApiOkResponse({ type: ProfileResponse })
  @ApiUnauthorizedResponse({
    description: 'ไม่มี access token หรือหมดอายุ',
    type: ApiErrorResponse,
  })
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<ProfileResponse> {
    return this.auth.getProfile(user.id);
  }

  @ApiOperation({ summary: 'อัพเดตข้อมูลที่ login อยู่' })
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserResponse })
  @ApiUnauthorizedResponse({
    description: 'ไม่มี access token หรือหมดอายุ',
    type: ApiErrorResponse,
  })
  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: ProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @ApiOperation({ summary: 'อัพเดตรหัสผ่านที่ login อยู่' })
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserResponse })
  @ApiUnauthorizedResponse({
    description: 'ไม่มี access token หรือหมดอายุ',
    type: ApiErrorResponse,
  })
  @Patch('password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: PasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  @ApiOperation({ summary: 'logout บัญชีที่เลือก' })
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE)
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserResponse })
  @ApiUnauthorizedResponse({
    description: 'ไม่มี access token หรือหมดอายุ',
    type: ApiErrorResponse,
  })
  @Patch('revoke/:refreshToken')
  Revoke(@Param('refreshToken') refreshToken: string ) {
    return this.auth.logout(refreshToken);
  }

  private respondWithSession(res: Response, result: AuthResult): AuthResponse {
    const { accessToken, refreshToken } = result.tokens;
    const maxAge = result.remember
      ? this.config.get('JWT_REFRESH_TTL', { infer: true }) * 1000
      : undefined;
    this.setAccessCookie(res, accessToken, maxAge);
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.baseCookieOptions(),
      path: '/',
      ...(maxAge !== undefined && { maxAge }),
    });
    return { user: result.user };
  }

  // Both cookies live as long as the session: without "remember me" (maxAge
  // undefined) they are session cookies, gone when the browser closes. The
  // access cookie outlives its JWT on purpose — the frontend treats a missing
  // access_token cookie as "not signed in", while an expired JWT inside it just
  // gets a 401 and a refresh.
  private setAccessCookie(
    res: Response,
    accessToken: string,
    maxAge: number | undefined,
  ): void {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.baseCookieOptions(),
      path: '/',
      ...(maxAge !== undefined && { maxAge }),
    });
  }

  private clearCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      ...this.baseCookieOptions(),
      path: '/',
    });
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.baseCookieOptions(),
      path: '/',
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

// req.ip is the proxy's address when the API sits behind one, unless Express's
// "trust proxy" is set — do that when deploying behind a load balancer.
function sessionClient(req: Request): SessionClient {
  return { userAgent: req.get('user-agent'), ipAddress: req.ip };
}

function readRefreshToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
  return typeof token === 'string' ? token : undefined;
}
