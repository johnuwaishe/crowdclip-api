import { ConfigService } from '@nestjs/config';
import { InstagramOAuthStateService } from './instagram-oauth-state.service';

describe('InstagramOAuthStateService', () => {
  const now = new Date('2026-08-03T10:00:00.000Z').getTime();
  const config = {
    getOrThrow: jest.fn(
      () => 'oauth-state-secret-that-is-longer-than-32-bytes',
    ),
  } as unknown as ConfigService;

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now));
  afterEach(() => jest.restoreAllMocks());

  it('accepts its own short-lived signed state', () => {
    const service = new InstagramOAuthStateService(config);
    expect(service.verify(service.issue())).toBe(true);
  });

  it('rejects modified and expired state', () => {
    const service = new InstagramOAuthStateService(config);
    const state = service.issue();

    expect(service.verify(`${state.slice(0, -1)}x`)).toBe(false);
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(now + service.ttlSeconds * 1_000 + 1);
    expect(service.verify(state)).toBe(false);
  });
});
