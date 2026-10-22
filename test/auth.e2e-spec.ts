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

  // Shares one user's sessions across tests to stay under the 10/min login limit.
  describe('sessions', () => {
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const user = { email: 'sessions@shop.com', password: 'passw0rd123' };
    let laptop: string[];
    let phone: string[];
    let tablet: string[];

    function bothCookies(res: request.Response): string[] {
      return [cookie(res, 'access_token'), cookie(res, 'refresh_token')];
    }

    function listSessions(cookies: string[]) {
      return request(app.getHttpServer())
        .get('/v1/api/auth/sessions')
        .set('Cookie', cookies)
        .expect(200);
    }

    beforeAll(async () => {
      const registered = await request(app.getHttpServer())
        .post('/v1/api/auth/register')
        .set('User-Agent', chrome)
        .send({ ...user, shopName: 'ร้านหลายเครื่อง', fullName: 'มานี มีนา' })
        .expect(201);
      laptop = bothCookies(registered);

      const loginFromIphone = () =>
        request(app.getHttpServer())
          .post('/v1/api/auth/login')
          .set('User-Agent', iphone)
          .send(user)
          .expect(200);
      phone = bothCookies(await loginFromIphone());
      tablet = bothCookies(await loginFromIphone());
    });

    it('lists the signed-in devices and marks the current one', async () => {
      const res = await listSessions(laptop);

      expect(res.body).toHaveLength(3);
      expect(res.body.filter((s: { current: boolean }) => s.current)).toEqual([
        expect.objectContaining({
          deviceName: 'Chrome บน macOS',
          deviceType: 'desktop',
        }),
      ]);
      expect(res.body).toContainEqual(
        expect.objectContaining({
          deviceName: 'Safari บน iOS',
          deviceType: 'mobile',
          current: false,
        }),
      );
      expect(JSON.stringify(res.body)).not.toContain('refreshToken');
    });

    it('drops a session from the list on logout', async () => {
      await request(app.getHttpServer())
        .post('/v1/api/auth/logout')
        .set('Cookie', tablet)
        .expect(204);

      expect((await listSessions(laptop)).body).toHaveLength(2);
      await request(app.getHttpServer())
        .post('/v1/api/auth/refresh')
        .set('Cookie', tablet[1])
        .expect(401);
    });

    it('revokes one other device, but not the current or a missing one', async () => {
      const sessions = (await listSessions(laptop)).body as {
        id: number;
        current: boolean;
      }[];
      const current = sessions.find((s) => s.current)!;
      const phoneId = (await listSessions(phone)).body.find(
        (s: { current: boolean }) => s.current,
      ).id;

      await request(app.getHttpServer())
        .delete(`/v1/api/auth/sessions/${phoneId}`)
        .set('Cookie', laptop)
        .expect(204);
      await request(app.getHttpServer())
        .post('/v1/api/auth/refresh')
        .set('Cookie', phone[1])
        .expect(401);
      expect((await listSessions(laptop)).body).toHaveLength(
        sessions.length - 1,
      );

      await request(app.getHttpServer())
        .delete(`/v1/api/auth/sessions/${phoneId}`)
        .set('Cookie', laptop)
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/v1/api/auth/sessions/${current.id}`)
        .set('Cookie', laptop)
        .expect(400);
    });

    it('logout-all signs out every other device but keeps this one', async () => {
      await request(app.getHttpServer())
        .post('/v1/api/auth/logout-all')
        .set('Cookie', laptop)
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/api/auth/refresh')
        .set('Cookie', phone[1])
        .expect(401);
      await request(app.getHttpServer())
        .post('/v1/api/auth/refresh')
        .set('Cookie', laptop[1])
        .expect(200);

      const res = await listSessions(laptop);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].current).toBe(true);
    });

    it("rejects logout-all with another user's refresh token", async () => {
      const other = await request(app.getHttpServer())
        .post('/v1/api/auth/register')
        .send({
          email: 'intruder@shop.com',
          password: 'passw0rd123',
          shopName: 'ร้านอื่น',
          fullName: 'คนอื่น ทั่วไป',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/api/auth/logout-all')
        .set('Cookie', [laptop[0], cookie(other, 'refresh_token')])
        .expect(403);

      // Another user's session id is treated as missing.
      const otherId = (await listSessions(bothCookies(other))).body[0].id;
      await request(app.getHttpServer())
        .delete(`/v1/api/auth/sessions/${otherId}`)
        .set('Cookie', laptop)
        .expect(404);
    });
  });
});
