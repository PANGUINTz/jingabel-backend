import { ApiProperty } from '@nestjs/swagger';
import type { DeviceType } from '../device.js';

export class SessionResponse {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Chrome บน macOS', nullable: true })
  deviceName: string | null;

  @ApiProperty({
    enum: ['desktop', 'mobile', 'tablet'],
    example: 'desktop',
    nullable: true,
  })
  deviceType: DeviceType | null;

  @ApiProperty({ example: '203.0.113.7', nullable: true })
  ipAddress: string | null;

  @ApiProperty({
    example: 'Bangkok, TH',
    nullable: true,
    description:
      'จังหวัดและรหัสประเทศจาก IP — เหลือแค่ประเทศถ้าไม่รู้จังหวัด, null ถ้าเป็น IP ภายใน',
  })
  location: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ description: 'ครั้งล่าสุดที่ขอ access token ใหม่' })
  lastActiveAt: Date;

  @ApiProperty({ description: 'true คือ session ของอุปกรณ์ที่เรียก API นี้' })
  current: boolean;
}
