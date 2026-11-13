import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';

const PASSWORD = 'passw0rd123';
const API = '/v1/api';

interface Account {
  email: string;
  slug: string;
  cookie: string;
}

describe('Shop RBAC (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let owner: Account;
  let employee: Account;
  let manager: Account;
  let outsider: Account;
  let shopSlug: string;

  const http = () => request(app.getHttpServer());

  async function register(email: string): Promise<Account> {
    const res = await http()
      .post(`${API}/auth/register`)
      .send({ email, password: PASSWORD, shopName: `ร้าน ${email}`, fullName: 'ทดสอบ ระบบ' })
      .expect(201);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((c) => c.startsWith('access_token='))!;
    return { email, slug: res.body.user.slug, cookie: access.split(';')[0] };
  }

  // Moves a registered user (an owner of their own shop) into `shop` as
  // `role`; their own shop goes, since the role applies to every shop.
  async function addMember(shop: string, userSlug: string, role: string) {
    await db.query(
      `DELETE FROM shops WHERE id IN (
         SELECT m.shop_id FROM shop_members m JOIN users u ON u.id = m.user_id
         WHERE u.slug = $1)`,
      [userSlug],
    );
    await db.query(`UPDATE users SET role = $2 WHERE slug = $1`, [
      userSlug,
      role,
    ]);
    await db.query(
      `INSERT INTO shop_members (shop_id, user_id)
       SELECT s.id, u.id FROM shops s, users u WHERE s.slug = $1 AND u.slug = $2`,
      [shop, userSlug],
    );
  }

  async function roleOf(userSlug: string): Promise<string> {
    const [row] = await db.query(`SELECT role FROM users WHERE slug = $1`, [
      userSlug,
    ]);
    return row.role;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    db = app.get(DataSource);

    owner = await register('rbac-owner@shop.com');
    employee = await register('rbac-employee@shop.com');
    manager = await register('rbac-manager@shop.com');
    outsider = await register('rbac-outsider@shop.com');

    const mine = await http()
      .get(`${API}/shops/mine`)
      .set('Cookie', owner.cookie)
      .expect(200);
    shopSlug = mine.body[0].slug;
    await addMember(shopSlug, employee.slug, 'employee');
    await addMember(shopSlug, manager.slug, 'branch_manager');
  });

  afterAll(async () => {
    await app.close();
  });

  it('registration creates a shop owned by the new user', async () => {
    const res = await http()
      .get(`${API}/shops/mine`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      name: 'ร้าน rbac-owner@shop.com',
      role: { key: 'shop_owner', name: 'Shop Owner' },
    });
    expect(res.body[0].permissions).toContain('users.change_role');
  });

  it('hides a shop from non-members and checks permissions per role', async () => {
    await http()
      .get(`${API}/shops/${shopSlug}`)
      .set('Cookie', outsider.cookie)
      .expect(404);
    await http()
      .get(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', employee.cookie)
      .expect(403);

    const members = await http()
      .get(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', manager.cookie)
      .expect(200);
    expect(members.body).toHaveLength(3);

    // branch_manager has no users.change_role
    await http()
      .patch(`${API}/shops/${shopSlug}/members/${employee.slug}`)
      .set('Cookie', manager.cookie)
      .send({ role: 'branch_manager' })
      .expect(403);
  });

  it('lets the owner change a member to a fixed role', async () => {
    const res = await http()
      .patch(`${API}/shops/${shopSlug}/members/${employee.slug}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'branch_manager' })
      .expect(200);
    expect(res.body.role).toEqual({
      key: 'branch_manager',
      name: 'Branch Manager',
    });
    expect(await roleOf(employee.slug)).toBe('branch_manager');

    const me = await http()
      .get(`${API}/shops/${shopSlug}`)
      .set('Cookie', employee.cookie)
      .expect(200);
    expect(me.body.permissions).toContain('users.invite');

    const [log] = await db.query(
      `SELECT details FROM audit_logs WHERE action = 'shop_member.change_role'`,
    );
    expect(log.details).toEqual({ from: 'employee', to: 'branch_manager' });

    await http()
      .patch(`${API}/shops/${shopSlug}/members/${employee.slug}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'employee' })
      .expect(200);
  });

  it('has no custom roles', async () => {
    await http()
      .post(`${API}/shops/${shopSlug}/roles`)
      .set('Cookie', owner.cookie)
      .send({ name: 'แคชเชียร์', permissions: ['orders.view'] })
      .expect(404);
    await http()
      .patch(`${API}/shops/${shopSlug}/members/${employee.slug}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'cashier' })
      .expect(400);
  });

  it('blocks privilege escalation', async () => {
    // Not to their own level, and not themselves.
    await http()
      .patch(`${API}/shops/${shopSlug}/members/${manager.slug}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'shop_owner' })
      .expect(403);
    await http()
      .patch(`${API}/shops/${shopSlug}/members/${owner.slug}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'employee' })
      .expect(400);
  });

  it('gives a platform admin access to any shop but keeps one owner', async () => {
    await db.query(`UPDATE users SET role = 'admin' WHERE slug = $1`, [
      outsider.slug,
    ]);
    await http()
      .get(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', outsider.cookie)
      .expect(200);
    await http()
      .patch(`${API}/shops/${shopSlug}/members/${owner.slug}`)
      .set('Cookie', outsider.cookie)
      .send({ role: 'employee' })
      .expect(409);
  });
});
