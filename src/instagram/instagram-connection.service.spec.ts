import { InstagramTokenCipherService } from '../workspaces/instagram-token-cipher.service';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { InstagramConnectionService } from './instagram-connection.service';
import { InstagramOAuthClient } from './instagram-oauth.client';

describe('InstagramConnectionService', () => {
  const exchangeAuthorizationCode = jest.fn();
  const getProfile = jest.fn();
  const subscribeToWebhooks = jest.fn();
  const oauthClient = {
    exchangeAuthorizationCode,
    getProfile,
    subscribeToWebhooks,
  } as unknown as InstagramOAuthClient;
  const encrypt = jest.fn();
  const tokenCipher = { encrypt } as unknown as InstagramTokenCipherService;
  const connectInstagramAccount = jest.fn();
  const workspaces = {
    connectInstagramAccount,
  } as unknown as WorkspacesRepository;

  beforeEach(() => jest.clearAllMocks());

  it('subscribes the professional account and creates its default workspace', async () => {
    const expiresAt = new Date('2026-10-01T00:00:00.000Z');
    const connected = {
      workspace: { id: 'workspace-id', name: '@artist' },
      instagramAccount: { id: 'account-id' },
      created: true,
    };
    exchangeAuthorizationCode.mockResolvedValueOnce({
      accessToken: 'long-lived-token',
      expiresAt,
    });
    getProfile.mockResolvedValueOnce({
      id: 'instagram-recipient-id',
      username: 'artist',
      accountType: 'CREATOR',
    });
    subscribeToWebhooks.mockResolvedValueOnce(undefined);
    encrypt.mockReturnValueOnce('encrypted-token');
    connectInstagramAccount.mockResolvedValueOnce(connected);
    const service = new InstagramConnectionService(
      oauthClient,
      tokenCipher,
      workspaces,
    );

    await expect(service.connect('authorization-code')).resolves.toBe(
      connected,
    );
    expect(subscribeToWebhooks).toHaveBeenCalledWith(
      'instagram-recipient-id',
      'long-lived-token',
    );
    expect(connectInstagramAccount).toHaveBeenCalledWith({
      instagramRecipientId: 'instagram-recipient-id',
      username: 'artist',
      accountType: 'CREATOR',
      encryptedAccessToken: 'encrypted-token',
      tokenExpiresAt: expiresAt,
    });
  });

  it('does not persist a connection when webhook subscription fails', async () => {
    exchangeAuthorizationCode.mockResolvedValueOnce({
      accessToken: 'long-lived-token',
      expiresAt: null,
    });
    getProfile.mockResolvedValueOnce({
      id: 'instagram-recipient-id',
      username: 'artist',
      accountType: 'BUSINESS',
    });
    subscribeToWebhooks.mockRejectedValueOnce(new Error('Meta rejected it'));
    const service = new InstagramConnectionService(
      oauthClient,
      tokenCipher,
      workspaces,
    );

    await expect(service.connect('authorization-code')).rejects.toThrow(
      'Meta rejected it',
    );
    expect(encrypt).not.toHaveBeenCalled();
    expect(connectInstagramAccount).not.toHaveBeenCalled();
  });
});
