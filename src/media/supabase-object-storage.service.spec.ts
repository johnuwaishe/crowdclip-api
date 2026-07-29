import { MediaDownloadConfig } from './media-download.config';
import { SupabaseObjectStorage } from './supabase-object-storage.service';

describe('SupabaseObjectStorage', () => {
  const config = {
    uploadTimeoutMs: 1_000,
    getSupabaseUrl: jest.fn().mockReturnValue('http://127.0.0.1:54321'),
    getServiceRoleKey: jest.fn().mockReturnValue('test-service-role-key'),
  } as unknown as MediaDownloadConfig;

  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('uploads to a deterministic private object path with upsert enabled', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const storage = new SupabaseObjectStorage(config);

    await storage.upload({
      bucket: 'clip-media',
      path: 'clip-id/instagram/asset-id.mp4',
      data: Buffer.from([1, 2, 3]),
      contentType: 'video/mp4',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];

    expect(requestUrl).toEqual(
      new URL(
        'http://127.0.0.1:54321/storage/v1/object/clip-media/clip-id/instagram/asset-id.mp4',
      ),
    );
    expect(requestInit).toMatchObject({ method: 'POST' });
    expect(requestInit?.headers).toMatchObject({
      'Content-Type': 'video/mp4',
      'x-upsert': 'true',
    });
  });

  it('returns a bounded error when Storage rejects an upload', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Bucket not found', { status: 404 }),
    );
    const storage = new SupabaseObjectStorage(config);

    await expect(
      storage.upload({
        bucket: 'clip-media',
        path: 'clip-id/instagram/asset-id.mp4',
        data: Buffer.from([1]),
        contentType: 'video/mp4',
      }),
    ).rejects.toThrow(
      'Supabase Storage upload returned HTTP 404: Bucket not found',
    );
  });
});
