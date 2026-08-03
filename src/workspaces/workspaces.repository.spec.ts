import { QueryResult, QueryResultRow } from 'pg';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { InstagramAccountRow } from './types/instagram-account-row.type';
import { WorkspaceRow } from './types/workspace-row.type';
import { WorkspacesRepository } from './workspaces.repository';

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

describe('WorkspacesRepository', () => {
  const now = new Date('2026-08-03T10:00:00.000Z');
  const workspace: WorkspaceRow = {
    id: 'workspace-id',
    name: '@artist',
    created_at: now,
    updated_at: now,
  };
  const account: InstagramAccountRow = {
    id: 'account-id',
    workspace_id: workspace.id,
    instagram_recipient_id: 'instagram-recipient-id',
    username: 'artist',
    account_type: 'CREATOR',
    connection_status: 'connected',
    access_token_encrypted: 'encrypted-token',
    token_expires_at: null,
    connected_at: now,
    disconnected_at: null,
    created_at: now,
    updated_at: now,
  };
  const query = jest.fn();
  const transaction = { query } as unknown as DatabaseExecutor;
  const database = {
    withTransaction: jest.fn(
      (callback: (executor: DatabaseExecutor) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as DatabaseService;

  beforeEach(() => jest.clearAllMocks());

  it('creates one default workspace on the first Instagram connection', async () => {
    query
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([workspace]))
      .mockResolvedValueOnce(queryResult([account]));
    const repository = new WorkspacesRepository(database);

    await expect(
      repository.connectInstagramAccount({
        instagramRecipientId: 'instagram-recipient-id',
        username: 'artist',
        accountType: 'CREATOR',
        encryptedAccessToken: 'encrypted-token',
        tokenExpiresAt: null,
      }),
    ).resolves.toEqual({ workspace, instagramAccount: account, created: true });
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO public.workspaces'),
      ['@artist'],
    );
  });

  it('reconnects an existing account without creating another workspace', async () => {
    query
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([account]))
      .mockResolvedValueOnce(queryResult([account]))
      .mockResolvedValueOnce(queryResult([workspace]));
    const repository = new WorkspacesRepository(database);

    await expect(
      repository.connectInstagramAccount({
        instagramRecipientId: 'instagram-recipient-id',
        username: 'artist',
        accountType: 'CREATOR',
        encryptedAccessToken: 'new-encrypted-token',
        tokenExpiresAt: null,
      }),
    ).resolves.toEqual({
      workspace,
      instagramAccount: account,
      created: false,
    });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO public.workspaces'),
      ),
    ).toBe(false);
  });
});
