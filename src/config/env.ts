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
}

export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, { enableImplicitConversion: true });
  const errors = validateSync(env);
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment variables:\n${errors.map((e) => e.toString()).join('')}`,
    );
  }
  return env;
}
