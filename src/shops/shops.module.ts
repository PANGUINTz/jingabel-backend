import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module.js';
import { InvitationsModule } from '../invitations/invitations.module.js';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { User } from '../users/user.entity.js';
import { ShopBranch } from './entities/shop-branch.entity.js';
import { ShopMember } from './entities/shop-member.entity.js';
import { Shop } from './entities/shop.entity.js';
import { ShopPermissionsGuard } from './guards/shop-permissions.guard.js';
import { ShopAccessService } from './shop-access.service.js';
import { ShopBranchesService } from './shop-branches.service.js';
import { ShopMembersService } from './shop-members.service.js';
import { ShopsController } from './shops.controller.js';
import { ShopsService } from './shops.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shop, ShopBranch, ShopMember, User]),
    AuditModule,
    UsersModule,
    InvitationsModule,
    MailModule,
  ],
  controllers: [ShopsController],
  providers: [
    ShopsService,
    ShopAccessService,
    ShopMembersService,
    ShopBranchesService,
    ShopPermissionsGuard,
  ],
  // Other modules' controllers use @RequireShopPermissions(), which needs the
  // guard and ShopAccessService — import ShopsModule there.
  exports: [ShopsService, ShopAccessService, ShopPermissionsGuard],
})
export class ShopsModule {}
