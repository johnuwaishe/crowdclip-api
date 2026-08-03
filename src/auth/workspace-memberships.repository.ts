import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import {
  WorkspaceMembershipAccessRow,
  WorkspaceMembershipRow,
} from './types/workspace-membership-row.type';

@Injectable()
export class WorkspaceMembershipsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findDefaultForUser(
    userId: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<WorkspaceMembershipAccessRow | null> {
    const result = await executor.query<WorkspaceMembershipAccessRow>(
      `
        SELECT membership.*, workspace.name AS workspace_name
        FROM public.workspace_memberships AS membership
        JOIN public.workspaces AS workspace
          ON workspace.id = membership.workspace_id
        WHERE membership.user_id = $1
        ORDER BY membership.created_at, membership.workspace_id
        LIMIT 1
      `,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async findOwnerForUpdate(
    workspaceId: string,
    executor: DatabaseExecutor,
  ): Promise<WorkspaceMembershipRow | null> {
    const result = await executor.query<WorkspaceMembershipRow>(
      `
        SELECT *
        FROM public.workspace_memberships
        WHERE workspace_id = $1 AND role = 'owner'
        ORDER BY created_at, user_id
        LIMIT 1
        FOR UPDATE
      `,
      [workspaceId],
    );
    return result.rows[0] ?? null;
  }

  async createOwner(
    workspaceId: string,
    userId: string,
    executor: DatabaseExecutor,
  ): Promise<WorkspaceMembershipRow> {
    const result = await executor.query<WorkspaceMembershipRow>(
      `
        INSERT INTO public.workspace_memberships (
          workspace_id,
          user_id,
          role
        )
        VALUES ($1, $2, 'owner')
        ON CONFLICT (workspace_id, user_id)
        DO UPDATE SET role = 'owner'
        RETURNING *
      `,
      [workspaceId, userId],
    );
    const membership = result.rows[0];
    if (!membership) throw new Error('Workspace owner was not created');
    return membership;
  }
}
