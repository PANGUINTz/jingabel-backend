import type { DataSourceOptions } from 'typeorm';
import { User } from '../users/user.entity.js';
import { CreateUsers1791504000000 } from './migrations/1791504000000-create-users.js';

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
    entities: [User],
    migrations: [CreateUsers1791504000000],
    // Schema changes only ever happen through migrations.
    synchronize: false,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    dropSchema: isTest,
    migrationsRun: isTest,
  };
}
