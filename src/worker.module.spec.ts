import { Type } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AudioAnalysisWorker } from './audio-analysis/audio-analysis.worker';
import { AudioStemWorker } from './audio-analysis/audio-stem.worker';
import { DatabaseService } from './database/database.service';
import { StoryMentionWorker } from './instagram/webhooks/story-mention.worker';
import { MediaDownloadWorker } from './media/media-download.worker';
import { WorkerModule } from './worker.module';

const workers: Type<unknown>[] = [
  StoryMentionWorker,
  MediaDownloadWorker,
  AudioAnalysisWorker,
  AudioStemWorker,
];

function compile(rootModule: Type<unknown>): Promise<TestingModule> {
  return Test.createTestingModule({ imports: [rootModule] })
    .overrideProvider(DatabaseService)
    .useValue({ query: jest.fn(), withTransaction: jest.fn() })
    .compile();
}

describe('process wiring', () => {
  it('keeps every background worker out of the HTTP API process', async () => {
    const api = await compile(AppModule);

    for (const worker of workers) {
      expect(() => api.get(worker, { strict: false })).toThrow();
    }
  });

  it('runs every background worker in the worker process', async () => {
    const workerProcess = await compile(WorkerModule);

    for (const worker of workers) {
      expect(workerProcess.get(worker, { strict: false })).toBeInstanceOf(
        worker,
      );
    }
  });
});
