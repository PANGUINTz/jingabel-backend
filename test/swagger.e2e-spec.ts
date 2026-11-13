import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';

describe('Swagger (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents every route the app exposes', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/api/docs-json')
      .expect(200);

    expect(Object.keys(res.body.paths).sort()).toEqual([
      '/v1/api/auth/invitations/accept',
      '/v1/api/auth/invitations/preview',
      '/v1/api/auth/login',
      '/v1/api/auth/logout',
      '/v1/api/auth/logout-all',
      '/v1/api/auth/me',
      '/v1/api/auth/password',
      '/v1/api/auth/password/forgot',
      '/v1/api/auth/password/reset',
      '/v1/api/auth/password/reset/preview',
      '/v1/api/auth/profile',
      '/v1/api/auth/refresh',
      '/v1/api/auth/register',
      '/v1/api/auth/revoke/{refreshToken}',
      '/v1/api/auth/sessions',
      '/v1/api/auth/sessions/{id}',
      '/v1/api/shops/mine',
      '/v1/api/shops/{shopSlug}',
      '/v1/api/shops/{shopSlug}/branches',
      '/v1/api/shops/{shopSlug}/branches/{branchSlug}',
      '/v1/api/shops/{shopSlug}/members',
      '/v1/api/shops/{shopSlug}/members/{userSlug}',
      '/v1/api/shops/{shopSlug}/members/{userSlug}/invitation',
      '/v1/api/shops/{shopSlug}/members/{userSlug}/status',
      '/v1/api/users',
      '/v1/api/users/{slug}',
    ]);
    expect(res.body.components.schemas).toHaveProperty('AuthResponse');
    expect(res.body.components.schemas.LoginDto.required).toEqual([
      'email',
      'password',
    ]);
  });

  it('serves the UI without a login', async () => {
    await request(app.getHttpServer()).get('/v1/api/docs').expect(200);
  });
});
