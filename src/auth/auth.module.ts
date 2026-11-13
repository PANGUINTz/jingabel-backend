import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RefreshSessionStore } from './refresh-session.store.js';
import { UserSessionsModule } from '../user_sessions/user_sessions.module.js';
import { ShopsModule } from '../shops/shops.module.js';

@Module({
  // Secrets and lifetimes are passed per sign/verify call, since access and
  // refresh tokens use different ones.
  imports: [
    UsersModule,
    UserSessionsModule,
    ShopsModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshSessionStore,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
