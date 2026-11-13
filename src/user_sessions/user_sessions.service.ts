import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { describeDevice } from './device.js';
import { UserSession } from './entities/user_session.entity.js';
import { locateIp } from './location.js';

// Where a login came from, read off the request.
export interface SessionClient {
  userAgent?: string;
  ipAddress?: string;
}

export interface CreateSessionInput extends SessionClient {
  userSlug: string;
  refreshToken: string;
  expiresAt: Date;
}

// Only a hash of the refresh token is stored, so a leaked table can't be used
// to sign in. SHA-256 is enough: the token is a long random JWT, not a password.
function hashToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

// Fits the varchar(255) columns.
function truncate(value: string | undefined): string | undefined {
  return value?.slice(0, 255);
}

@Injectable()
export class UserSessionsService {
  constructor(
    @InjectRepository(UserSession)
    private readonly userSessions: Repository<UserSession>,
  ) {}

  create(input: CreateSessionInput): Promise<UserSession> {
    const now = new Date();
    const session = this.userSessions.create({
      userSlug: input.userSlug,
      refreshToken: hashToken(input.refreshToken),
      ...describeDevice(input.userAgent),
      userAgent: truncate(input.userAgent),
      ipAddress: truncate(input.ipAddress),
      location: locateIp(input.ipAddress) ?? undefined,
      createdAt: now,
      lastActiveAt: now,
      expiredAt: input.expiresAt,
      revokedAt: null,
    });
    return this.userSessions.save(session);
  }

  // The session behind a refresh token, unless it was revoked or has expired.
  findActiveByToken(refreshToken: string): Promise<UserSession | null> {
    return this.userSessions.findOne({
      where: {
        refreshToken: hashToken(refreshToken),
        revokedAt: IsNull(),
        expiredAt: MoreThan(new Date()),
      },
    });
  }

  findAllActive(userSlug: string): Promise<UserSession[]> {
    return this.userSessions.find({
      where: {
        userSlug,
        revokedAt: IsNull(),
        expiredAt: MoreThan(new Date()),
      },
      order: { lastActiveAt: 'DESC' },
    });
  }

  findActiveById(userSlug: string, id: number): Promise<UserSession | null> {
    return this.userSessions.findOne({
      where: {
        id,
        userSlug,
        revokedAt: IsNull(),
        expiredAt: MoreThan(new Date()),
      },
    });
  }

  async revokeById(id: number): Promise<void> {
    await this.userSessions.update(
      { id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  isSessionOf(session: UserSession, refreshToken: string | undefined): boolean {
    return (
      refreshToken !== undefined &&
      session.refreshToken === hashToken(refreshToken)
    );
  }

  async touch(id: number): Promise<void> {
    await this.userSessions.update(id, { lastActiveAt: new Date() });
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.userSessions.update(
      { refreshToken: hashToken(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  // Signs out every device, e.g. after a password reset.
  async revokeAll(userSlug: string): Promise<void> {
    await this.userSessions.update(
      { userSlug, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  // Signs out every other device, keeping the one making the request.
  async revokeAllExcept(userSlug: string, refreshToken: string): Promise<void> {
    await this.userSessions.update(
      {
        userSlug,
        refreshToken: Not(hashToken(refreshToken)),
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );
  }
}
