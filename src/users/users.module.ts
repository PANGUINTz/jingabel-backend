import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';
import { UserController } from './user.controller.js';
import { AuditModule } from '../audit/audit.module.js';
import { UserSessionsModule } from '../user_sessions/user_sessions.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuditModule, UserSessionsModule],
  controllers: [UserController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
