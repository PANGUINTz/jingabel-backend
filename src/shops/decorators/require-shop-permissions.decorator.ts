import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { ApiForbiddenResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../common/swagger/api-error.response.js';
import {
  SHOP_PERMISSIONS_KEY,
  ShopPermissionsGuard,
} from '../guards/shop-permissions.guard.js';
import type { ShopPermission } from '../permissions.js';

// For routes under /shops/:shopSlug/... — the caller must be a member of that
// shop (or a platform admin) and hold every listed permission there. With no
// arguments it only requires access to the shop.
export const RequireShopPermissions = (...permissions: ShopPermission[]) =>
  applyDecorators(
    SetMetadata(SHOP_PERMISSIONS_KEY, permissions),
    UseGuards(ShopPermissionsGuard),
    ApiNotFoundResponse({
      description: 'ไม่พบร้านค้า หรือไม่ได้เป็นสมาชิกของร้านนี้',
      type: ApiErrorResponse,
    }),
    ApiForbiddenResponse({
      description: `ต้องมีสิทธิ์: ${permissions.join(', ') || '-'}`,
      type: ApiErrorResponse,
    }),
  );
