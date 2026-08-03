import { ConflictException } from '@nestjs/common';
import { UserProfilesRepository } from '../auth/user-profiles.repository';
import { WorkspaceMembershipsRepository } from '../auth/workspace-memberships.repository';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { AccountClaimService } from './account-claim.service';

describe('AccountClaimService', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const query = jest.fn();
  const transaction = { query } as unknown as DatabaseExecutor;
  const database = {
    withTransaction: jest.fn(
      (callback: (executor: DatabaseExecutor) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as DatabaseService;
  const findOrCreate = jest.fn();
  const profiles = { findOrCreate } as unknown as UserProfilesRepository;
  const findOwnerForUpdate = jest.fn();
  const createOwner = jest.fn();
  const memberships = {
    findOwnerForUpdate,
    createOwner,
  } as unknown as WorkspaceMembershipsRepository;
  const identity = {
    userId: '10000000-0000-4000-8000-000000000001',
    email: 'artist@example.com',
    expiresAt: now,
  };
  const session = {
    workspaceId: '20000000-0000-4000-8000-000000000002',
    instagramAccountId: '30000000-0000-4000-8000-000000000003',
    expiresAt: now,
  };

  beforeEach(() => jest.clearAllMocks());

  it('claims a provisional workspace for the verified email identity', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          workspace_id: session.workspaceId,
          instagram_username: 'badmanjwav',
        },
      ],
    });
    findOwnerForUpdate.mockResolvedValueOnce(null);
    findOrCreate.mockResolvedValueOnce({
      user_id: identity.userId,
      username: 'badmanjwav',
      created_at: now,
      updated_at: now,
    });
    createOwner.mockResolvedValueOnce({
      workspace_id: session.workspaceId,
      user_id: identity.userId,
      role: 'owner',
      created_at: now,
    });
    const service = new AccountClaimService(database, profiles, memberships);

    await expect(service.claim(identity, session)).resolves.toMatchObject({
      user: {
        id: identity.userId,
        username: 'badmanjwav',
        email: identity.email,
      },
      workspace: { id: session.workspaceId },
      provisional: false,
      recoveryEmailConfigured: true,
    });
    expect(findOrCreate).toHaveBeenCalledWith(
      identity.userId,
      'badmanjwav',
      transaction,
    );
    expect(createOwner).toHaveBeenCalledWith(
      session.workspaceId,
      identity.userId,
      transaction,
    );
  });

  it('allows the same verified owner to claim idempotently', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          workspace_id: session.workspaceId,
          instagram_username: 'badmanjwav',
        },
      ],
    });
    findOwnerForUpdate.mockResolvedValueOnce({
      workspace_id: session.workspaceId,
      user_id: identity.userId,
      role: 'owner',
      created_at: now,
    });
    findOrCreate.mockResolvedValueOnce({
      user_id: identity.userId,
      username: 'badmanjwav',
      created_at: now,
      updated_at: now,
    });
    createOwner.mockResolvedValueOnce({
      workspace_id: session.workspaceId,
      user_id: identity.userId,
      role: 'owner',
      created_at: now,
    });
    const service = new AccountClaimService(database, profiles, memberships);

    await expect(service.claim(identity, session)).resolves.toMatchObject({
      role: 'owner',
    });
  });

  it('prevents a different user from claiming an owned workspace', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          workspace_id: session.workspaceId,
          instagram_username: 'badmanjwav',
        },
      ],
    });
    findOwnerForUpdate.mockResolvedValueOnce({
      workspace_id: session.workspaceId,
      user_id: 'different-user-id',
      role: 'owner',
      created_at: now,
    });
    const service = new AccountClaimService(database, profiles, memberships);

    await expect(service.claim(identity, session)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(findOrCreate).not.toHaveBeenCalled();
    expect(createOwner).not.toHaveBeenCalled();
  });
});
