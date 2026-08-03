import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { CurrentWorkspaceSession } from './current-workspace-session.decorator';
import type { WorkspaceSession } from './workspace-session.service';
import { WorkspaceSessionGuard } from './workspace-session.guard';
import { WorkspacesRepository } from './workspaces.repository';

@Controller('workspace')
@UseGuards(WorkspaceSessionGuard)
export class WorkspaceController {
  constructor(private readonly workspacesRepository: WorkspacesRepository) {}

  @Get()
  async getCurrent(@CurrentWorkspaceSession() session: WorkspaceSession) {
    const result = await this.workspacesRepository.getWorkspace(
      session.workspaceId,
    );
    if (!result) throw new NotFoundException('Workspace not found');
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
    };
  }
}
