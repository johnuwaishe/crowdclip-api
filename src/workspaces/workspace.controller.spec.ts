import { WorkspacesRepository } from './workspaces.repository';
import { WorkspaceController } from './workspace.controller';

describe('WorkspaceController', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const getWorkspace = jest.fn();
  const findVerifiedOwner = jest.fn();
  const repository = {
    getWorkspace,
    findVerifiedOwner,
  } as unknown as WorkspacesRepository;
  const access = {
    workspaceId: '20000000-0000-4000-8000-000000000002',
    instagramAccountId: '30000000-0000-4000-8000-000000000003',
    userId: null,
    authenticationMethod: 'instagram_provisional' as const,
    provisional: true,
    expiresAt: now,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getWorkspace.mockResolvedValue({
      workspace: {
        id: access.workspaceId,
        name: '@badmanjwav',
        created_at: now,
        updated_at: now,
      },
      accounts: [],
    });
  });

  it('prompts a provisional owner to add a recovery email', async () => {
    findVerifiedOwner.mockResolvedValueOnce(null);
    const controller = new WorkspaceController(repository);

    await expect(controller.getCurrent(access)).resolves.toMatchObject({
      user: null,
      provisional: true,
      recoveryEmailConfigured: false,
      nextStep: 'add_recovery_email',
    });
  });

  it('does not prompt again after the workspace has a verified owner', async () => {
    findVerifiedOwner.mockResolvedValueOnce({
      user_id: '10000000-0000-4000-8000-000000000001',
      username: 'badmanjwav',
    });
    const controller = new WorkspaceController(repository);

    await expect(controller.getCurrent(access)).resolves.toMatchObject({
      user: {
        id: '10000000-0000-4000-8000-000000000001',
        username: 'badmanjwav',
      },
      recoveryEmailConfigured: true,
      nextStep: null,
    });
  });
});
