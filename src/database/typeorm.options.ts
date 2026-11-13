import type { DataSourceOptions } from 'typeorm';
import { User } from '../users/user.entity.js';
import { CreateUsers1791504000000 } from './migrations/1791504000000-create-users.js';
import { AddUserSlug1792505743000 } from './migrations/1792505743000-add-user-slug.js';
import { UserSession } from '../user_sessions/entities/user_session.entity.js';
import { AddShopRbac1794540574000 } from './migrations/1794540574000-add-shop-rbac.js';
import { ShopRolesOnUsers1794600000000 } from './migrations/1794600000000-shop-roles-on-users.js';
import { DropShopRoles1794700000000 } from './migrations/1794700000000-drop-shop-roles.js';
import { Shop } from '../shops/entities/shop.entity.js';
import { ShopMember } from '../shops/entities/shop-member.entity.js';
import { AuditLog } from '../audit/audit-log.entity.js';

interface DatabaseEnv {
  DATABASE_URL: string;
  NODE_ENV?: string;
}

// Single source of truth for the Nest app and the TypeORM CLI (data-source.ts).
// Entities and migrations are listed explicitly; add new ones here.
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
    entities: [User, UserSession, Shop, ShopMember, AuditLog],
    migrations: [
      CreateUsers1791504000000,
      AddUserSlug1792505743000,
      AddShopRbac1794540574000,
      ShopRolesOnUsers1794600000000,
      DropShopRoles1794700000000,
    ],
    // Schema changes only ever happen through migrations.
    synchronize: true,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    dropSchema: isTest,
    migrationsRun: isTest,
  };
}
