import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseIdentityService } from '../auth/supabase-identity.service';
import { WorkspaceMembershipsRepository } from '../auth/workspace-memberships.repository';
import { WorkspaceAccessGuard } from './workspace-access.guard';
import { WorkspaceSessionService } from './workspace-session.service';
import { WorkspacesRepository } from './workspaces.repository';

describe('WorkspaceAccessGuard', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const verify = jest.fn();
  const findDefaultForUser = jest.fn();
  const fromCookieHeader = jest.fn();
  const findConnectedAccount = jest.fn();
  const identities = { verify } as unknown as SupabaseIdentityService;
  const memberships = {
    findDefaultForUser,
  } as unknown as WorkspaceMembershipsRepository;
  const sessions = {
    fromCookieHeader,
  } as unknown as WorkspaceSessionService;
  const workspaces = {
    findConnectedAccount,
  } as unknown as WorkspacesRepository;

  beforeEach(() => jest.clearAllMocks());

  function context(request: { headers: Record<string, string | undefined> }) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('grants verified users access through their workspace membership', async () => {
    const request = { headers: { authorization: 'Bearer valid-token' } };
    verify.mockResolvedValueOnce({
      userId: 'user-id',
      email: 'artist@example.com',
      expiresAt: now,
    });
    findDefaultForUser.mockResolvedValueOnce({
      workspace_id: 'workspace-id',
      workspace_name: '@artist',
      user_id: 'user-id',
      role: 'owner',
      created_at: now,
    });
    const guard = new WorkspaceAccessGuard(
      identities,
      memberships,
      sessions,
      workspaces,
    );

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toHaveProperty(
      'crowdclipWorkspace',
      expect.objectContaining({
        workspaceId: 'workspace-id',
        userId: 'user-id',
        provisional: false,
        authenticationMethod: 'supabase',
      }),
    );
    expect(fromCookieHeader).not.toHaveBeenCalled();
  });

  it('keeps the existing Instagram cookie as provisional access', async () => {
    const request = { headers: { cookie: 'crowdclip_session=value' } };
    fromCookieHeader.mockReturnValueOnce({
      workspaceId: 'workspace-id',
      instagramAccountId: 'account-id',
      expiresAt: now,
    });
    findConnectedAccount.mockResolvedValueOnce({ id: 'account-id' });
    const guard = new WorkspaceAccessGuard(
      identities,
      memberships,
      sessions,
      workspaces,
    );

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toHaveProperty(
      'crowdclipWorkspace',
      expect.objectContaining({
        workspaceId: 'workspace-id',
        instagramAccountId: 'account-id',
        provisional: true,
        authenticationMethod: 'instagram_provisional',
      }),
    );
  });

  it('does not downgrade an invalid Bearer header to a valid cookie', async () => {
    const request = {
      headers: {
        authorization: 'Invalid token',
        cookie: 'crowdclip_session=value',
      },
    };
    const guard = new WorkspaceAccessGuard(
      identities,
      memberships,
      sessions,
      workspaces,
    );

    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(fromCookieHeader).not.toHaveBeenCalled();
  });

  it('keeps verified membership access after Instagram disconnects', async () => {
    const request = { headers: { authorization: 'Bearer valid-token' } };
    verify.mockResolvedValueOnce({
      userId: 'user-id',
      email: 'artist@example.com',
      expiresAt: now,
    });
    findDefaultForUser.mockResolvedValueOnce({
      workspace_id: 'workspace-id',
      workspace_name: '@artist',
      user_id: 'user-id',
      role: 'owner',
      created_at: now,
    });
    const guard = new WorkspaceAccessGuard(
      identities,
      memberships,
      sessions,
      workspaces,
    );

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(findConnectedAccount).not.toHaveBeenCalled();
  });
});
