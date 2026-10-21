import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { QueryFailedError } from 'typeorm';
import { Env } from '../config/env.js';
import {
  toPublicUser,
  type PublicUser,
  type User,
} from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenPair,
} from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RefreshSessionStore } from './refresh-session.store.js';
import { ProfileDto } from './dto/profile.dto.js';

const EMAIL_TAKEN_MESSAGE = 'อีเมลนี้ถูกใช้งานแล้ว';
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
  remember: boolean;
}

export interface RefreshResult {
  user: PublicUser;
  accessToken: string;
  remember: boolean;
  // When the session (and its refresh token) ends, in ms since the epoch.
  sessionExpiresAt: number;
}

@Injectable()
export class AuthService {
  // Verified against when the email is unknown, so login takes the same time
  // whether or not the account exists.
  private readonly dummyHash = argon2.hash(randomUUID());

  constructor(
    private readonly users: UsersService,
    private readonly sessions: RefreshSessionStore,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    }

    // TODO: create the Shop from dto.shopName once the shop schema exists.
    const user = await this.users
      .create({
        email: dto.email,
        fullName: dto.fullName,
        passwordHash: await argon2.hash(dto.password),
        role: 'shop_owner',
        isEmployee: false,
      })
      .catch((error: unknown) => {
        // Two concurrent registrations can both pass the check above.
        if (isUniqueViolation(error)) {
          throw new ConflictException(EMAIL_TAKEN_MESSAGE);
        }
        throw error;
      });

    return this.startSession(user, false);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    return this.startSession(user, dto.remember ?? false);
  }

  // Issues a new access token only. The refresh token is not rotated: it stays
  // valid until it expires or its session is deleted by logout.
  async refresh(refreshToken: string | undefined): Promise<RefreshResult> {
    console.log(refreshToken);
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.sessions.get(payload.sid);
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      await this.sessions.delete(payload.sid);
      throw new UnauthorizedException();
    }

    return {
      user: toPublicUser(user),
      accessToken: await this.signAccessToken(user),
      remember: session.remember,
      sessionExpiresAt: session.expiresAt,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken).catch(
      () => undefined,
    );
    if (payload) await this.sessions.delete(payload.sid);
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return toPublicUser(user);
  }

  async updateProfile(userId: string, body: ProfileDto) {
    return this.users.update(userId, body)
  }

  private startSession(user: User, remember: boolean): Promise<AuthResult> {
    return this.issueTokens(user, randomUUID(), remember);
  }

  private async issueTokens(
    user: User,
    sid: string,
    remember: boolean,
  ): Promise<AuthResult> {
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const refreshPayload: RefreshTokenPayload = { sub: user.id, sid };

    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: refreshTtl,
      }),
    ]);

    await this.sessions.set(sid, {
      userId: user.id,
      remember,
      expiresAt: Date.now() + refreshTtl * 1000,
    });

    return {
      user: toPublicUser(user),
      tokens: { accessToken, refreshToken },
      remember,
    };
  }

  private signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  private async verifyRefreshToken(
    token: string | undefined,
  ): Promise<RefreshTokenPayload> {
    if (!token) throw new UnauthorizedException();
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException();
    }
  }
}
