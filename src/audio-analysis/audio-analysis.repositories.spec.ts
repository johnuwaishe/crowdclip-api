import { QueryResult, QueryResultRow } from 'pg';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { AudioReferenceCataloguesRepository } from './audio-reference-catalogues.repository';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';
import { AudioReferenceCatalogueRow } from './types/audio-reference-catalogue-row.type';
import { ClipAudioAnalysisRow } from './types/clip-audio-analysis-row.type';

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

describe('audio analysis repositories', () => {
  const now = new Date('2026-08-01T00:00:00.000Z');
  const query = jest.fn();
  const transaction = { query } as unknown as DatabaseExecutor;
  const withTransaction = jest.fn(
    (callback: (executor: DatabaseExecutor) => Promise<unknown>) =>
      callback(transaction),
  );
  const database = {
    query,
    withTransaction,
  } as unknown as DatabaseService;

  beforeEach(() => jest.clearAllMocks());

  it('finds a show catalogue within its workspace', async () => {
    const catalogue: AudioReferenceCatalogueRow = {
      id: 'catalogue-id',
      show_id: 'show-id',
      name: 'Concert catalogue',
      created_at: now,
      updated_at: now,
    };
    query.mockResolvedValueOnce(queryResult([catalogue]));
    const repository = new AudioReferenceCataloguesRepository(database);

    await expect(
      repository.findByShowId('show-id', 'workspace-id'),
    ).resolves.toBe(catalogue);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('show.workspace_id = $2'),
      ['show-id', 'workspace-id'],
    );
  });

  it('uses the database uniqueness key when enqueueing stored media', async () => {
    const analysis = {
      id: 'analysis-id',
      status: 'pending',
    } as ClipAudioAnalysisRow;
    query.mockResolvedValueOnce(queryResult([analysis]));
    const repository = new ClipAudioAnalysesRepository(database);

    await expect(
      repository.enqueueForStoredMediaAsset('asset-id', transaction),
    ).resolves.toBe(analysis);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (clip_id, catalogue_id, provider)'),
      ['asset-id', 'concert_sequence'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("analysis.status IN ('failed', 'no_match')"),
      ['asset-id', 'concert_sequence'],
    );
  });

  it('claims only one pending analysis with a skip-locked lease', async () => {
    query.mockResolvedValueOnce(queryResult([]));
    const repository = new ClipAudioAnalysesRepository(database);
    await expect(repository.claimNextPending()).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
    );
  });

  it('explicitly retries only failed or no-match work', async () => {
    query.mockResolvedValueOnce(queryResult([]));
    const repository = new ClipAudioAnalysesRepository(database);
    await expect(repository.retry('analysis-id')).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('failed', 'no_match')"),
      ['analysis-id', null],
    );
  });
});
