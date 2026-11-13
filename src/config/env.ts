import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 4000;

  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3000';

  @Matches(/^postgres(ql)?:\/\//)
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  // Defaults to on outside production. Reads the raw value from `obj` because
  // implicit conversion has already turned the string "false" into true.
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj.SWAGGER_ENABLED;
    return raw === 'true' ? true : raw === 'false' ? false : raw;
  })
  @IsBoolean()
  SWAGGER_ENABLED?: boolean;

  // Lifetimes are in seconds.
  @IsInt()
  @Min(1)
  JWT_ACCESS_TTL: number = 60 * 15;

  @IsInt()
  @Min(1)
  JWT_REFRESH_TTL: number = 60 * 60 * 24 * 7;

  // Frontend base URL, used for links in emails (e.g. the invitation link).
  @Matches(/^https?:\/\/[^/]+.*[^/]$/, { message: 'APP_URL must be an http(s) URL without a trailing slash' })
  APP_URL: string = 'http://localhost:3000';

  // How long an invitation link stays valid, in seconds.
  @IsInt()
  @Min(60)
  INVITATION_TTL: number = 60 * 60 * 24 * 7;

  // How long a "set a new password" link stays valid, in seconds.
  @IsInt()
  @Min(60)
  PASSWORD_RESET_TTL: number = 60 * 60;

  // Outgoing mail (nodemailer over SMTP). Without SMTP_HOST, outside
  // production, mail is not sent: it is logged, invitation link included.
  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT: number = 587;

  // true = TLS from the start (port 465); false = STARTTLS if offered (587).
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.SMTP_SECURE === 'true')
  @IsBoolean()
  SMTP_SECURE: boolean = false;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASS?: string;

  @IsString()
  MAIL_FROM: string = 'Jingabel <no-reply@jingabel.local>';
}

export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, { enableImplicitConversion: true });
  const errors = validateSync(env);
  if (env.NODE_ENV === 'production' && !env.SMTP_HOST) {
    throw new Error('Invalid environment variables:\nSMTP_HOST is required in production');
  }
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment variables:\n${errors.map((e) => e.toString()).join('')}`,
    );
  }
  return env;
}
