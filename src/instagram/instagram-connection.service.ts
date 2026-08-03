import { Injectable } from '@nestjs/common';
import { InstagramTokenCipherService } from '../workspaces/instagram-token-cipher.service';
import {
  ConnectedWorkspace,
  WorkspacesRepository,
} from '../workspaces/workspaces.repository';
import { InstagramOAuthClient } from './instagram-oauth.client';

@Injectable()
export class InstagramConnectionService {
  constructor(
    private readonly oauthClient: InstagramOAuthClient,
    private readonly tokenCipher: InstagramTokenCipherService,
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  authorizationUrl(state: string): string {
    return this.oauthClient.createAuthorizationUrl(state);
  }

  async connect(code: string): Promise<ConnectedWorkspace> {
    const token = await this.oauthClient.exchangeAuthorizationCode(code);
    const profile = await this.oauthClient.getProfile(token.accessToken);
    await this.oauthClient.subscribeToWebhooks(profile.id, token.accessToken);
    return this.workspacesRepository.connectInstagramAccount({
      instagramRecipientId: profile.id,
      username: profile.username,
      accountType: profile.accountType,
      encryptedAccessToken: this.tokenCipher.encrypt(token.accessToken),
      tokenExpiresAt: token.expiresAt,
    });
  }
}
