import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../auth/auth.types.js';
import type { ShopPermission } from '../permissions.js';
import { ShopAccessService, type ShopAccess } from '../shop-access.service.js';

export interface ShopRequest extends AuthenticatedRequest {
  shopAccess: ShopAccess;
}

export const SHOP_SLUG_PARAM = 'shopSlug';
export const SHOP_PERMISSIONS_KEY = 'shopPermissions';

// Applied through @RequireShopPermissions(), so it runs after the global
// JwtAuthGuard has set request.user. Resolves the shop from the
// `:shopSlug` route param and requires every listed permission there.
@Injectable()
export class ShopPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: ShopAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<ShopPermission[]>(SHOP_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const request = context.switchToHttp().getRequest<ShopRequest>();
    const shopSlug = request.params[SHOP_SLUG_PARAM];
    if (typeof shopSlug !== 'string' || !shopSlug) {
      // A route wired up wrongly — fail closed.
      throw new InternalServerErrorException(
        `@RequireShopPermissions() needs a :${SHOP_SLUG_PARAM} route param`,
      );
    }

    const access = await this.access.resolve(request.user.id, shopSlug);
    if (!required.every((p) => access.permissions.has(p))) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูล');
    }

    request.shopAccess = access;
    return true;
  }
}
