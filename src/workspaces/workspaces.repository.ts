import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import {
  InstagramAccountRoutingRow,
  InstagramAccountRow,
} from './types/instagram-account-row.type';
import { WorkspaceRow } from './types/workspace-row.type';

export interface ConnectInstagramAccountInput {
  instagramRecipientId: string;
  username: string;
  accountType: 'BUSINESS' | 'CREATOR';
  encryptedAccessToken: string;
  tokenExpiresAt: Date | null;
}

export interface ConnectedWorkspace {
  workspace: WorkspaceRow;
  instagramAccount: InstagramAccountRow;
  created: boolean;
}

export interface VerifiedWorkspaceOwner {
  user_id: string;
  username: string;
}

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  connectInstagramAccount(
    input: ConnectInstagramAccountInput,
  ): Promise<ConnectedWorkspace> {
    return this.databaseService.withTransaction(async (transaction) => {
      await transaction.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [input.instagramRecipientId],
      );
      const existing = await this.findAccountByRecipientId(
        input.instagramRecipientId,
        transaction,
      );
      if (existing) {
        const account = await this.markConnected(
          existing.id,
          input,
          transaction,
        );
        const workspace = await this.findWorkspaceById(
          existing.workspace_id,
          transaction,
        );
        if (!workspace) throw new Error('Connected workspace was not found');
        return { workspace, instagramAccount: account, created: false };
      }

      const workspaceResult = await transaction.query<WorkspaceRow>(
        `
          INSERT INTO public.workspaces (name)
          VALUES ($1)
          RETURNING *
        `,
        [`@${input.username}`],
      );
      const workspace = workspaceResult.rows[0];
      if (!workspace) throw new Error('Instagram workspace was not created');
      const accountResult = await transaction.query<InstagramAccountRow>(
        `
          INSERT INTO public.instagram_accounts (
            workspace_id,
            instagram_recipient_id,
            username,
            account_type,
            connection_status,
            access_token_encrypted,
            token_expires_at,
            connected_at
          )
          VALUES ($1, $2, $3, $4, 'connected', $5, $6, NOW())
          RETURNING *
        `,
        [
          workspace.id,
          input.instagramRecipientId,
          input.username,
          input.accountType,
          input.encryptedAccessToken,
          input.tokenExpiresAt,
        ],
      );
      const instagramAccount = accountResult.rows[0];
      if (!instagramAccount)
        throw new Error('Instagram account was not created');
      return { workspace, instagramAccount, created: true };
    });
  }

  async findRoutingByRecipientId(
    recipientId: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<InstagramAccountRoutingRow | null> {
    const result = await executor.query<InstagramAccountRoutingRow>(
      `
        SELECT
          account.id AS instagram_account_id,
          account.workspace_id,
          active_show.id AS active_show_id
        FROM public.instagram_accounts AS account
        LEFT JOIN public.shows AS active_show
          ON active_show.instagram_account_id = account.id
         AND active_show.status = 'active'
        WHERE account.instagram_recipient_id = $1
          AND account.connection_status IN ('connected', 'unverified')
      `,
      [recipientId],
    );
    return result.rows[0] ?? null;
  }

  async findConnectedAccount(
    accountId: string,
    workspaceId: string,
  ): Promise<InstagramAccountRow | null> {
    const result = await this.databaseService.query<InstagramAccountRow>(
      `
        SELECT *
        FROM public.instagram_accounts
        WHERE id = $1
          AND workspace_id = $2
          AND connection_status = 'connected'
      `,
      [accountId, workspaceId],
    );
    return result.rows[0] ?? null;
  }

  async findFirstConnectedAccount(
    workspaceId: string,
  ): Promise<InstagramAccountRow | null> {
    const result = await this.databaseService.query<InstagramAccountRow>(
      `
        SELECT *
        FROM public.instagram_accounts
        WHERE workspace_id = $1
          AND connection_status = 'connected'
        ORDER BY connected_at, id
        LIMIT 1
      `,
      [workspaceId],
    );
    return result.rows[0] ?? null;
  }

  async getWorkspace(workspaceId: string): Promise<{
    workspace: WorkspaceRow;
    accounts: InstagramAccountRow[];
  } | null> {
    const workspace = await this.findWorkspaceById(workspaceId);
    if (!workspace) return null;
    const accounts = await this.databaseService.query<InstagramAccountRow>(
      `
        SELECT *
        FROM public.instagram_accounts
        WHERE workspace_id = $1
        ORDER BY created_at, id
      `,
      [workspaceId],
    );
    return { workspace, accounts: accounts.rows };
  }

  async findVerifiedOwner(
    workspaceId: string,
  ): Promise<VerifiedWorkspaceOwner | null> {
    const result = await this.databaseService.query<VerifiedWorkspaceOwner>(
      `
        SELECT profile.user_id, profile.username
        FROM public.workspace_memberships AS membership
        JOIN public.user_profiles AS profile
          ON profile.user_id = membership.user_id
        WHERE membership.workspace_id = $1
          AND membership.role = 'owner'
        ORDER BY membership.created_at, membership.user_id
        LIMIT 1
      `,
      [workspaceId],
    );
    return result.rows[0] ?? null;
  }

  async disconnect(accountId: string, workspaceId: string): Promise<boolean> {
    const result = await this.databaseService.query(
      `
        UPDATE public.instagram_accounts
        SET connection_status = 'disconnected',
            access_token_encrypted = NULL,
            token_expires_at = NULL,
            disconnected_at = NOW()
        WHERE id = $1
          AND workspace_id = $2
          AND connection_status = 'connected'
      `,
      [accountId, workspaceId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async findAccountByRecipientId(
    recipientId: string,
    executor: DatabaseExecutor,
  ): Promise<InstagramAccountRow | null> {
    const result = await executor.query<InstagramAccountRow>(
      `SELECT * FROM public.instagram_accounts WHERE instagram_recipient_id = $1`,
      [recipientId],
    );
    return result.rows[0] ?? null;
  }

  private async markConnected(
    id: string,
    input: ConnectInstagramAccountInput,
    executor: DatabaseExecutor,
  ): Promise<InstagramAccountRow> {
    const result = await executor.query<InstagramAccountRow>(
      `
        UPDATE public.instagram_accounts
        SET username = $2,
            account_type = $3,
            connection_status = 'connected',
            access_token_encrypted = $4,
            token_expires_at = $5,
            connected_at = NOW(),
            disconnected_at = NULL
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        input.username,
        input.accountType,
        input.encryptedAccessToken,
        input.tokenExpiresAt,
      ],
    );
    const account = result.rows[0];
    if (!account) throw new Error('Instagram account was not reconnected');
    return account;
  }

  private async findWorkspaceById(
    id: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<WorkspaceRow | null> {
    const result = await executor.query<WorkspaceRow>(
      `SELECT * FROM public.workspaces WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
