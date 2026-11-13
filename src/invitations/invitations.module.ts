import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationsService } from './invitations.service.js';
import { UserInvitation } from './user-invitation.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserInvitation])],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
