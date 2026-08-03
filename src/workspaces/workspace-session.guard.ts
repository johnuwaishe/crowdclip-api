import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspaceSessionRequest } from './current-workspace-session.decorator';
import { WorkspaceSessionService } from './workspace-session.service';

@Injectable()
export class WorkspaceSessionGuard implements CanActivate {
  constructor(
    private readonly sessions: WorkspaceSessionService,
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<WorkspaceSessionRequest>();
    const session = this.sessions.fromCookieHeader(request.headers.cookie);
    if (!session) throw new UnauthorizedException('CrowdClip session required');
    const account = await this.workspacesRepository.findConnectedAccount(
      session.instagramAccountId,
      session.workspaceId,
    );
    if (!account) {
      throw new UnauthorizedException('CrowdClip session is no longer active');
    }
    request.crowdclipSession = session;
    return true;
  }
}
