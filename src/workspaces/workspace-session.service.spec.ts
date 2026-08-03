import { ConfigService } from '@nestjs/config';
import { WorkspaceSessionService } from './workspace-session.service';

describe('WorkspaceSessionService', () => {
  const accountId = '10000000-0000-4000-8000-000000000001';
  const workspaceId = '20000000-0000-4000-8000-000000000002';
  const now = new Date('2026-08-03T10:00:00.000Z').getTime();
  const config = {
    getOrThrow: jest.fn(() => 'session-secret-that-is-longer-than-32-bytes'),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => jest.restoreAllMocks());

  it('issues a signed session for one Instagram account and workspace', () => {
    const service = new WorkspaceSessionService(config);
    const token = service.issue(accountId, workspaceId);

    expect(service.verify(token)).toEqual({
      instagramAccountId: accountId,
      workspaceId,
      expiresAt: new Date(now + service.ttlSeconds * 1_000),
    });
  });

  it('rejects a tampered or expired session', () => {
    const service = new WorkspaceSessionService(config);
    const token = service.issue(accountId, workspaceId);

    expect(service.verify(`${token.slice(0, -1)}x`)).toBeNull();
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(now + service.ttlSeconds * 1_000 + 1);
    expect(service.verify(token)).toBeNull();
  });
});
