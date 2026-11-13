import type { MailContent } from '../mail.types.js';
import { MAIL_COLORS, mailDateFormat, renderMailLayout, strong } from './layout.js';

export interface PasswordResetMailData {
  fullName: string;
  email: string;
  resetUrl: string;
  expiresAt: Date;
}

export function passwordResetMail(data: PasswordResetMailData): MailContent {
  const subject = 'ตั้งรหัสผ่านใหม่สำหรับบัญชี Jingabel ของคุณ';
  const expires = mailDateFormat.format(data.expiresAt);

  const html = renderMailLayout({
    subject,
    preheader: 'มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ — ลิงก์ใช้ได้ครั้งเดียว',
    eyebrow: 'ตั้งรหัสผ่านใหม่',
    title: `สวัสดีคุณ ${data.fullName}`,
    bodyHtml: `เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี ${strong(data.email)} กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ เมื่อเปลี่ยนแล้ว ทุกอุปกรณ์ที่เข้าสู่ระบบอยู่จะถูกออกจากระบบ`,
    button: {
      label: 'ตั้งรหัสผ่านใหม่',
      url: data.resetUrl,
      note: `ลิงก์นี้ใช้ได้ถึง ${expires} และใช้ได้ครั้งเดียว`,
    },
    footer:
      'ถ้าคุณไม่ได้ขอตั้งรหัสผ่านใหม่ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
  });

  const text = [
    `สวัสดีคุณ ${data.fullName}`,
    '',
    `เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี ${data.email}`,
    'เปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่:',
    data.resetUrl,
    '',
    `ลิงก์ใช้ได้ถึง ${expires} และใช้ได้ครั้งเดียว`,
    'ถ้าคุณไม่ได้ขอตั้งรหัสผ่านใหม่ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
  ].join('\n');

  return { subject, html, text };
}

// Sent instead of a reset link when the account is suspended: the owner of the
// mailbox learns why, while the forgot-password page itself reveals nothing.
export function accountSuspendedMail(data: Pick<PasswordResetMailData, 'fullName' | 'email'>): MailContent {
  const subject = 'บัญชี Jingabel ของคุณถูกระงับการใช้งาน';

  const html = renderMailLayout({
    subject,
    preheader: 'ไม่สามารถตั้งรหัสผ่านใหม่ได้ เพราะบัญชีถูกระงับการใช้งาน',
    eyebrow: 'บัญชีถูกระงับ',
    title: `สวัสดีคุณ ${data.fullName}`,
    bodyHtml: `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี ${strong(data.email)} แต่บัญชีนี้ถูกระงับการใช้งานอยู่ จึงไม่สามารถตั้งรหัสผ่านใหม่หรือเข้าสู่ระบบได้ กรุณาติดต่อเจ้าของร้านหรือผู้จัดการสาขาของคุณเพื่อปลดระงับบัญชี`,
    accent: MAIL_COLORS.danger,
    footer: 'ถ้าคุณไม่ได้ขอตั้งรหัสผ่านใหม่ ไม่ต้องทำอะไร',
  });

  const text = [
    `สวัสดีคุณ ${data.fullName}`,
    '',
    `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี ${data.email} แต่บัญชีนี้ถูกระงับการใช้งานอยู่`,
    'จึงไม่สามารถตั้งรหัสผ่านใหม่หรือเข้าสู่ระบบได้',
    'กรุณาติดต่อเจ้าของร้านหรือผู้จัดการสาขาของคุณเพื่อปลดระงับบัญชี',
  ].join('\n');

  return { subject, html, text };
}
