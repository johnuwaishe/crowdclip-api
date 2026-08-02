import { Logger } from '@nestjs/common';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioAnalysisProcessor } from './audio-analysis.processor';
import { AudioAnalysisWorker } from './audio-analysis.worker';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';

describe('AudioAnalysisWorker', () => {
  const config = {
    enabled: false,
    pollIntervalMs: 5_000,
    batchSize: 3,
    staleAfterMs: 600_000,
    maxAttempts: 3,
  } as AudioAnalysisConfig;
  const processNext = jest.fn();
  const processor = { processNext } as unknown as AudioAnalysisProcessor;
  const recoverStaleProcessing = jest.fn();
  const repository = {
    recoverStaleProcessing,
  } as unknown as ClipAudioAnalysesRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    recoverStaleProcessing.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('recovers stale work and drains a bounded batch', async () => {
    recoverStaleProcessing.mockResolvedValueOnce([
      { status: 'pending' },
      { status: 'failed' },
    ]);
    processNext
      .mockResolvedValueOnce({ status: 'matched', analysisId: 'matched' })
      .mockResolvedValueOnce({ status: 'no_match', analysisId: 'no-match' })
      .mockResolvedValueOnce({ status: 'idle' });

    await expect(
      new AudioAnalysisWorker(config, processor, repository).runOnce(),
    ).resolves.toEqual({
      matched: 1,
      no_match: 1,
      retrying: 0,
      failed: 0,
      requeued: 1,
      abandoned: 1,
    });
  });

  it('does not schedule when disabled', () => {
    jest.useFakeTimers();
    const worker = new AudioAnalysisWorker(config, processor, repository);
    worker.onApplicationBootstrap();
    jest.advanceTimersByTime(10_000);
    expect(processNext).not.toHaveBeenCalled();
  });
});
