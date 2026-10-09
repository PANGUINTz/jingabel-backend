import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Every route requires a valid access token unless marked with @Public().
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
