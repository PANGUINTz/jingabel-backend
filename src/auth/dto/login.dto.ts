import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@shop.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'passw0rd123', maxLength: 128 })
  @IsString()
  @MaxLength(128)
  password: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'true = refresh cookie อยู่ต่อหลังปิด browser',
  })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
