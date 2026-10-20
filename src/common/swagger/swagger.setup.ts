import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE } from '../../auth/auth.types.js';

export const SWAGGER_PATH = 'api/docs';

// Serves the UI at /api/docs and the OpenAPI JSON at /api/docs-json.
// The UI is same-origin with the API, so after calling /auth/login from it the
// browser sends the auth cookies on every later "Try it out" request.
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Jingabel API')
    .setDescription(
      'API ของระบบจัดการร้านค้าหลายสาขา — ทุก route ต้องมี access token ' +
        'ยกเว้นที่ระบุว่าไม่ต้อง login',
    )
    .setVersion('0.0.1')
    .addCookieAuth(ACCESS_TOKEN_COOKIE, {
      type: 'apiKey',
      in: 'cookie',
      name: ACCESS_TOKEN_COOKIE,
    })
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    swaggerOptions: { withCredentials: true, persistAuthorization: true },
  });
}
