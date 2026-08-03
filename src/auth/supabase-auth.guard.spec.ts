import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SupabaseIdentityService } from './supabase-identity.service';

describe('SupabaseAuthGuard', () => {
  const identity = {
    userId: '10000000-0000-4000-8000-000000000001',
    email: 'artist@example.com',
    expiresAt: new Date('2026-09-01T00:00:00.000Z'),
  };
  const verify = jest.fn();
  const identities = { verify } as unknown as SupabaseIdentityService;

  beforeEach(() => jest.clearAllMocks());

  it('verifies the Bearer token and attaches the identity', async () => {
    const request = { headers: { authorization: 'Bearer verified-token' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    verify.mockResolvedValueOnce(identity);
    const guard = new SupabaseAuthGuard(identities);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('verified-token');
    expect(request).toHaveProperty('supabaseIdentity', identity);
  });

  it.each([undefined, 'Basic value', 'Bearer', 'Bearer two tokens'])(
    'rejects malformed authorization value %s',
    async (authorization) => {
      const request = { headers: { authorization } };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      const guard = new SupabaseAuthGuard(identities);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(verify).not.toHaveBeenCalled();
    },
  );
});
