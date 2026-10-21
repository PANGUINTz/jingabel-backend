import type { Request } from 'express';
import type { UserRole } from '../users/user.entity.js';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface RefreshTokenPayload {
  sub: string;
  // Session id — one per login; logging out deletes it, which invalidates the
  // refresh token even before it expires.
  sid: string;
}

// The requesting user, as verified from the access token by JwtAuthGuard.
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
