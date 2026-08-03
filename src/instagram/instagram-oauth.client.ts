import { Injectable } from '@nestjs/common';
import { InstagramOAuthConfig } from './instagram-oauth.config';

export interface InstagramAccessToken {
  accessToken: string;
  expiresAt: Date | null;
}

export interface InstagramProfessionalProfile {
  id: string;
  username: string;
  accountType: 'BUSINESS' | 'CREATOR';
}

@Injectable()
export class InstagramOAuthClient {
  constructor(private readonly config: InstagramOAuthConfig) {}

  createAuthorizationUrl(state: string): string {
    const url = new URL(this.config.authorizationUrl);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'scope',
      'instagram_business_basic,instagram_business_manage_messages',
    );
    url.searchParams.set('state', state);
    url.searchParams.set('enable_fb_login', '0');
    url.searchParams.set('force_authentication', '1');
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<InstagramAccessToken> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
      code,
    });
    const shortLived = await this.request(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const shortToken = this.requiredString(shortLived, 'access_token');
    const exchangeUrl = new URL(`${this.config.graphBaseUrl}/access_token`);
    exchangeUrl.searchParams.set('grant_type', 'ig_exchange_token');
    exchangeUrl.searchParams.set('client_secret', this.config.clientSecret);
    exchangeUrl.searchParams.set('access_token', shortToken);
    const longLived = await this.request(exchangeUrl.toString());
    const accessToken = this.requiredString(longLived, 'access_token');
    const expiresIn = this.optionalPositiveInteger(longLived, 'expires_in');
    return {
      accessToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1_000) : null,
    };
  }

  async getProfile(accessToken: string): Promise<InstagramProfessionalProfile> {
    const url = new URL(
      `${this.config.graphBaseUrl}/${this.config.graphApiVersion}/me`,
    );
    url.searchParams.set('fields', 'user_id,username,account_type');
    const data = await this.request(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const rawType = this.requiredString(data, 'account_type');
    const accountType = rawType === 'MEDIA_CREATOR' ? 'CREATOR' : rawType;
    if (accountType !== 'BUSINESS' && accountType !== 'CREATOR') {
      throw new Error(
        'Instagram account must be a Business or Creator account',
      );
    }
    return {
      id:
        this.optionalString(data, 'user_id') ?? this.requiredString(data, 'id'),
      username: this.requiredString(data, 'username'),
      accountType,
    };
  }

  async subscribeToWebhooks(
    instagramAccountId: string,
    accessToken: string,
  ): Promise<void> {
    const url = new URL(
      `${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${encodeURIComponent(instagramAccountId)}/subscribed_apps`,
    );
    url.searchParams.set('subscribed_fields', 'messages,mentions');
    const result = await this.request(url.toString(), {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (result.success !== true) {
      throw new Error('Instagram webhook subscription was not accepted');
    }
  }

  private async request(
    url: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    timeout.unref();
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok || !this.isObject(value)) {
        throw new Error(
          `Instagram API request failed with HTTP ${response.status}`,
        );
      }
      if (this.isObject(value.error)) {
        const message = this.optionalString(value.error, 'message');
        throw new Error(`Instagram API error${message ? `: ${message}` : ''}`);
      }
      return value;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Instagram API request timed out', { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private requiredString(value: Record<string, unknown>, key: string): string {
    const field = this.optionalString(value, key);
    if (!field) throw new Error(`Instagram API response is missing ${key}`);
    return field;
  }

  private optionalString(
    value: Record<string, unknown>,
    key: string,
  ): string | null {
    const field = value[key];
    return typeof field === 'string' && field ? field : null;
  }

  private optionalPositiveInteger(
    value: Record<string, unknown>,
    key: string,
  ): number | null {
    const field = value[key];
    return typeof field === 'number' && Number.isSafeInteger(field) && field > 0
      ? field
      : null;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
