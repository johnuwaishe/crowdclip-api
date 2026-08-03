import { Module } from '@nestjs/common';
import { InstagramTokenCipherService } from './instagram-token-cipher.service';
import { ShowsController } from './shows.controller';
import { ShowsRepository } from './shows.repository';
import { ShowsService } from './shows.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceSessionGuard } from './workspace-session.guard';
import { WorkspaceSessionService } from './workspace-session.service';
import { WorkspacesRepository } from './workspaces.repository';

@Module({
  controllers: [WorkspaceController, ShowsController],
  providers: [
    WorkspacesRepository,
    ShowsRepository,
    ShowsService,
    InstagramTokenCipherService,
    WorkspaceSessionService,
    WorkspaceSessionGuard,
  ],
  exports: [
    WorkspacesRepository,
    ShowsRepository,
    InstagramTokenCipherService,
    WorkspaceSessionService,
    WorkspaceSessionGuard,
  ],
})
export class WorkspacesModule {}
