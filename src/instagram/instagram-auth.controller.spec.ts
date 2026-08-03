import type { Response } from 'express';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { WorkspaceSessionService } from '../workspaces/workspace-session.service';
import { InstagramAuthController } from './instagram-auth.controller';
import { InstagramConnectionService } from './instagram-connection.service';
import { InstagramOAuthStateService } from './instagram-oauth-state.service';

describe('InstagramAuthController', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const state = 'valid-oauth-state';
  const connect = jest.fn();
  const verify = jest.fn();
  const issue = jest.fn();
  const findVerifiedOwner = jest.fn();
  const response = {
    req: { headers: { cookie: `instagram_oauth_state=${state}` } },
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;
  const connection = { connect } as unknown as InstagramConnectionService;
  const oauthState = {
    cookieName: 'instagram_oauth_state',
    verify,
  } as unknown as InstagramOAuthStateService;
  const sessions = {
    cookieName: 'crowdclip_session',
    ttlSeconds: 2_592_000,
    issue,
  } as unknown as WorkspaceSessionService;
  const workspaces = {
    findVerifiedOwner,
  } as unknown as WorkspacesRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    verify.mockReturnValue(true);
    issue.mockReturnValue('signed-session');
    connect.mockResolvedValue({
      created: true,
      workspace: {
        id: '20000000-0000-4000-8000-000000000002',
        name: '@badmanjwav',
        created_at: now,
        updated_at: now,
      },
      instagramAccount: {
        id: '30000000-0000-4000-8000-000000000003',
        workspace_id: '20000000-0000-4000-8000-000000000002',
        instagram_recipient_id: 'instagram-recipient-id',
        username: 'badmanjwav',
        account_type: 'CREATOR',
        connection_status: 'connected',
        access_token_encrypted: 'encrypted-token',
        token_expires_at: null,
        connected_at: now,
        disconnected_at: null,
        created_at: now,
        updated_at: now,
      },
    });
  });

  it('sends a first-time Instagram owner to optional email recovery', async () => {
    findVerifiedOwner.mockResolvedValueOnce(null);
    const controller = new InstagramAuthController(
      connection,
      oauthState,
      sessions,
      workspaces,
    );

    await expect(
      controller.handleCallback(
        'authorization-code',
        state,
        undefined,
        undefined,
        response,
      ),
    ).resolves.toMatchObject({
      connected: true,
      user: null,
      provisional: true,
      recoveryEmailConfigured: false,
      nextStep: 'add_recovery_email',
    });
  });

  it('reopens the workspace when the Instagram account already has an owner', async () => {
    findVerifiedOwner.mockResolvedValueOnce({
      user_id: '10000000-0000-4000-8000-000000000001',
      username: 'badmanjwav',
    });
    const controller = new InstagramAuthController(
      connection,
      oauthState,
      sessions,
      workspaces,
    );

    await expect(
      controller.handleCallback(
        'authorization-code',
        state,
        undefined,
        undefined,
        response,
      ),
    ).resolves.toMatchObject({
      user: {
        id: '10000000-0000-4000-8000-000000000001',
        username: 'badmanjwav',
      },
      recoveryEmailConfigured: true,
      nextStep: 'open_workspace',
    });
  });
});
