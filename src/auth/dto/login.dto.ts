import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
