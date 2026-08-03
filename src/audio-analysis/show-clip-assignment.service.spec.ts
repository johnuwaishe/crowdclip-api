import { ConflictException } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';
import { ShowClipAssignmentService } from './show-clip-assignment.service';

describe('ShowClipAssignmentService', () => {
  const query = jest.fn();
  const transaction = { query } as unknown as DatabaseExecutor;
  const database = {
    withTransaction: jest.fn(
      (callback: (executor: DatabaseExecutor) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as DatabaseService;
  const enqueueForStoredMediaAsset = jest.fn();
  const analyses = {
    enqueueForStoredMediaAsset,
  } as unknown as ClipAudioAnalysesRepository;

  beforeEach(() => jest.clearAllMocks());

  it('assigns an inbox clip to a compatible show and queues its stored video', async () => {
    query.mockResolvedValueOnce({
      rows: [{ clip_id: 'clip-id', media_asset_id: 'asset-id' }],
    });
    enqueueForStoredMediaAsset.mockResolvedValueOnce({ id: 'analysis-id' });
    const service = new ShowClipAssignmentService(database, analyses);

    await expect(
      service.assign('clip-id', 'show-id', 'workspace-id'),
    ).resolves.toEqual({
      clipId: 'clip-id',
      showId: 'show-id',
      analysisQueued: true,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'clip.instagram_account_id = target.instagram_account_id',
      ),
      ['clip-id', 'show-id', 'workspace-id'],
    );
    expect(enqueueForStoredMediaAsset).toHaveBeenCalledWith(
      'asset-id',
      transaction,
    );
  });

  it('does not silently move a clip that is already assigned', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ show_id: 'other-show-id' }] });
    const service = new ShowClipAssignmentService(database, analyses);

    await expect(
      service.assign('clip-id', 'show-id', 'workspace-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enqueueForStoredMediaAsset).not.toHaveBeenCalled();
  });
});
