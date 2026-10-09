import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { Env } from '../../config/env.js';
import {
  ACCESS_TOKEN_COOKIE,
  type AccessTokenPayload,
  type AuthenticatedRequest,
} from '../auth.types.js';

// Registered globally: verifies the access token on every non-@Public() route
// and attaches the requesting user to `request.user` (read it with @CurrentUser()).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractAccessToken(request);
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}

// Browsers send the httpOnly cookie; other clients may use a Bearer header.
function extractAccessToken(request: Request): string | undefined {
  const cookieToken: unknown = request.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken) return cookieToken;

  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : undefined;
}
