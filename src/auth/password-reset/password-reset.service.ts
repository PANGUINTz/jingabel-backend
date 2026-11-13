import { createHash, randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { Env } from '../../config/env.js';
import { MailService } from '../../mail/mail.service.js';
import {
  accountSuspendedMail,
  passwordResetMail,
} from '../../mail/templates/password-reset.template.js';
import type { MailContent } from '../../mail/mail.types.js';
import { UserSessionsService } from '../../user_sessions/user_sessions.service.js';
import { User } from '../../users/user.entity.js';
import { UsersService } from '../../users/users.service.js';
import { PasswordReset } from './password-reset.entity.js';

export const ACCOUNT_SUSPENDED_MESSAGE =
  'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อเจ้าของร้านหรือผู้จัดการสาขา';
const INVALID_LINK = 'ลิงก์ตั้งรหัสผ่านใหม่ไม่ถูกต้อง';
const EXPIRED_LINK = 'ลิงก์ตั้งรหัสผ่านใหม่หมดอายุแล้ว กรุณาขอลิงก์ใหม่';
const USED_LINK = 'ลิงก์นี้ถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่หากต้องการเปลี่ยนรหัสผ่านอีกครั้ง';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly userSessions: UserSessionsService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Says nothing about whether the email has an account: the caller always
  // gets the same answer, and the email is sent in the background so the
  // response time doesn't tell either.
  //   active    → a reset link
  //   suspended → a notice that the account is suspended (no link)
  //   pending   → nothing (they finish their invitation instead)
  async request(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    let content: MailContent;
    if (user.status === 'suspended') {
      content = accountSuspendedMail({ fullName: user.fullName, email: user.email });
    } else if (user.status === 'active') {
      const { resetUrl, expiresAt } = await this.issue(user.id);
      content = passwordResetMail({
        fullName: user.fullName,
        email: user.email,
        resetUrl,
        expiresAt,
      });
    } else {
      return;
    }

    void this.mail.send(user.email, content).catch((error: unknown) => {
      this.logger.error(`Password reset email to ${user.email} failed`, error);
    });
  }

  // What the reset page shows before the new password is entered.
  async preview(token: string): Promise<{ email: string; expiresAt: Date }> {
    const { reset, user } = await this.findUsable(token);
    return { email: user.email, expiresAt: reset.expiresAt };
  }

  // Sets the new password, burns the link and signs out every device.
  async reset(token: string, passwordHash: string): Promise<void> {
    const user = await this.dataSource.transaction(async (manager) => {
      const { reset, user } = await this.findUsable(token, manager, true);
      await manager.getRepository(User).update(user.id, { passwordHash });
      await manager
        .getRepository(PasswordReset)
        .update(reset.id, { usedAt: new Date() });
      return user;
    });
    await this.userSessions.revokeAll(user.slug);
  }

  // Replaces any earlier unused link of this user, so only the newest works.
  private async issue(
    userId: string,
  ): Promise<{ resetUrl: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('PASSWORD_RESET_TTL', { infer: true }) * 1000,
    );
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PasswordReset);
      await repo.delete({ userId, usedAt: IsNull() });
      await repo.insert({ userId, tokenHash: hashToken(token), expiresAt });
    });

    const resetUrl = new URL('/reset-password', this.config.get('APP_URL', { infer: true }));
    resetUrl.searchParams.set('token', token);
    return { resetUrl: resetUrl.toString(), expiresAt };
  }

  private async findUsable(
    token: string,
    manager: EntityManager = this.dataSource.manager,
    lock = false,
  ): Promise<{ reset: PasswordReset; user: User }> {
    const qb = manager
      .getRepository(PasswordReset)
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.user', 'u')
      .where('r.tokenHash = :hash', { hash: hashToken(token) });
    if (lock) qb.setLock('pessimistic_write', undefined, ['r']);
    const reset = await qb.getOne();

    if (!reset) throw new NotFoundException(INVALID_LINK);
    if (reset.usedAt) throw new GoneException(USED_LINK);
    if (reset.expiresAt.getTime() <= Date.now()) {
      throw new GoneException(EXPIRED_LINK);
    }
    // Suspended after the link was sent.
    const user = reset.user!;
    if (user.status === 'suspended') {
      throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE);
    }
    if (user.status !== 'active') throw new GoneException(INVALID_LINK);
    return { reset, user };
  }
}
