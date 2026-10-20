import { ApiProperty } from '@nestjs/swagger';
import { UserResponse } from '../../users/dto/user.response.js';

// Tokens are never in the body — they are set as httpOnly cookies.
export class AuthResponse {
  @ApiProperty({ type: UserResponse })
  user: UserResponse;
}
