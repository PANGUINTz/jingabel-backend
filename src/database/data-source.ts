import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm.options.js';

// Entry point for the TypeORM CLI only (see the migration:* npm scripts);
// the Nest app builds its connection in AppModule.
if (existsSync('.env')) process.loadEnvFile('.env');

const { DATABASE_URL, NODE_ENV } = process.env;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

export default new DataSource(buildTypeOrmOptions({ DATABASE_URL, NODE_ENV }));
