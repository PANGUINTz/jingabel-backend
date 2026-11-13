import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';

const PASSWORD = 'passw0rd123';
const API = '/v1/api';

describe('Admin user management (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let adminCookie: string;
  let adminSlug: string;

  const http = () => request(app.getHttpServer());

  function accessCookie(res: request.Response): string {
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return cookies.find((c) => c.startsWith('access_token='))!.split(';')[0];
  }

  async function register(
    email: string,
  ): Promise<{ slug: string; cookie: string }> {
    const res = await http()
      .post(`${API}/auth/register`)
      .send({
        email,
        password: PASSWORD,
        shopName: `ร้าน ${email}`,
        fullName: 'ทดสอบ ระบบ',
      })
      .expect(201);
    return { slug: res.body.user.slug, cookie: accessCookie(res) };
  }

  async function login(email: string): Promise<string> {
    const res = await http()
      .post(`${API}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return accessCookie(res);
  }

  async function auditActions(): Promise<string[]> {
    const rows: { action: string }[] = await db.query(
      `SELECT action FROM audit_logs WHERE action LIKE 'user.%' ORDER BY created_at`,
    );
    return rows.map((row) => row.action);
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    db = app.get(DataSource);

    // The role is read from the access token, so log in again after promoting.
    const admin = await register('admin@platform.com');
    adminSlug = admin.slug;
    await db.query(`UPDATE users SET role = 'admin' WHERE slug = $1`, [
      adminSlug,
    ]);
    adminCookie = await login('admin@platform.com');
  });

  afterAll(async () => {
    await app.close();
  });

  it('is admin-only', async () => {
    const owner = await register('plain-owner@shop.com');
    await http()
      .get(`${API}/users?page=1&limit=10`)
      .set('Cookie', owner.cookie)
      .expect(403);
    await http()
      .patch(`${API}/users/${adminSlug}`)
      .set('Cookie', owner.cookie)
      .send({ fullName: 'แฮก เกอร์' })
      .expect(403);
  });

  it('searches with LIKE wildcards taken literally', async () => {
    const res = await http()
      .get(`${API}/users?page=1&limit=10&search=%25`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(res.body.meta.total).toBe(0);
    await http()
      .get(`${API}/users?page=1&limit=10&role=superuser`)
      .set('Cookie', adminCookie)
      .expect(400);
  });

  it('updates a user, audits it, and signs out a suspended user', async () => {
    const victim = await register('suspend-me@shop.com');
    const res = await http()
      .patch(`${API}/users/${victim.slug}`)
      .set('Cookie', adminCookie)
      .send({ fullName: 'ชื่อ ใหม่', status: 'suspended', branchId: 'x' })
      .expect(200);
    expect(res.body).toMatchObject({
      fullName: 'ชื่อ ใหม่',
      status: 'suspended',
    });
    expect(res.body.id).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();

    const [{ count }] = await db.query(
      `SELECT count(*)::int AS count FROM user_sessions
       WHERE user_slug = $1 AND revoked_at IS NULL`,
      [victim.slug],
    );
    expect(count).toBe(0);
    expect(await auditActions()).toContain('user.update');
  });

  it('refuses pending, self-changes and removing the last owner', async () => {
    const owner = await register('last-owner@shop.com');
    await http()
      .patch(`${API}/users/${owner.slug}`)
      .set('Cookie', adminCookie)
      .send({ status: 'pending' })
      .expect(400);
    await http()
      .patch(`${API}/users/${adminSlug}`)
      .set('Cookie', adminCookie)
      .send({ role: 'employee' })
      .expect(403);
    await http()
      .patch(`${API}/users/${owner.slug}`)
      .set('Cookie', adminCookie)
      .send({ role: 'employee' })
      .expect(409);
    await http()
      .delete(`${API}/users/${owner.slug}`)
      .set('Cookie', adminCookie)
      .expect(409);
    await http()
      .delete(`${API}/users/${adminSlug}`)
      .set('Cookie', adminCookie)
      .expect(403);
    await http()
      .delete(`${API}/users/nope000000`)
      .set('Cookie', adminCookie)
      .expect(404);
  });

  it('deletes a user who is not the last owner, with an audit entry', async () => {
    const owner = await register('co-owner-a@shop.com');
    const coOwner = await register('co-owner-b@shop.com');
    // Move co-owner B into A's shop as a second owner.
    await db.query(
      `DELETE FROM shops WHERE id IN (
         SELECT m.shop_id FROM shop_members m JOIN users u ON u.id = m.user_id
         WHERE u.slug = $1)`,
      [coOwner.slug],
    );
    await db.query(
      `INSERT INTO shop_members (shop_id, user_id, branch_id)
       SELECT m.shop_id, u2.id, m.branch_id FROM shop_members m
       JOIN users u1 ON u1.id = m.user_id, users u2
       WHERE u1.slug = $1 AND u2.slug = $2`,
      [owner.slug, coOwner.slug],
    );

    await http()
      .delete(`${API}/users/${coOwner.slug}`)
      .set('Cookie', adminCookie)
      .expect(204);
    const rows = await db.query(`SELECT 1 FROM users WHERE slug = $1`, [
      coOwner.slug,
    ]);
    expect(rows).toHaveLength(0);
    expect(await auditActions()).toContain('user.delete');
  });
});
