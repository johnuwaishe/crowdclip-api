import { DatabaseService } from '../database/database.service';
import { CASINO_DEMO_ID, CASINO_DEMO_SOURCES } from './casino-demo';
import { DemoMediaAssetsRepository } from './demo-media-assets.repository';

describe('DemoMediaAssetsRepository', () => {
  it('invalidates a stored excerpt when its media cut changes', async () => {
    const source = CASINO_DEMO_SOURCES[0];
    const row = {
      id: source.id,
      status: 'pending',
    };
    const query = jest
      .fn<Promise<{ rows: (typeof row)[] }>, [string, unknown[]]>()
      .mockResolvedValue({ rows: [row] });
    const database = { query };
    const repository = new DemoMediaAssetsRepository(
      database as unknown as DatabaseService,
    );

    await expect(repository.upsert(CASINO_DEMO_ID, source)).resolves.toBe(row);

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain(
      'demo_media_assets.source_start_ms IS DISTINCT FROM EXCLUDED.source_start_ms',
    );
    expect(sql).toContain("THEN 'pending'");
    expect(sql).toContain('storage_path = CASE');
    expect(parameters).toEqual([
      source.id,
      CASINO_DEMO_ID,
      source.creator,
      source.venue,
      source.city,
      source.platform,
      source.sourceUrl,
      source.videoId,
      source.sourceStartMs,
      source.referenceStartMs,
      source.excerptDurationMs,
    ]);
  });
});
