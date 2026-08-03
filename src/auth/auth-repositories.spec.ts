import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { UserProfilesRepository } from './user-profiles.repository';
import { WorkspaceMembershipsRepository } from './workspace-memberships.repository';

describe('progressive auth repositories', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const query = jest.fn();
  const executor = { query } as unknown as DatabaseExecutor;
  const database = { query } as unknown as DatabaseService;

  beforeEach(() => jest.clearAllMocks());

  it('normalizes the Instagram username and allocates stable fallbacks', async () => {
    const profile = {
      user_id: '10000000-0000-4000-8000-000000000001',
      username: 'badman_jwav',
      created_at: now,
      updated_at: now,
    };
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [profile] });
    const repository = new UserProfilesRepository(database);

    await expect(
      repository.findOrCreate(profile.user_id, ' @Badman Jwav ', executor),
    ).resolves.toBe(profile);
    expect(query).toHaveBeenNthCalledWith(1, expect.any(String), [
      'badman_jwav',
    ]);
    expect(query).toHaveBeenNthCalledWith(3, expect.any(String), [
      profile.user_id,
      'badman_jwav',
      'badman_jwav_10000000',
      'badman_jwav_100000000000',
    ]);
  });

  it('reuses an existing profile without changing its username', async () => {
    const existing = {
      user_id: 'user-id',
      username: 'existing',
      created_at: now,
      updated_at: now,
    };
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existing] });
    const repository = new UserProfilesRepository(database);

    await expect(
      repository.findOrCreate('user-id', 'new-name', executor),
    ).resolves.toBe(existing);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('finds the verified user default workspace', async () => {
    const membership = {
      workspace_id: 'workspace-id',
      workspace_name: '@artist',
      user_id: 'user-id',
      role: 'owner' as const,
      created_at: now,
    };
    query.mockResolvedValueOnce({ rows: [membership] });
    const repository = new WorkspaceMembershipsRepository(database);

    await expect(repository.findDefaultForUser('user-id')).resolves.toBe(
      membership,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('membership.user_id = $1'),
      ['user-id'],
    );
  });

  it('creates an idempotent owner membership', async () => {
    const membership = {
      workspace_id: 'workspace-id',
      user_id: 'user-id',
      role: 'owner' as const,
      created_at: now,
    };
    query.mockResolvedValueOnce({ rows: [membership] });
    const repository = new WorkspaceMembershipsRepository(database);

    await expect(
      repository.createOwner('workspace-id', 'user-id', executor),
    ).resolves.toBe(membership);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (workspace_id, user_id)'),
      ['workspace-id', 'user-id'],
    );
  });
});
