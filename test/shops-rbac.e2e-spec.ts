import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { MailService } from './../src/mail/mail.service.js';
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
  let mailSpy: MockInstance<MailService['send']>;

  // The invitation link of the last email sent to `email`.
  function lastInviteToken(email: string): string {
    const call = mailSpy.mock.calls.filter(([to]) => to === email).at(-1);
    if (!call) throw new Error(`no email sent to ${email}`);
    const { text } = call[1];
    const url = text.match(/https?:\/\/\S+/)![0];
    return new URL(url).searchParams.get('token')!;
  }

  async function branchSlugOf(cookie: string): Promise<string> {
    const res = await http()
      .get(`${API}/shops/${shopSlug}/branches`)
      .set('Cookie', cookie)
      .expect(200);
    return res.body[0].slug;
  }

  const http = () => request(app.getHttpServer());

  async function register(email: string): Promise<Account> {
    const res = await http()
      .post(`${API}/auth/register`)
      .send({
        email,
        password: PASSWORD,
        shopName: `ร้าน ${email}`,
        fullName: 'ทดสอบ ระบบ',
      })
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
      `INSERT INTO shop_members (shop_id, user_id, branch_id)
       SELECT s.id, u.id, b.id FROM shops s
       JOIN shop_branches b ON b.shop_id = s.id, users u
       WHERE s.slug = $1 AND u.slug = $2`,
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
    mailSpy = vi.spyOn(app.get(MailService), 'send');

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
      role: { key: 'shop_owner', name: 'เจ้าของร้าน' },
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
    expect(members.body.meta).toEqual({
      total: 3,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    expect(members.body.data[0]).toMatchObject({
      user: { slug: owner.slug },
      role: { key: 'shop_owner' },
      branch: { name: 'สาขาหลัก' },
    });

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
      name: 'ผู้จัดการสาขา',
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

  it('filters and pages the member list', async () => {
    const byRole = await http()
      .get(`${API}/shops/${shopSlug}/members?role=branch_manager`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(
      byRole.body.data.map((m: { user: { slug: string } }) => m.user.slug),
    ).toEqual([manager.slug]);

    const bySearch = await http()
      .get(`${API}/shops/${shopSlug}/members?search=rbac-employee&limit=1`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(bySearch.body.meta.total).toBe(1);

    await http()
      .get(`${API}/shops/${shopSlug}/members?limit=500`)
      .set('Cookie', owner.cookie)
      .expect(400);
  });

  it('suspends and reactivates a member', async () => {
    await http()
      .patch(`${API}/shops/${shopSlug}/members/${employee.slug}/status`)
      .set('Cookie', owner.cookie)
      .send({ status: 'suspended' })
      .expect(200);
    const suspended = await http()
      .get(`${API}/shops/${shopSlug}/members?status=suspended`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(suspended.body.meta.total).toBe(1);

    // A manager can't act on someone at their own level.
    await http()
      .patch(`${API}/shops/${shopSlug}/members/${owner.slug}/status`)
      .set('Cookie', manager.cookie)
      .send({ status: 'suspended' })
      .expect(403);

    await http()
      .patch(`${API}/shops/${shopSlug}/members/${employee.slug}/status`)
      .set('Cookie', owner.cookie)
      .send({ status: 'active' })
      .expect(200);
  });

  it('lists branches and lets the owner rename one', async () => {
    const list = await http()
      .get(`${API}/shops/${shopSlug}/branches`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('สาขาหลัก');
    const branchSlug = list.body[0].slug;

    // branches.manage is owner-only.
    await http()
      .patch(`${API}/shops/${shopSlug}/branches/${branchSlug}`)
      .set('Cookie', manager.cookie)
      .send({ name: 'สาขาใหม่' })
      .expect(403);
    await http()
      .patch(`${API}/shops/${shopSlug}/branches/${branchSlug}`)
      .set('Cookie', owner.cookie)
      .send({ name: 'x' })
      .expect(400);

    const renamed = await http()
      .patch(`${API}/shops/${shopSlug}/branches/${branchSlug}`)
      .set('Cookie', owner.cookie)
      .send({ name: '  สาขาสุขุมวิท  ' })
      .expect(200);
    expect(renamed.body).toMatchObject({
      slug: branchSlug,
      name: 'สาขาสุขุมวิท',
    });

    // Adding a branch: owner only, names unique within the shop.
    await http()
      .post(`${API}/shops/${shopSlug}/branches`)
      .set('Cookie', manager.cookie)
      .send({ name: 'สาขาอารีย์' })
      .expect(403);
    const added = await http()
      .post(`${API}/shops/${shopSlug}/branches`)
      .set('Cookie', owner.cookie)
      .send({ name: '  สาขาอารีย์ ' })
      .expect(201);
    expect(added.body).toMatchObject({ name: 'สาขาอารีย์' });
    await http()
      .post(`${API}/shops/${shopSlug}/branches`)
      .set('Cookie', owner.cookie)
      .send({ name: 'สาขาสุขุมวิท' })
      .expect(409);
    const after = await http()
      .get(`${API}/shops/${shopSlug}/branches`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(after.body.map((b: { name: string }) => b.name)).toEqual([
      'สาขาสุขุมวิท',
      'สาขาอารีย์',
    ]);

    // Another shop's branch looks the same as a missing one.
    await http()
      .patch(`${API}/shops/${shopSlug}/branches/AAAAAAAAAA`)
      .set('Cookie', owner.cookie)
      .send({ name: 'สาขาอื่น' })
      .expect(404);
  });

  it('returns the shop and branches in /auth/me', async () => {
    const me = await http()
      .get(`${API}/auth/me`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(me.body.shop).toEqual({
      slug: shopSlug,
      name: 'ร้าน rbac-owner@shop.com',
    });
    // Owners get every branch of the shop, oldest (their own) first.
    const all = await http()
      .get(`${API}/shops/${shopSlug}/branches`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(me.body.branches).toEqual(
      all.body.map(({ slug, name }: { slug: string; name: string }) => ({
        slug,
        name,
      })),
    );
    expect(me.body.branch.slug).toBe(me.body.branches[0].slug);

    // Non-owners only get their own branch.
    const mgr = await http()
      .get(`${API}/auth/me`)
      .set('Cookie', manager.cookie)
      .expect(200);
    expect(mgr.body.shop.slug).toBe(shopSlug);
    expect(mgr.body.branches).toEqual([mgr.body.branch]);
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

  it('invites a member who accepts by setting a password', async () => {
    const email = 'rbac-invitee@shop.com';
    const branchSlug = await branchSlugOf(owner.cookie);
    const created = await http()
      .post(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', owner.cookie)
      .send({ email, fullName: 'ผู้ถูก เชิญ', role: 'employee', branchSlug })
      .expect(201);
    expect(created.body).toMatchObject({
      user: { email, status: 'pending' },
      role: { key: 'employee' },
    });

    const [, mail] = mailSpy.mock.calls.at(-1)!;
    expect(mail.subject).toContain('ร้าน rbac-owner@shop.com');
    expect(mail.html).toContain('พนักงาน');
    const token = lastInviteToken(email);

    // Can't sign in before accepting.
    await http()
      .post(`${API}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(401);

    const preview = await http()
      .post(`${API}/auth/invitations/preview`)
      .send({ token })
      .expect(200);
    expect(preview.body).toMatchObject({
      email,
      shopName: 'ร้าน rbac-owner@shop.com',
      role: { key: 'employee' },
    });

    await http()
      .post(`${API}/auth/invitations/accept`)
      .send({ token, password: PASSWORD, confirmPassword: 'different1' })
      .expect(400);
    const accepted = await http()
      .post(`${API}/auth/invitations/accept`)
      .send({ token, password: PASSWORD, confirmPassword: PASSWORD })
      .expect(200);
    expect(accepted.body.user).toMatchObject({ email, status: 'active' });
    expect(accepted.headers['set-cookie']).toBeDefined();

    // One use only, and now the password works.
    await http()
      .post(`${API}/auth/invitations/accept`)
      .send({ token, password: PASSWORD, confirmPassword: PASSWORD })
      .expect(410);
    await http()
      .post(`${API}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);
    await http()
      .post(`${API}/auth/invitations/preview`)
      .send({ token: 'not-a-real-token' })
      .expect(404);
  });

  it('checks who may be invited, and by whom', async () => {
    const branchSlug = await branchSlugOf(owner.cookie);
    await http()
      .post(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', owner.cookie)
      .send({
        email: owner.email,
        fullName: 'ซ้ำ ซ้ำ',
        role: 'employee',
        branchSlug,
      })
      .expect(409);
    // Not to their own level.
    await http()
      .post(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', manager.cookie)
      .send({
        email: 'x1@shop.com',
        fullName: 'เอ็กซ์ หนึ่ง',
        role: 'branch_manager',
        branchSlug,
      })
      .expect(403);
    await http()
      .post(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', employee.cookie)
      .send({
        email: 'x2@shop.com',
        fullName: 'เอ็กซ์ สอง',
        role: 'employee',
        branchSlug,
      })
      .expect(403);
    await http()
      .post(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', owner.cookie)
      .send({
        email: 'x3@shop.com',
        fullName: 'เอ็กซ์ สาม',
        role: 'employee',
        branchSlug: 'AAAAAAAAAA',
      })
      .expect(404);
  });

  it('keeps nothing when the email fails, and can resend or cancel', async () => {
    const branchSlug = await branchSlugOf(owner.cookie);
    const email = 'rbac-pending@shop.com';
    mailSpy.mockRejectedValueOnce(new Error('smtp down'));
    await http()
      .post(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', owner.cookie)
      .send({ email, fullName: 'รอ ยืนยัน', role: 'employee', branchSlug })
      .expect(503);
    expect(
      await db.query(`SELECT 1 FROM users WHERE email = $1`, [email]),
    ).toHaveLength(0);

    const created = await http()
      .post(`${API}/shops/${shopSlug}/members`)
      .set('Cookie', owner.cookie)
      .send({ email, fullName: 'รอ ยืนยัน', role: 'employee', branchSlug })
      .expect(201);
    const slug = created.body.user.slug;
    const firstToken = lastInviteToken(email);

    await http()
      .post(`${API}/shops/${shopSlug}/members/${slug}/invitation`)
      .set('Cookie', owner.cookie)
      .expect(204);
    // The old link stops working.
    expect(lastInviteToken(email)).not.toBe(firstToken);
    await http()
      .post(`${API}/auth/invitations/preview`)
      .send({ token: firstToken })
      .expect(404);

    // A pending account can't be suspended; removing it deletes it.
    await http()
      .patch(`${API}/shops/${shopSlug}/members/${slug}/status`)
      .set('Cookie', owner.cookie)
      .send({ status: 'suspended' })
      .expect(400);
    await http()
      .delete(`${API}/shops/${shopSlug}/members/${slug}`)
      .set('Cookie', owner.cookie)
      .expect(204);
    expect(
      await db.query(`SELECT 1 FROM users WHERE email = $1`, [email]),
    ).toHaveLength(0);
  });

  it('removes a member from the shop but keeps their account', async () => {
    await http()
      .delete(`${API}/shops/${shopSlug}/members/${owner.slug}`)
      .set('Cookie', owner.cookie)
      .expect(400);
    await http()
      .delete(`${API}/shops/${shopSlug}/members/${employee.slug}`)
      .set('Cookie', owner.cookie)
      .expect(204);
    await http()
      .get(`${API}/shops/${shopSlug}`)
      .set('Cookie', employee.cookie)
      .expect(404);
    const [user] = await db.query(`SELECT 1 FROM users WHERE slug = $1`, [
      employee.slug,
    ]);
    expect(user).toBeDefined();
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
    await http()
      .delete(`${API}/shops/${shopSlug}/members/${owner.slug}`)
      .set('Cookie', outsider.cookie)
      .expect(409);
  });
});
