import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentWorkspaceAccess } from '../workspaces/current-workspace-access.decorator';
import type { WorkspaceAccess } from '../workspaces/types/workspace-access.type';
import { WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { WorkspaceSessionService } from '../workspaces/workspace-session.service';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { InstagramConnectionService } from './instagram-connection.service';
import { InstagramOAuthStateService } from './instagram-oauth-state.service';

@Controller('auth/instagram')
export class InstagramAuthController {
  constructor(
    private readonly connectionService: InstagramConnectionService,
    private readonly oauthState: InstagramOAuthStateService,
    private readonly sessions: WorkspaceSessionService,
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  @Get('start')
  start(@Res({ passthrough: true }) response: Response): void {
    const state = this.oauthState.issue();
    response.cookie(this.oauthState.cookieName, state, {
      httpOnly: true,
      secure: this.secureCookies(),
      sameSite: 'lax',
      maxAge: this.oauthState.ttlSeconds * 1_000,
      path: '/auth/instagram',
    });
    response.redirect(this.connectionService.authorizationUrl(state));
  }

  @Get('callback')
  async handleCallback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    if (error) {
      throw new BadRequestException(
        errorDescription ? `${error}: ${errorDescription}` : error,
      );
    }
    const storedState = this.readCookie(
      response?.req,
      this.oauthState.cookieName,
    );
    if (
      !code ||
      !state ||
      !storedState ||
      state !== storedState ||
      !this.oauthState.verify(state)
    ) {
      throw new BadRequestException('Instagram authorization state is invalid');
    }
    const connected = await this.connectionService.connect(code);
    const verifiedOwner = await this.workspacesRepository.findVerifiedOwner(
      connected.workspace.id,
    );
    const sessionToken = this.sessions.issue(
      connected.instagramAccount.id,
      connected.workspace.id,
    );
    response?.clearCookie(this.oauthState.cookieName, {
      path: '/auth/instagram',
    });
    response?.cookie(this.sessions.cookieName, sessionToken, {
      httpOnly: true,
      secure: this.secureCookies(),
      sameSite: 'lax',
      maxAge: this.sessions.ttlSeconds * 1_000,
      path: '/',
    });
    return {
      connected: true,
      created: connected.created,
      workspace: {
        id: connected.workspace.id,
        name: connected.workspace.name,
      },
      instagramAccount: {
        id: connected.instagramAccount.id,
        instagramRecipientId: connected.instagramAccount.instagram_recipient_id,
        username: connected.instagramAccount.username,
        accountType: connected.instagramAccount.account_type,
      },
      user: verifiedOwner
        ? {
            id: verifiedOwner.user_id,
            username: verifiedOwner.username,
          }
        : null,
      provisional: true,
      recoveryEmailConfigured: verifiedOwner !== null,
      nextStep: verifiedOwner
        ? ('open_workspace' as const)
        : ('add_recovery_email' as const),
    };
  }

  @Post('disconnect')
  @UseGuards(WorkspaceAccessGuard)
  async disconnect(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ disconnected: true }> {
    const accountId =
      session.instagramAccountId ??
      (
        await this.workspacesRepository.findFirstConnectedAccount(
          session.workspaceId,
        )
      )?.id;
    if (accountId) {
      await this.workspacesRepository.disconnect(
        accountId,
        session.workspaceId,
      );
    }
    response.clearCookie(this.sessions.cookieName, { path: '/' });
    return { disconnected: true };
  }

  private readCookie(
    request: Request | undefined,
    name: string,
  ): string | null {
    const header = request?.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
    return null;
  }

  private secureCookies(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}
