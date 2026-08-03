import { Injectable } from '@nestjs/common';
import { GoTrueClient } from '@supabase/auth-js';
import { SupabaseAuthConfig } from './supabase-auth.config';

@Injectable()
export class SupabaseAuthClaimsClient {
  private readonly client: GoTrueClient | null;

  constructor(config: SupabaseAuthConfig) {
    this.client = config.configured
      ? new GoTrueClient({
          url: `${config.url}/auth/v1`,
          headers: { apikey: config.key },
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        })
      : null;
  }

  getClaims(accessToken: string) {
    if (!this.client) {
      throw new Error('Supabase user authentication is not configured');
    }
    return this.client.getClaims(accessToken);
  }
}
