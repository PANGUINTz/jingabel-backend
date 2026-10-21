import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';

const credentials = { email: 'owner@shop.com', password: 'passw0rd123' };

function cookiesOf(res: request.Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[]) ?? [];
}

function cookie(res: request.Response, name: string): string {
  const found = cookiesOf(res).find((c) => c.startsWith(`${name}=`));
  if (!found) throw new Error(`cookie ${name} was not set`);
  return found.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();

    await request(app.getHttpServer())
      .post('/v1/api/auth/register')
      .send({
        ...credentials,
        shopName: 'ร้านกาแฟดอยคำ',
        fullName: 'อนันต์ ใจดี',
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a shop owner and sets httpOnly token cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/api/auth/register')
      .send({
        email: 'Second@Shop.com',
        password: 'passw0rd123',
        shopName: 'ร้านที่สอง',
        fullName: 'สมชาย ใจดี',
      })
      .expect(201);

    expect(res.body.user).toMatchObject({
      email: 'second@shop.com',
      role: 'shop_owner',
      isEmployee: false,
    });
    expect(res.body.user.slug).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(res.body.user.id).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('eyJ');
    for (const c of cookiesOf(res)) expect(c).toContain('HttpOnly');
    expect(
      cookiesOf(res).find((c) => c.startsWith('refresh_token=')),
    ).toContain('Path=/v1/api/auth');
    expect(cookie(res, 'access_token')).toBeTruthy();
    expect(cookie(res, 'refresh_token')).toBeTruthy();
  });

  it('rejects a duplicate email and invalid input', async () => {
    await request(app.getHttpServer())
      .post('/v1/api/auth/register')
      .send({ ...credentials, shopName: 'ร้านซ้ำ', fullName: 'ชื่อ ซ้ำ' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/v1/api/auth/register')
      .send({
        email: 'x@shop.com',
        password: 'short',
        shopName: 'a',
        fullName: 'b',
      })
      .expect(400);
  });

  it('rejects wrong credentials', async () => {
    await request(app.getHttpServer())
      .post('/v1/api/auth/login')
      .send({ ...credentials, password: 'wrong-password1' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/v1/api/auth/login')
      .send({ email: 'nobody@shop.com', password: 'passw0rd123' })
      .expect(401);
  });

  it('blocks protected routes without a valid access token', async () => {
    await request(app.getHttpServer()).get('/v1/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/v1/api/auth/me')
      .set('Cookie', 'access_token=not-a-jwt')
      .expect(401);
  });

  it('passes the verified user to protected routes', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/api/auth/login')
      .send(credentials)
      .expect(200);

    const viaCookie = await request(app.getHttpServer())
      .get('/v1/api/auth/me')
      .set('Cookie', cookie(login, 'access_token'))
      .expect(200);
    expect(viaCookie.body).toMatchObject({
      email: credentials.email,
      role: 'shop_owner',
    });

    const token = cookie(login, 'access_token').split('=')[1];
    await request(app.getHttpServer())
      .get('/v1/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('does not accept a refresh token as an access token', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/api/auth/login')
      .send(credentials)
      .expect(200);
    const refreshToken = cookie(login, 'refresh_token').split('=')[1];

    await request(app.getHttpServer())
      .get('/v1/api/auth/me')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(401);
  });

  it('refresh issues a new access token and keeps the same refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/api/auth/login')
      .send(credentials)
      .expect(200);
    const refreshCookie = cookie(login, 'refresh_token');

    const refreshed = await request(app.getHttpServer())
      .post('/v1/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    expect(refreshed.body.user).toMatchObject({ email: credentials.email });
    expect(
      cookiesOf(refreshed).some((c) => c.startsWith('refresh_token=')),
    ).toBe(false);
    await request(app.getHttpServer())
      .get('/v1/api/auth/me')
      .set('Cookie', cookie(refreshed, 'access_token'))
      .expect(200);

    // Parallel refreshes with the same token all succeed — nothing is rotated.
    const parallel = await Promise.all(
      [1, 2, 3].map(() =>
        request(app.getHttpServer())
          .post('/v1/api/auth/refresh')
          .set('Cookie', refreshCookie),
      ),
    );
    expect(parallel.map((res) => res.status)).toEqual([200, 200, 200]);
  });

  it('keeps both cookies persistent only with "remember me"', async () => {
    const session = await request(app.getHttpServer())
      .post('/v1/api/auth/login')
      .send(credentials)
      .expect(200);
    const remembered = await request(app.getHttpServer())
      .post('/v1/api/auth/login')
      .send({ ...credentials, remember: true })
      .expect(200);

    const refreshCookie = (res: request.Response) =>
      cookiesOf(res).find((c) => c.startsWith('refresh_token='));
    const accessCookie = (res: request.Response) =>
      cookiesOf(res).find((c) => c.startsWith('access_token='));
    expect(refreshCookie(session)).not.toContain('Max-Age');
    expect(accessCookie(session)).not.toContain('Max-Age');
    expect(refreshCookie(remembered)).toContain('Max-Age=604800');
    expect(accessCookie(remembered)).toContain('Max-Age=604800');
  });

  it('logs out by revoking the refresh token and clearing cookies', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/api/auth/login')
      .send(credentials)
      .expect(200);
    const refresh = cookie(login, 'refresh_token');

    const logout = await request(app.getHttpServer())
      .post('/v1/api/auth/logout')
      .set('Cookie', refresh)
      .expect(204);
    expect(cookiesOf(logout).join()).toContain('refresh_token=;');

    await request(app.getHttpServer())
      .post('/v1/api/auth/refresh')
      .set('Cookie', refresh)
      .expect(401);
  });
});
