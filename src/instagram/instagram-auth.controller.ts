import { Controller, Get, Query } from '@nestjs/common';

@Controller('auth/instagram')
export class InstagramAuthController {
  @Get('callback')
  handleCallback(
    @Query('code') code?: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
  ) {
    if (error) {
      return {
        connected: false,
        error,
        errorDescription,
      };
    }

    return {
      connected: Boolean(code),
      message: code
        ? 'Instagram authorisation received.'
        : 'Instagram callback endpoint is running.',
    };
  }
}
