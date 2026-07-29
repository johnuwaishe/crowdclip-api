import { BadRequestException } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';

describe('ClipsController', () => {
  const listRecentForReview = jest.fn();
  const clipsService = {
    listRecentForReview,
  } as unknown as ClipsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a default bounded limit', async () => {
    listRecentForReview.mockResolvedValueOnce([]);
    const controller = new ClipsController(clipsService);

    await expect(controller.listRecent()).resolves.toEqual({ clips: [] });
    expect(listRecentForReview).toHaveBeenCalledWith(20);
  });

  it('accepts a caller-supplied limit', async () => {
    listRecentForReview.mockResolvedValueOnce([]);
    const controller = new ClipsController(clipsService);

    await controller.listRecent('50');

    expect(listRecentForReview).toHaveBeenCalledWith(50);
  });

  it.each(['0', '101', '1.5', '-1', 'not-a-number'])(
    'rejects an invalid limit of %s',
    async (limit) => {
      const controller = new ClipsController(clipsService);

      await expect(controller.listRecent(limit)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(listRecentForReview).not.toHaveBeenCalled();
    },
  );
});
