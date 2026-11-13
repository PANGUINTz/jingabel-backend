import type { MailContent } from '../mail.types.js';
import { mailDateFormat, renderMailLayout, strong } from './layout.js';

export interface InvitationMailData {
  inviteeName: string;
  inviterName: string;
  shopName: string;
  branchName: string;
  roleLabel: string;
  acceptUrl: string;
  expiresAt: Date;
}

export function invitationMail(data: InvitationMailData): MailContent {
  const subject = `คุณได้รับคำเชิญเข้าร่วมร้าน ${data.shopName} บน Jingabel`;
  const expires = mailDateFormat.format(data.expiresAt);

  const html = renderMailLayout({
    subject,
    preheader: `${data.inviterName} เชิญคุณเข้าร่วม ${data.shopName} ในบทบาท ${data.roleLabel} — ยืนยันและตั้งรหัสผ่านเพื่อเริ่มใช้งาน`,
    eyebrow: 'คำเชิญเข้าร่วมทีม',
    title: `สวัสดีคุณ ${data.inviteeName}`,
    bodyHtml: `${strong(data.inviterName)} เชิญคุณเข้าร่วมทีมของ ${strong(data.shopName)} บน Jingabel กดปุ่มด้านล่างเพื่อยืนยันอีเมลและตั้งรหัสผ่าน แล้วคุณจะเข้าใช้งานได้ทันที`,
    details: [
      { label: 'ร้าน', value: data.shopName },
      { label: 'สาขา', value: data.branchName },
      { label: 'บทบาท', value: data.roleLabel, pill: true },
    ],
    button: {
      label: 'ยืนยันและตั้งรหัสผ่าน',
      url: data.acceptUrl,
      note: `ลิงก์นี้ใช้ได้ถึง ${expires} และใช้ได้ครั้งเดียว`,
    },
    footer:
      'ถ้าคุณไม่รู้จักร้านนี้หรือไม่ได้คาดว่าจะได้รับคำเชิญ ไม่ต้องทำอะไร บัญชีจะไม่ถูกเปิดใช้งาน',
  });

  const text = [
    `สวัสดีคุณ ${data.inviteeName}`,
    '',
    `${data.inviterName} เชิญคุณเข้าร่วมทีมของ ${data.shopName} บน Jingabel`,
    `ร้าน: ${data.shopName}`,
    `สาขา: ${data.branchName}`,
    `บทบาท: ${data.roleLabel}`,
    '',
    'เปิดลิงก์นี้เพื่อยืนยันอีเมลและตั้งรหัสผ่าน:',
    data.acceptUrl,
    '',
    `ลิงก์ใช้ได้ถึง ${expires} และใช้ได้ครั้งเดียว`,
    'ถ้าคุณไม่ได้คาดว่าจะได้รับคำเชิญนี้ ไม่ต้องทำอะไร บัญชีจะไม่ถูกเปิดใช้งาน',
  ].join('\n');

  return { subject, html, text };
}
