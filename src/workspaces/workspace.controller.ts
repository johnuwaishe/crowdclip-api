import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentWorkspaceAccess } from './current-workspace-access.decorator';
import type { WorkspaceAccess } from './types/workspace-access.type';
import { WorkspaceAccessGuard } from './workspace-access.guard';
import { WorkspacesRepository } from './workspaces.repository';

@ApiTags('Workspace')
@ApiBearerAuth('supabase')
@ApiCookieAuth('crowdclip-session')
@Controller('workspace')
@UseGuards(WorkspaceAccessGuard)
export class WorkspaceController {
  constructor(private readonly workspacesRepository: WorkspacesRepository) {}

  @Get()
  @ApiOperation({ summary: 'Get the current workspace and connection state' })
  async getCurrent(@CurrentWorkspaceAccess() session: WorkspaceAccess) {
    const result = await this.workspacesRepository.getWorkspace(
      session.workspaceId,
    );
    if (!result) throw new NotFoundException('Workspace not found');
    const verifiedOwner = await this.workspacesRepository.findVerifiedOwner(
      session.workspaceId,
    );
    const recoveryEmailConfigured = verifiedOwner !== null;
    return {
      id: result.workspace.id,
      name: result.workspace.name,
      createdAt: result.workspace.created_at,
      updatedAt: result.workspace.updated_at,
      instagramAccounts: result.accounts.map((account) => ({
        id: account.id,
        instagramRecipientId: account.instagram_recipient_id,
        username: account.username,
        accountType: account.account_type,
        connectionStatus: account.connection_status,
        connectedAt: account.connected_at,
      })),
      user: verifiedOwner
        ? {
            id: verifiedOwner.user_id,
            username: verifiedOwner.username,
          }
        : null,
      provisional: session.provisional,
      recoveryEmailConfigured,
      nextStep: recoveryEmailConfigured
        ? null
        : ('add_recovery_email' as const),
    };
  }
}
