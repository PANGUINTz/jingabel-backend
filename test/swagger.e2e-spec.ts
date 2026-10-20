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
      .get('/api/docs-json')
      .expect(200);

    expect(Object.keys(res.body.paths).sort()).toEqual([
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/auth/refresh',
      '/api/auth/register',
    ]);
    expect(res.body.components.schemas).toHaveProperty('AuthResponse');
    expect(res.body.components.schemas.LoginDto.required).toEqual([
      'email',
      'password',
    ]);
  });

  it('serves the UI without a login', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });
});
