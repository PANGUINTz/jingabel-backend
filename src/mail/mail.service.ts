import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { Env } from '../config/env.js';
import type { MailContent } from './mail.types.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  // No SMTP_HOST (development/test): messages are built but only logged.
  private readonly dryRun: boolean;

  constructor(config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    this.dryRun = !host;
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: config.get('SMTP_PORT', { infer: true }),
          secure: config.get('SMTP_SECURE', { infer: true }),
          ...(user && {
            auth: { user, pass: config.get('SMTP_PASS', { infer: true }) },
          }),
        })
      : nodemailer.createTransport({ jsonTransport: true });
  }

  async send(to: string, content: MailContent): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, ...content });
    if (this.dryRun) {
      this.logger.log(
        `SMTP_HOST not set — not sent. To: ${to} | ${content.subject}\n${content.text}`,
      );
    }
  }
}
