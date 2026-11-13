import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ShopRequest } from '../guards/shop-permissions.guard.js';

// The shop + permissions ShopPermissionsGuard resolved for this request.
export const CurrentShop = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<ShopRequest>().shopAccess,
);
