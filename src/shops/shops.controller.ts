import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CurrentShop } from './decorators/current-shop.decorator.js';
import { RequireShopPermissions } from './decorators/require-shop-permissions.decorator.js';
import {
  ChangeMemberRoleDto,
  MyShopResponse,
  ShopMemberResponse,
} from './dto/shop.dto.js';
import type { ShopAccess } from './shop-access.service.js';
import { ShopMembersService } from './shop-members.service.js';
import { ShopsService } from './shops.service.js';

@ApiTags('shops')
@ApiCookieAuth()
@Controller('shops')
export class ShopsController {
  constructor(
    private readonly shops: ShopsService,
    private readonly members: ShopMembersService,
  ) {}

  @ApiOperation({ summary: 'ร้านทั้งหมดที่ผู้ใช้ปัจจุบันเป็นสมาชิก พร้อมบทบาทและสิทธิ์' })
  @ApiOkResponse({ type: MyShopResponse, isArray: true })
  @Get('mine')
  listMine(@CurrentUser() user: AuthUser): Promise<MyShopResponse[]> {
    return this.shops.listMine(user.id);
  }

  @ApiOperation({ summary: 'ข้อมูลร้าน + บทบาทและสิทธิ์ของผู้ใช้ปัจจุบันในร้านนี้' })
  @ApiOkResponse({ type: MyShopResponse })
  @RequireShopPermissions()
  @Get(':shopSlug')
  get(@CurrentShop() access: ShopAccess): MyShopResponse {
    return this.shops.describe(access);
  }

  // --- Members ---------------------------------------------------------------

  @ApiOperation({ summary: 'สมาชิกของร้าน' })
  @ApiOkResponse({ type: ShopMemberResponse, isArray: true })
  @RequireShopPermissions('users.view')
  @Get(':shopSlug/members')
  listMembers(
    @CurrentShop() access: ShopAccess,
  ): Promise<ShopMemberResponse[]> {
    return this.members.list(access.shop.id);
  }

  @ApiOperation({
    summary: 'เปลี่ยนบทบาทของสมาชิก',
    description:
      'บทบาทตายตัว (shop_owner > branch_manager > employee) เก็บที่ users.role จึงมีผลกับทุกร้านของผู้ใช้. ' +
      'ทั้งบทบาทเดิมและบทบาทใหม่ต้องต่ำกว่าผู้เปลี่ยน — platform admin ยกเว้น',
  })
  @ApiOkResponse({ type: ShopMemberResponse })
  @RequireShopPermissions('users.change_role')
  @Patch(':shopSlug/members/:userSlug')
  changeMemberRole(
    @CurrentShop() access: ShopAccess,
    @CurrentUser() user: AuthUser,
    @Param('userSlug') userSlug: string,
    @Body() dto: ChangeMemberRoleDto,
  ): Promise<ShopMemberResponse> {
    return this.members.changeRole(access, user.id, userSlug, dto.role);
  }
}
