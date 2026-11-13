import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiServiceUnavailableResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CurrentShop } from './decorators/current-shop.decorator.js';
import { RequireShopPermissions } from './decorators/require-shop-permissions.decorator.js';
import { ApiErrorResponse } from '../common/swagger/api-error.response.js';
import {
  ChangeMemberRoleDto,
  ChangeMemberStatusDto,
  InviteMemberDto,
  MyShopResponse,
  RenameShopBranchDto,
  ShopBranchResponse,
  ShopMemberResponse,
  ShopMembersPageResponse,
  ShopMembersQueryDto,
} from './dto/shop.dto.js';
import type { ShopAccess } from './shop-access.service.js';
import { ShopBranchesService } from './shop-branches.service.js';
import { ShopMembersService } from './shop-members.service.js';
import { ShopsService } from './shops.service.js';

@ApiTags('shops')
@ApiCookieAuth()
@Controller('shops')
export class ShopsController {
  constructor(
    private readonly shops: ShopsService,
    private readonly members: ShopMembersService,
    private readonly branches: ShopBranchesService,
  ) {}

  @ApiOperation({
    summary: 'ร้านทั้งหมดที่ผู้ใช้ปัจจุบันเป็นสมาชิก พร้อมบทบาทและสิทธิ์',
  })
  @ApiOkResponse({ type: MyShopResponse, isArray: true })
  @Get('mine')
  listMine(@CurrentUser() user: AuthUser): Promise<MyShopResponse[]> {
    return this.shops.listMine(user.id);
  }

  @ApiOperation({
    summary: 'ข้อมูลร้าน + บทบาทและสิทธิ์ของผู้ใช้ปัจจุบันในร้านนี้',
  })
  @ApiOkResponse({ type: MyShopResponse })
  @RequireShopPermissions()
  @Get(':shopSlug')
  get(@CurrentShop() access: ShopAccess): MyShopResponse {
    return this.shops.describe(access);
  }

  // --- Members ---------------------------------------------------------------

  @ApiOperation({
    summary: 'สมาชิกของร้าน',
    description:
      'แบ่งหน้า เรียงตามวันที่เข้าร่วม ค้นหาจากชื่อ/อีเมล และกรองตามบทบาท/สถานะได้',
  })
  @ApiOkResponse({ type: ShopMembersPageResponse })
  @RequireShopPermissions('users.view')
  @Get(':shopSlug/members')
  listMembers(
    @CurrentShop() access: ShopAccess,
    @Query() query: ShopMembersQueryDto,
  ): Promise<ShopMembersPageResponse> {
    return this.members.list(access.shop.id, query);
  }

  @ApiOperation({
    summary: 'เชิญพนักงานใหม่เข้าร้าน',
    description:
      'สร้างบัญชีสถานะ `pending` ในสาขาที่เลือก แล้วส่งอีเมลลิงก์ให้ตั้งรหัสผ่าน — ' +
      'กดลิงก์และตั้งรหัสผ่านแล้วสถานะเป็น `active`. บทบาทต้องต่ำกว่าผู้เชิญ ' +
      'และ Branch Manager เชิญได้เฉพาะสาขาของตัวเอง',
  })
  @ApiCreatedResponse({ type: ShopMemberResponse })
  @ApiConflictResponse({
    description: 'อีเมลนี้ถูกใช้งานแล้ว',
    type: ApiErrorResponse,
  })
  @ApiServiceUnavailableResponse({
    description: 'ส่งอีเมลไม่สำเร็จ — ไม่มีการสร้างบัญชี',
    type: ApiErrorResponse,
  })
  @RequireShopPermissions('users.invite')
  @Post(':shopSlug/members')
  inviteMember(
    @CurrentShop() access: ShopAccess,
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteMemberDto,
  ): Promise<ShopMemberResponse> {
    return this.members.invite(access, user.id, dto);
  }

  @ApiOperation({
    summary: 'ส่งอีเมลคำเชิญใหม่',
    description: 'เฉพาะสมาชิกสถานะ `pending` — ลิงก์เดิมจะใช้ไม่ได้อีก',
  })
  @ApiNoContentResponse({ description: 'ส่งแล้ว' })
  @ApiBadRequestResponse({
    description: 'ยืนยันคำเชิญแล้ว',
    type: ApiErrorResponse,
  })
  @ApiServiceUnavailableResponse({
    description: 'ส่งอีเมลไม่สำเร็จ',
    type: ApiErrorResponse,
  })
  @RequireShopPermissions('users.invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':shopSlug/members/:userSlug/invitation')
  resendInvitation(
    @CurrentShop() access: ShopAccess,
    @CurrentUser() user: AuthUser,
    @Param('userSlug') userSlug: string,
  ): Promise<void> {
    return this.members.resendInvitation(access, user.id, userSlug);
  }

  @ApiOperation({
    summary: 'เปลี่ยนบทบาทของสมาชิก',
    description:
      'บทบาทตายตัว (shop_owner > branch_manager > employee) เก็บที่ users.role จึงมีผลกับทุกร้านของผู้ใช้. ' +
      'ทั้งบทบาทเดิมและบทบาทใหม่ต้องต่ำกว่าผู้เปลี่ยน — platform admin ยกเว้น',
  })
  @ApiOkResponse({ type: ShopMemberResponse })
  @ApiBadRequestResponse({
    description: 'เปลี่ยนของตัวเอง',
    type: ApiErrorResponse,
  })
  @ApiConflictResponse({
    description: 'จะทำให้ร้านไม่มี Shop Owner',
    type: ApiErrorResponse,
  })
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

  @ApiOperation({
    summary: 'ระงับ / ปลดระงับบัญชีสมาชิก',
    description:
      'เปลี่ยน users.status จึงมีผลกับทุกร้านของผู้ใช้. ทำได้เฉพาะกับผู้ที่อยู่ต่ำกว่าตัวเอง — platform admin ยกเว้น',
  })
  @ApiOkResponse({ type: ShopMemberResponse })
  @ApiBadRequestResponse({
    description: 'เปลี่ยนของตัวเอง',
    type: ApiErrorResponse,
  })
  @RequireShopPermissions('users.suspend')
  @Patch(':shopSlug/members/:userSlug/status')
  changeMemberStatus(
    @CurrentShop() access: ShopAccess,
    @CurrentUser() user: AuthUser,
    @Param('userSlug') userSlug: string,
    @Body() dto: ChangeMemberStatusDto,
  ): Promise<ShopMemberResponse> {
    return this.members.changeStatus(access, user.id, userSlug, dto.status);
  }

  @ApiOperation({
    summary: 'นำสมาชิกออกจากร้าน',
    description:
      'ลบเฉพาะการเป็นสมาชิกของร้านนี้ บัญชีผู้ใช้ยังอยู่. ทำได้เฉพาะกับผู้ที่อยู่ต่ำกว่าตัวเอง — platform admin ยกเว้น',
  })
  @ApiNoContentResponse({ description: 'นำออกแล้ว' })
  @ApiBadRequestResponse({ description: 'นำตัวเองออก', type: ApiErrorResponse })
  @ApiConflictResponse({
    description: 'จะทำให้ร้านไม่มี Shop Owner',
    type: ApiErrorResponse,
  })
  @RequireShopPermissions('users.remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':shopSlug/members/:userSlug')
  removeMember(
    @CurrentShop() access: ShopAccess,
    @CurrentUser() user: AuthUser,
    @Param('userSlug') userSlug: string,
  ): Promise<void> {
    return this.members.remove(access, user.id, userSlug);
  }

  // --- Branches --------------------------------------------------------------

  @ApiOperation({ summary: 'สาขาของร้าน (เรียงตามวันที่สร้าง)' })
  @ApiOkResponse({ type: ShopBranchResponse, isArray: true })
  @RequireShopPermissions('branches.view')
  @Get(':shopSlug/branches')
  listBranches(
    @CurrentShop() access: ShopAccess,
  ): Promise<ShopBranchResponse[]> {
    return this.branches.list(access.shop.id);
  }

  @ApiOperation({ summary: 'เพิ่มสาขาใหม่' })
  @ApiCreatedResponse({ type: ShopBranchResponse })
  @ApiConflictResponse({
    description: 'มีสาขาชื่อนี้ในร้านแล้ว',
    type: ApiErrorResponse,
  })
  @RequireShopPermissions('branches.manage')
  @Post(':shopSlug/branches')
  createBranch(
    @CurrentShop() access: ShopAccess,
    @CurrentUser() user: AuthUser,
    @Body() dto: RenameShopBranchDto,
  ): Promise<ShopBranchResponse> {
    return this.branches.create(access, user.id, dto.name);
  }

  @ApiOperation({ summary: 'แก้ไขชื่อสาขา' })
  @ApiOkResponse({ type: ShopBranchResponse })
  @ApiConflictResponse({
    description: 'มีสาขาชื่อนี้ในร้านแล้ว',
    type: ApiErrorResponse,
  })
  @RequireShopPermissions('branches.manage')
  @Patch(':shopSlug/branches/:branchSlug')
  renameBranch(
    @CurrentShop() access: ShopAccess,
    @CurrentUser() user: AuthUser,
    @Param('branchSlug') branchSlug: string,
    @Body() dto: RenameShopBranchDto,
  ): Promise<ShopBranchResponse> {
    return this.branches.rename(access, user.id, branchSlug, dto.name);
  }
}
