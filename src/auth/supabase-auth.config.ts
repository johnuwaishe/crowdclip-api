import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseAuthConfig {
  private readonly supabaseUrl: string | undefined;
  private readonly publishableKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = this.normalizeUrl(
      this.configService.get<string>('SUPABASE_URL'),
    );
    this.publishableKey = this.configService.get<string>(
      'SUPABASE_PUBLISHABLE_KEY',
    );
  }

  get configured(): boolean {
    return Boolean(this.supabaseUrl && this.publishableKey);
  }

  get url(): string {
    if (!this.supabaseUrl) {
      throw new Error('SUPABASE_URL is required for CrowdClip user auth');
    }
    return this.supabaseUrl;
  }

  get key(): string {
    if (!this.publishableKey) {
      throw new Error(
        'SUPABASE_PUBLISHABLE_KEY is required for CrowdClip user auth',
      );
    }
    return this.publishableKey;
  }

  get issuer(): string {
    return `${this.url}/auth/v1`;
  }

  private normalizeUrl(value: string | undefined): string | undefined {
    const normalized = value?.trim().replace(/\/+$/, '');
    if (!normalized) return undefined;
    try {
      return new URL(normalized).toString().replace(/\/$/, '');
    } catch {
      throw new Error('SUPABASE_URL must be a valid absolute URL');
    }
  }
}
