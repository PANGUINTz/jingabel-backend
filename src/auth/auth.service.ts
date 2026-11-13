import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { DataSource, QueryFailedError } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ShopsService, toRoleSummary } from '../shops/shops.service.js';
import { ShopBranch } from '../shops/entities/shop-branch.entity.js';
import { ShopMember } from '../shops/entities/shop-member.entity.js';
import type { ProfileResponse } from '../users/dto/user.response.js';
import { InvitationsService } from '../invitations/invitations.service.js';
import type {
  AcceptInvitationDto,
  InvitationPreviewResponse,
} from './dto/invitation.dto.js';
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
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  PasswordResetService,
} from './password-reset/password-reset.service.js';
import { PasswordDto, ProfileDto } from './dto/profile.dto.js';
import {
  UserSessionsService,
  type SessionClient,
} from '../user_sessions/user_sessions.service.js';
import type { SessionResponse } from '../user_sessions/dto/session.response.js';
import type { DeviceType } from '../user_sessions/device.js';

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
    private readonly userSessionService: UserSessionsService,
    private readonly sessions: RefreshSessionStore,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly shops: ShopsService,
    private readonly invitations: InvitationsService,
    private readonly passwordResets: PasswordResetService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  requestPasswordReset(email: string): Promise<void> {
    return this.passwordResets.request(email);
  }

  previewPasswordReset(token: string) {
    return this.passwordResets.preview(token);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.passwordResets.reset(token, await argon2.hash(password));
  }

  // What the invitation page shows before the invitee sets a password.
  async previewInvitation(token: string): Promise<InvitationPreviewResponse> {
    const { invitation, user, member } =
      await this.invitations.findUsable(token);
    return {
      email: user.email,
      fullName: user.fullName,
      shopName: invitation.shop!.name,
      branchName: member?.branch?.name ?? null,
      role: toRoleSummary(user.role),
      expiresAt: invitation.expiresAt,
    };
  }

  // Sets the password, activates the account and signs the user in.
  async acceptInvitation(
    dto: AcceptInvitationDto,
    client: SessionClient,
  ): Promise<AuthResult> {
    const user = await this.invitations.accept(
      dto.token,
      await argon2.hash(dto.password),
    );
    return this.startSession(user, false, client);
  }

  async register(dto: RegisterDto, client: SessionClient): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    }

    const passwordHash = await argon2.hash(dto.password);
    // User, shop and owner membership are created together or not at all.
    const user = await this.dataSource
      .transaction(async (manager) => {
        const created = await this.users.create(
          {
            email: dto.email,
            fullName: dto.fullName,
            passwordHash,
            // Fixed role; createWithOwner below adds the shop membership.
            role: 'shop_owner',
          },
          manager,
        );
        await this.shops.createWithOwner(manager, created.id, dto.shopName);
        return created;
      })
      .catch((error: unknown) => {
        // Two concurrent registrations can both pass the check above.
        if (isUniqueViolation(error)) {
          throw new ConflictException(EMAIL_TAKEN_MESSAGE);
        }
        throw error;
      });

    return this.startSession(user, false, client);
  }

  async login(dto: LoginDto, client: SessionClient): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    // Only after the password matched, so the status isn't revealed to
    // someone guessing.
    if (user.status === 'suspended') {
      throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE);
    }

    return this.startSession(user, dto.remember ?? false, client);
  }

  // Issues a new access token only. The refresh token is not rotated: it stays
  // valid until it expires or its session is deleted by logout.
  async refresh(refreshToken: string | undefined): Promise<RefreshResult> {
    if (!refreshToken) throw new UnauthorizedException();
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.sessions.get(payload.sid);
    if (!session || session.userId !== payload.sub) {
      console.log('ไม่มีเซสซั่น');
      throw new UnauthorizedException();
    }

    // Revoked by logout or "sign out other devices", or past its expiry.
    const userSession =
      await this.userSessionService.findActiveByToken(refreshToken);
    if (!userSession) {
      console.log('ไม่มี refresh token');
      await this.sessions.delete(payload.sid);
      throw new UnauthorizedException();
    }
    await this.userSessionService.touch(userSession.id);

    const user = await this.users.findById(session.userId);
    // Suspended since signing in: end the session here, so access lasts at
    // most until the current access token expires.
    if (!user || user.status === 'suspended') {
      await this.sessions.delete(payload.sid);
      await this.userSessionService.revoke(refreshToken);
      throw new UnauthorizedException(
        user ? ACCOUNT_SUSPENDED_MESSAGE : undefined,
      );
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
    if (payload && refreshToken) {
      await this.userSessionService.revoke(refreshToken);
      await this.sessions.delete(payload.sid);
    }
  }

  // Signs out every other device of this user; the caller stays signed in.
  async logoutAll(
    userId: string,
    refreshToken: string | undefined,
  ): Promise<void> {
    if (!refreshToken) {
      throw new BadRequestException('ไม่มี token ในการออก');
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    // The refresh cookie must belong to the same user as the access token.
    if (payload.sub !== userId) {
      throw new ForbiddenException('ไม่มีสิทธิ์ในการใช้งานนี้');
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new ForbiddenException('ไม่มีสิทธิ์ในการใช้งานนี้');
    }

    await this.userSessionService.revokeAllExcept(user.slug, refreshToken);
  }

  // Signs out one of the user's other devices. The current device uses logout,
  // which also clears its cookies.
  async revokeSession(
    userId: string,
    sessionId: number,
    refreshToken: string | undefined,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    // Someone else's session looks the same as a missing one.
    const session = await this.userSessionService.findActiveById(
      user.slug,
      sessionId,
    );
    if (!session) throw new NotFoundException('ไม่พบอุปกรณ์นี้');
    if (this.userSessionService.isSessionOf(session, refreshToken)) {
      throw new BadRequestException('ใช้ปุ่มออกจากระบบเพื่อออกจากอุปกรณ์นี้');
    }

    await this.userSessionService.revokeById(session.id);
  }

  async listSessions(
    userId: string,
    refreshToken: string | undefined,
  ): Promise<SessionResponse[]> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    const sessions = await this.userSessionService.findAllActive(user.slug);
    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName ?? null,
      deviceType: (session.deviceType as DeviceType | null) ?? null,
      ipAddress: session.ipAddress ?? null,
      location: session.location ?? null,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      current: this.userSessionService.isSessionOf(session, refreshToken),
    }));
  }

  async getProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    // shop_members → shops / shop_branches. The UI is single-shop for now, so
    // the oldest membership is the one shown.
    const member = await this.dataSource.getRepository(ShopMember).findOne({
      where: { userId },
      relations: { shop: true, branch: true },
      order: { createdAt: 'ASC' },
    });
    const summary = ({ slug, name }: { slug: string; name: string }) => ({
      slug,
      name,
    });

    let branches: ShopBranch[] = [];
    if (member) {
      // Only a Shop Owner works across branches; everyone else sees their own.
      branches =
        user.role === 'shop_owner'
          ? await this.dataSource.getRepository(ShopBranch).find({
              where: { shopId: member.shopId },
              order: { createdAt: 'ASC' },
            })
          : [member.branch!];
    }

    return {
      ...toPublicUser(user),
      shop: member ? summary(member.shop!) : null,
      branch: member ? summary(member.branch!) : null,
      branches: branches.map(summary),
    };
  }

  async updateProfile(userId: string, body: ProfileDto) {
    return this.users.update(userId, body);
  }

  async changePassword(userId: string, body: PasswordDto) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    const passwordValid = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      body.currentPassword,
    );
    if (!passwordValid) {
      throw new BadRequestException('รหัสผ่านเดิมไม่ถูกต้อง');
    }

    if (body.currentPassword === body.newPassword) {
      throw new BadRequestException('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
    }

    if (body.newPassword !== body.confirmPassword) {
      throw new BadRequestException('รหัสผ่านไม่ตรงกัน');
    }

    if (!this.isValidPassword(body.newPassword)) {
      throw new BadRequestException(
        'รหัสผ่านควรมีอย่างน้อย 8 ตัวอักษรและควรมีตัวอักษรภาษาอังกฤษและตัวเลข',
      );
    }

    const passwordHash = await argon2.hash(body.newPassword);
    return this.users.changePassword(userId, { passwordHash });
  }

  private startSession(
    user: User,
    remember: boolean,
    client: SessionClient,
  ): Promise<AuthResult> {
    return this.issueTokens(user, randomUUID(), remember, client);
  }

  private async issueTokens(
    user: User,
    sid: string,
    remember: boolean,
    client: SessionClient,
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

    const expiresAt = Date.now() + refreshTtl * 1000;
    await this.sessions.set(sid, { userId: user.id, remember, expiresAt });
    await this.userSessionService.create({
      userSlug: user.slug,
      refreshToken,
      expiresAt: new Date(expiresAt),
      ...client,
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

  private isValidPassword(password: string): boolean {
    const hasMinLength = password.length >= 8;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    return hasMinLength && hasLetter && hasNumber;
  }
}
