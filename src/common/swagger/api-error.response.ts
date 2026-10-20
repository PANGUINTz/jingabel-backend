import { ApiProperty } from '@nestjs/swagger';

// Shape of every error Nest returns by default.
export class ApiErrorResponse {
  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Unauthorized',
    description: 'ข้อความเดียว หรือรายการข้อความเมื่อ validation ไม่ผ่าน',
  })
  message: string | string[];

  @ApiProperty({ example: 'Unauthorized', required: false })
  error?: string;
}
