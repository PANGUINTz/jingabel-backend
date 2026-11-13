import type { DataSourceOptions } from 'typeorm';
import { User } from '../users/user.entity.js';
import { UserSession } from '../user_sessions/entities/user_session.entity.js';
import { Shop } from '../shops/entities/shop.entity.js';
import { ShopMember } from '../shops/entities/shop-member.entity.js';
import { ShopBranch } from '../shops/entities/shop-branch.entity.js';
import { AuditLog } from '../audit/audit-log.entity.js';
import { UserInvitation } from '../invitations/user-invitation.entity.js';
import { PasswordReset } from '../auth/password-reset/password-reset.entity.js';

interface DatabaseEnv {
  DATABASE_URL: string;
  NODE_ENV?: string;
}

// Entities are listed explicitly; add new ones here. There are no migrations:
// `synchronize` makes the schema follow the entities on every start.
export function buildTypeOrmOptions(env: DatabaseEnv): DataSourceOptions {
  const isTest = env.NODE_ENV === 'test';
  // Tests wipe the schema on startup — never let that reach a real database.
  if (isTest && !new URL(env.DATABASE_URL).pathname.endsWith('_test')) {
    throw new Error(
      'NODE_ENV=test requires a DATABASE_URL whose database name ends with "_test"',
    );
  }

  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    entities: [User, UserSession, Shop, ShopBranch, ShopMember, AuditLog, UserInvitation, PasswordReset],
    // Creates/alters tables to match the entities on startup. It can drop
    // columns (and their data) that an entity no longer has — check entity
    // changes against real data before deploying.
    synchronize: true,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    dropSchema: isTest,
  };
}
