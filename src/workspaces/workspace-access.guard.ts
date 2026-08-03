import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseIdentityService } from '../auth/supabase-identity.service';
import { WorkspaceMembershipsRepository } from '../auth/workspace-memberships.repository';
import { WorkspaceAccessRequest } from './current-workspace-access.decorator';
import { WorkspaceSessionService } from './workspace-session.service';
import { WorkspacesRepository } from './workspaces.repository';

@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    private readonly identities: SupabaseIdentityService,
    private readonly memberships: WorkspaceMembershipsRepository,
    private readonly sessions: WorkspaceSessionService,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceAccessRequest>();
    const authorization = request.headers.authorization;
    if (authorization !== undefined) {
      const match = /^Bearer ([^\s]+)$/.exec(authorization);
      if (!match) throw this.required();
      const identity = await this.identities.verify(match[1]);
      const membership = await this.memberships.findDefaultForUser(
        identity.userId,
      );
      if (!membership) throw this.required();
      request.crowdclipWorkspace = {
        workspaceId: membership.workspace_id,
        userId: identity.userId,
        instagramAccountId: null,
        authenticationMethod: 'supabase',
        provisional: false,
        expiresAt: identity.expiresAt,
      };
      return true;
    }

    const session = this.sessions.fromCookieHeader(request.headers.cookie);
    if (!session) throw this.required();
    const account = await this.workspaces.findConnectedAccount(
      session.instagramAccountId,
      session.workspaceId,
    );
    if (!account) throw this.required();
    request.crowdclipWorkspace = {
      ...session,
      userId: null,
      authenticationMethod: 'instagram_provisional',
      provisional: true,
    };
    return true;
  }

  private required(): UnauthorizedException {
    return new UnauthorizedException('CrowdClip workspace access required');
  }
}
