import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { instagramCallbackUrl } from '../config/public-urls';

@Injectable()
export class InstagramOAuthConfig {
  readonly authorizationUrl = 'https://www.instagram.com/oauth/authorize';
  readonly tokenUrl = 'https://api.instagram.com/oauth/access_token';
  readonly graphBaseUrl = 'https://graph.instagram.com';
  readonly graphApiVersion: string;
  readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.graphApiVersion =
      this.configService.get<string>('INSTAGRAM_GRAPH_API_VERSION') ?? 'v24.0';
    this.timeoutMs = this.readTimeout();
  }

  get clientId(): string {
    return this.configService.getOrThrow<string>('INSTAGRAM_APP_ID');
  }

  get clientSecret(): string {
    return this.configService.getOrThrow<string>('INSTAGRAM_APP_SECRET');
  }

  get redirectUri(): string {
    return (
      this.configService.get<string>('INSTAGRAM_REDIRECT_URI')?.trim() ||
      instagramCallbackUrl()
    );
  }

  private readTimeout(): number {
    const value = Number(
      this.configService.get<string>('INSTAGRAM_API_TIMEOUT_MS') ?? '10000',
    );
    return Number.isSafeInteger(value) && value >= 1_000 && value <= 60_000
      ? value
      : 10_000;
  }
}
