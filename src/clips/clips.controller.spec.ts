import { BadRequestException } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';

describe('ClipsController', () => {
  const session = {
    instagramAccountId: '10000000-0000-4000-8000-000000000001',
    workspaceId: '20000000-0000-4000-8000-000000000002',
    expiresAt: new Date('2026-09-01T00:00:00.000Z'),
  };
  const listRecentForReview = jest.fn();
  const decideMediaChoice = jest.fn();
  const clipsService = {
    listRecentForReview,
    decideMediaChoice,
  } as unknown as ClipsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a default bounded limit', async () => {
    listRecentForReview.mockResolvedValueOnce([]);
    const controller = new ClipsController(clipsService);

    await expect(controller.listRecent(session)).resolves.toEqual({
      clips: [],
    });
    expect(listRecentForReview).toHaveBeenCalledWith(20, session.workspaceId);
  });

  it('accepts a caller-supplied limit', async () => {
    listRecentForReview.mockResolvedValueOnce([]);
    const controller = new ClipsController(clipsService);

    await controller.listRecent(session, '50');

    expect(listRecentForReview).toHaveBeenCalledWith(50, session.workspaceId);
  });

  it.each(['0', '101', '1.5', '-1', 'not-a-number'])(
    'rejects an invalid limit of %s',
    async (limit) => {
      const controller = new ClipsController(clipsService);

      await expect(
        controller.listRecent(session, limit),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(listRecentForReview).not.toHaveBeenCalled();
    },
  );

  it.each(['use_instagram_story', 'request_fan_original'] as const)(
    'passes the %s decision to the service',
    async (mediaChoice) => {
      const decision = {
        clipId: 'clip-id',
        mediaChoice,
        updatedAt: new Date('2026-07-30T00:00:00.000Z'),
        originalFileRequest: null,
      };
      decideMediaChoice.mockResolvedValueOnce(decision);
      const controller = new ClipsController(clipsService);

      await expect(
        controller.decideMediaChoice(session, 'clip-id', { mediaChoice }),
      ).resolves.toBe(decision);
      expect(decideMediaChoice).toHaveBeenCalledWith(
        'clip-id',
        mediaChoice,
        session.workspaceId,
      );
    },
  );

  it.each([
    undefined,
    null,
    {},
    { mediaChoice: 'undecided' },
    { mediaChoice: 'invalid' },
  ])('rejects an invalid media choice body', async (body) => {
    const controller = new ClipsController(clipsService);

    await expect(
      controller.decideMediaChoice(session, 'clip-id', body),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(decideMediaChoice).not.toHaveBeenCalled();
  });
});
