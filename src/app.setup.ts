import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { setupSwagger } from './common/swagger/swagger.setup.js';
import { API_PREFIX } from './config/api.js';
import { Env } from './config/env.js';

// Shared by main.ts and the e2e tests so both run the same HTTP pipeline.
export function setupApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: [
      config.get('CORS_ORIGIN', { infer: true }),
      'http://192.168.50.244:3000'
    ],
    credentials: true,
  });

  const swaggerEnabled =
    config.get('SWAGGER_ENABLED', { infer: true }) ??
    config.get('NODE_ENV', { infer: true }) !== 'production';
  if (swaggerEnabled) setupSwagger(app);
}
