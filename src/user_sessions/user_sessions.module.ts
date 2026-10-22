import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from './entities/user_session.entity.js';
import { UserSessionsService } from './user_sessions.service.js';

// No controller: sessions are created by login/register and listed or revoked
// through /auth, the only path the refresh_token cookie is sent to.
@Module({
  imports: [TypeOrmModule.forFeature([UserSession])],
  providers: [UserSessionsService],
  exports: [UserSessionsService],
})
export class UserSessionsModule {}
