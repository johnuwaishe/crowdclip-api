import { Module } from '@nestjs/common';
import { InstagramTokenCipherService } from './instagram-token-cipher.service';
import { ShowsController } from './shows.controller';
import { ShowsRepository } from './shows.repository';
import { ShowsService } from './shows.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceSessionGuard } from './workspace-session.guard';
import { WorkspaceSessionService } from './workspace-session.service';
import { WorkspacesRepository } from './workspaces.repository';
import { AuthModule } from '../auth/auth.module';
import { AccountClaimController } from './account-claim.controller';
import { AccountClaimService } from './account-claim.service';
import { WorkspaceAccessGuard } from './workspace-access.guard';

@Module({
  imports: [AuthModule],
  controllers: [WorkspaceController, ShowsController, AccountClaimController],
  providers: [
    WorkspacesRepository,
    ShowsRepository,
    ShowsService,
    InstagramTokenCipherService,
    WorkspaceSessionService,
    WorkspaceSessionGuard,
    AccountClaimService,
    WorkspaceAccessGuard,
  ],
  exports: [
    WorkspacesRepository,
    ShowsRepository,
    InstagramTokenCipherService,
    WorkspaceSessionService,
    WorkspaceSessionGuard,
    WorkspaceAccessGuard,
  ],
})
export class WorkspacesModule {}
