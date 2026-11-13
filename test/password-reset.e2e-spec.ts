import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { MockInstance } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { MailService } from './../src/mail/mail.service.js';

const API = '/v1/api';
const PASSWORD = 'passw0rd123';
const NEW_PASSWORD = 'newpassw0rd';

describe('Forgot password & suspended accounts (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let mailSpy: MockInstance<MailService['send']>;

  const http = () => request(app.getHttpServer());

  async function register(email: string): Promise<string[]> {
    const res = await http()
      .post(`${API}/auth/register`)
      .send({ email, password: PASSWORD, shopName: `ร้าน ${email}`, fullName: 'ทดสอบ ระบบ' })
      .expect(201);
    return res.headers['set-cookie'] as unknown as string[];
  }

  function mailsTo(email: string) {
    return mailSpy.mock.calls.filter(([to]) => to === email).map(([, mail]) => mail);
  }

  function lastResetToken(email: string): string {
    const mail = mailsTo(email).at(-1)!;
    const url = mail.text.match(/https?:\/\/\S+/)![0];
    return new URL(url).searchParams.get('token')!;
  }

  const setStatus = (email: string, status: string) =>
    db.query(`UPDATE users SET status = $2 WHERE email = $1`, [email, status]);

  // A fresh app per test: forgot-password allows 5 requests a minute, and
  // each app has its own rate-limit counters. Every test makes its own data.
  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    db = app.get(DataSource);
    mailSpy = vi.spyOn(app.get(MailService), 'send');
  });

  afterEach(async () => {
    await app.close();
  });

  it('resets the password with the emailed link and signs out every device', async () => {
    const email = 'reset-active@shop.com';
    const cookies = await register(email);
    const refresh = cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];

    await http().post(`${API}/auth/password/forgot`).send({ email }).expect(204);
    const [mail] = mailsTo(email);
    expect(mail.subject).toContain('ตั้งรหัสผ่านใหม่');
    const token = lastResetToken(email);

    const preview = await http()
      .post(`${API}/auth/password/reset/preview`)
      .send({ token })
      .expect(200);
    expect(preview.body.email).toBe(email);

    await http()
      .post(`${API}/auth/password/reset`)
      .send({ token, password: NEW_PASSWORD, confirmPassword: 'mismatch1' })
      .expect(400);
    await http()
      .post(`${API}/auth/password/reset`)
      .send({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
      .expect(204);

    // One use only; old password gone; new one works; old sessions ended.
    await http()
      .post(`${API}/auth/password/reset`)
      .send({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
      .expect(410);
    await http().post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(401);
    await http().post(`${API}/auth/login`).send({ email, password: NEW_PASSWORD }).expect(200);
    await http().post(`${API}/auth/refresh`).set('Cookie', refresh).expect(401);
  });

  it('only lets the newest link work', async () => {
    const email = 'reset-twice@shop.com';
    await register(email);
    await http().post(`${API}/auth/password/forgot`).send({ email }).expect(204);
    const first = lastResetToken(email);
    await http().post(`${API}/auth/password/forgot`).send({ email }).expect(204);
    await http().post(`${API}/auth/password/reset/preview`).send({ token: first }).expect(404);
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    const before = mailSpy.mock.calls.length;
    await http()
      .post(`${API}/auth/password/forgot`)
      .send({ email: 'nobody@shop.com' })
      .expect(204);
    expect(mailSpy.mock.calls.length).toBe(before);
    await http().post(`${API}/auth/password/forgot`).send({ email: 'not-an-email' }).expect(400);
  });

  it('blocks suspended accounts from signing in, refreshing and resetting', async () => {
    const email = 'reset-suspended@shop.com';
    const cookies = await register(email);
    const refresh = cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];

    // A link requested while still active…
    await http().post(`${API}/auth/password/forgot`).send({ email }).expect(204);
    const token = lastResetToken(email);
    await setStatus(email, 'suspended');

    // …can't be used once suspended.
    await http().post(`${API}/auth/password/reset/preview`).send({ token }).expect(403);
    await http()
      .post(`${API}/auth/password/reset`)
      .send({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
      .expect(403);

    // Forgot password: same answer, but the email says "suspended", no link.
    await http().post(`${API}/auth/password/forgot`).send({ email }).expect(204);
    const notice = mailsTo(email).at(-1)!;
    expect(notice.subject).toContain('ถูกระงับ');
    expect(notice.text).not.toMatch(/https?:\/\//);

    // Wrong password: the usual answer. Right password: told it's suspended.
    await http().post(`${API}/auth/login`).send({ email, password: 'wrongpass1' }).expect(401);
    const login = await http().post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(403);
    expect(login.body.message).toContain('ถูกระงับ');

    // An existing session can't be extended.
    await http().post(`${API}/auth/refresh`).set('Cookie', refresh).expect(401);

    // Reactivated: signing in works again.
    await setStatus(email, 'active');
    await http().post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(200);
  });

  it('sends pending (invited) accounts nothing', async () => {
    const email = 'reset-pending@shop.com';
    await register(email);
    await setStatus(email, 'pending');
    const before = mailsTo(email).length;
    await http().post(`${API}/auth/password/forgot`).send({ email }).expect(204);
    expect(mailsTo(email).length).toBe(before);
  });
});
