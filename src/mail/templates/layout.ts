import { escapeHtml } from '../mail.types.js';

// Brand colours from DESIGN.md (light mode) — mail clients don't support CSS
// variables, so they are inlined here.
export const MAIL_COLORS = {
  navy: '#112D4E',
  primary: '#3F72AF',
  surfaceAlt: '#DBE2EF',
  base: '#F9F7F7',
  border: '#C9D3E3',
  textSecondary: '#4B5A70',
  danger: '#D64550',
  dangerSoft: '#FBE9EA',
};

const C = MAIL_COLORS;
const FONT =
  "'Noto Sans Thai','Plus Jakarta Sans',-apple-system,'Segoe UI',Tahoma,Arial,sans-serif";

export const mailDateFormat = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

export interface MailLayout {
  /** Plain text — escaped here. */
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  /** Trusted HTML: callers escape every user-provided value they put in. */
  bodyHtml: string;
  /** A labelled list under the body; label and value are plain text. */
  details?: { label: string; value: string; pill?: boolean }[];
  button?: { label: string; url: string; note?: string };
  /** Plain text under everything, e.g. "if this wasn't you…". */
  footer: string;
  /** Accent strip colour; defaults to the brand primary. */
  accent?: string;
}

// Table layout + inline styles: the only thing every mail client renders the
// same way.
export function renderMailLayout(mail: MailLayout): string {
  const accent = mail.accent ?? C.primary;
  const details = mail.details?.length
    ? `
                <tr>
                  <td style="padding:24px 32px 8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.base};border:1px solid ${C.border};border-radius:10px;border-collapse:separate;">
${mail.details
  .map((row, index) => {
    const border =
      index < mail.details!.length - 1
        ? `border-bottom:1px solid ${C.border};`
        : '';
    const value = row.pill
      ? `<span style="display:inline-block;padding:3px 12px;border-radius:999px;background:${C.surfaceAlt};font-size:13px;font-weight:600;color:${C.navy};">${escapeHtml(row.value)}</span>`
      : escapeHtml(row.value);
    return `                      <tr>
                        <td style="padding:10px 16px;font-size:13px;color:${C.textSecondary};width:96px;${border}">${escapeHtml(row.label)}</td>
                        <td style="padding:10px 16px;font-size:14px;font-weight:600;color:${C.navy};${border}">${value}</td>
                      </tr>`;
  })
  .join('\n')}
                    </table>
                  </td>
                </tr>`
    : '';

  const url = mail.button ? escapeHtml(mail.button.url) : '';
  const button = mail.button
    ? `
                <tr>
                  <td align="center" style="padding:28px 32px 8px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="${C.primary}" style="border-radius:10px;">
                          <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(mail.button.label)}</a>
                        </td>
                      </tr>
                    </table>
                    ${mail.button.note ? `<p style="margin:14px 0 0;font-size:13px;color:${C.textSecondary};">${escapeHtml(mail.button.note)}</p>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 32px 32px;">
                    <p style="margin:0 0 6px;font-size:12px;color:${C.textSecondary};">ถ้ากดปุ่มไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:</p>
                    <p style="margin:0;font-size:12px;line-height:18px;word-break:break-all;"><a href="${url}" target="_blank" style="color:${C.primary};">${url}</a></p>
                  </td>
                </tr>`
    : `
                <tr><td style="padding:0 0 24px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(mail.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.base};font-family:${FONT};color:${C.navy};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(mail.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.base};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:36px;height:36px;background:${C.navy};border-radius:10px;text-align:center;vertical-align:middle;font-size:18px;font-weight:700;color:${C.base};">J</td>
                  <td style="padding-left:10px;font-size:18px;font-weight:700;color:${C.navy};letter-spacing:-0.2px;">Jingabel</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#FFFFFF;border:1px solid ${C.border};border-radius:16px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:6px;background:${accent};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:32px 32px 8px;">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.04em;color:${accent};">${escapeHtml(mail.eyebrow)}</p>
                    <h1 style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:700;color:${C.navy};">${escapeHtml(mail.title)}</h1>
                    <p style="margin:0;font-size:15px;line-height:24px;color:${C.textSecondary};">${mail.bodyHtml}</p>
                  </td>
                </tr>${details}${button}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:18px;color:${C.textSecondary};">
              ${escapeHtml(mail.footer)}<br>
              อีเมลนี้ส่งอัตโนมัติจาก Jingabel — กรุณาอย่าตอบกลับ
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// <strong> in the brand colour, around an escaped value.
export function strong(value: string): string {
  return `<strong style="color:${C.navy};">${escapeHtml(value)}</strong>`;
}
