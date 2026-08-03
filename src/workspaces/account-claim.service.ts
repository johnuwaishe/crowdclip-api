import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseIdentity } from '../auth/types/supabase-identity.type';
import { UserProfilesRepository } from '../auth/user-profiles.repository';
import { WorkspaceMembershipsRepository } from '../auth/workspace-memberships.repository';
import { DatabaseService } from '../database/database.service';
import { WorkspaceSession } from './workspace-session.service';

@Injectable()
export class AccountClaimService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly profiles: UserProfilesRepository,
    private readonly memberships: WorkspaceMembershipsRepository,
  ) {}

  claim(identity: SupabaseIdentity, session: WorkspaceSession) {
    return this.databaseService.withTransaction(async (transaction) => {
      const provisionalResult = await transaction.query<{
        workspace_id: string;
        instagram_username: string;
      }>(
        `
          SELECT
            workspace.id AS workspace_id,
            COALESCE(account.username, 'user') AS instagram_username
          FROM public.workspaces AS workspace
          JOIN public.instagram_accounts AS account
            ON account.workspace_id = workspace.id
          WHERE workspace.id = $1
            AND account.id = $2
            AND account.connection_status = 'connected'
          FOR UPDATE OF workspace, account
        `,
        [session.workspaceId, session.instagramAccountId],
      );
      const provisional = provisionalResult.rows[0];
      if (!provisional) {
        throw new UnauthorizedException(
          'The provisional workspace session is no longer active',
        );
      }

      const currentOwner = await this.memberships.findOwnerForUpdate(
        provisional.workspace_id,
        transaction,
      );
      if (currentOwner && currentOwner.user_id !== identity.userId) {
        throw new ConflictException(
          'This workspace already has a different verified owner',
        );
      }

      const profile = await this.profiles.findOrCreate(
        identity.userId,
        provisional.instagram_username,
        transaction,
      );
      const membership = await this.memberships.createOwner(
        provisional.workspace_id,
        identity.userId,
        transaction,
      );

      return {
        user: {
          id: profile.user_id,
          username: profile.username,
          email: identity.email,
        },
        workspace: { id: membership.workspace_id },
        role: membership.role,
        provisional: false,
        recoveryEmailConfigured: true,
        nextStep: 'create_show' as const,
      };
    });
  }
}
