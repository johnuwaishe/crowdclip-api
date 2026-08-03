import { UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthClaimsClient } from './supabase-auth-claims.client';
import { SupabaseAuthConfig } from './supabase-auth.config';
import { SupabaseIdentityService } from './supabase-identity.service';

describe('SupabaseIdentityService', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const getClaims = jest.fn();
  const claimsClient = {
    getClaims,
  } as unknown as SupabaseAuthClaimsClient;
  const config = {
    issuer: 'http://127.0.0.1:54321/auth/v1',
  } as SupabaseAuthConfig;
  const service = new SupabaseIdentityService(claimsClient, config);
  const validClaims = {
    sub: '10000000-0000-4000-8000-000000000001',
    email: ' Artist@Example.com ',
    role: 'authenticated',
    is_anonymous: false,
    iss: config.issuer,
    exp: Math.floor(now.getTime() / 1_000) + 3_600,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns a normalized identity from verified Supabase claims', async () => {
    getClaims.mockResolvedValueOnce({
      data: { claims: validClaims },
      error: null,
    });

    await expect(service.verify('verified-token')).resolves.toEqual({
      userId: validClaims.sub,
      email: 'artist@example.com',
      expiresAt: new Date(validClaims.exp * 1_000),
    });
  });

  it.each([
    ['wrong project', { iss: 'https://other-project.supabase.co/auth/v1' }],
    ['anonymous user', { is_anonymous: true }],
    ['wrong role', { role: 'service_role' }],
    ['missing email', { email: undefined }],
    ['invalid user ID', { sub: 'not-a-uuid' }],
    ['expired token', { exp: Math.floor(now.getTime() / 1_000) - 1 }],
  ])('rejects a %s token', async (_description, override) => {
    getClaims.mockResolvedValueOnce({
      data: { claims: { ...validClaims, ...override } },
      error: null,
    });

    await expect(service.verify('invalid-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not expose errors returned by the authentication provider', async () => {
    getClaims.mockResolvedValueOnce({
      data: null,
      error: new Error('sensitive upstream details'),
    });

    await expect(service.verify('invalid-token')).rejects.toMatchObject({
      message: 'Supabase access token is invalid or expired',
    });
  });

  it('rejects an excessively large token without calling Supabase', async () => {
    await expect(service.verify('x'.repeat(16_385))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(getClaims).not.toHaveBeenCalled();
  });
});
