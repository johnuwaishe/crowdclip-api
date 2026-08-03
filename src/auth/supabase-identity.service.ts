import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthClaimsClient } from './supabase-auth-claims.client';
import { SupabaseAuthConfig } from './supabase-auth.config';
import { SupabaseIdentity } from './types/supabase-identity.type';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SupabaseIdentityService {
  constructor(
    private readonly claimsClient: SupabaseAuthClaimsClient,
    private readonly config: SupabaseAuthConfig,
  ) {}

  async verify(accessToken: string): Promise<SupabaseIdentity> {
    if (!accessToken || accessToken.length > 16_384) {
      throw this.invalidToken();
    }
    try {
      const result = await this.claimsClient.getClaims(accessToken);
      if (result.error || !result.data) throw this.invalidToken();
      const claims = result.data.claims;
      const userId = claims.sub;
      const email = claims.email;
      const expiresAtSeconds = claims.exp;
      if (
        typeof userId !== 'string' ||
        !UUID_PATTERN.test(userId) ||
        typeof email !== 'string' ||
        !email.trim() ||
        claims.role !== 'authenticated' ||
        claims.is_anonymous === true ||
        claims.iss !== this.config.issuer ||
        typeof expiresAtSeconds !== 'number' ||
        !Number.isSafeInteger(expiresAtSeconds) ||
        expiresAtSeconds * 1_000 <= Date.now()
      ) {
        throw this.invalidToken();
      }
      return {
        userId,
        email: email.trim().toLowerCase(),
        expiresAt: new Date(expiresAtSeconds * 1_000),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw this.invalidToken();
    }
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException(
      'Supabase access token is invalid or expired',
    );
  }
}
