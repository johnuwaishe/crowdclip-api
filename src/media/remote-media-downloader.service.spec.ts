import { MediaDownloadConfig } from './media-download.config';
import { RemoteMediaDownloader } from './remote-media-downloader.service';

describe('RemoteMediaDownloader', () => {
  const config = {
    downloadTimeoutMs: 1_000,
    maxBytes: 10,
  } as MediaDownloadConfig;

  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('downloads bounded image or video content', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': '3',
        },
      }),
    );

    const downloader = new RemoteMediaDownloader(config);

    await expect(
      downloader.download('https://cdn.example.test/story.mp4'),
    ).resolves.toMatchObject({
      mimeType: 'video/mp4',
      byteSize: 3,
      extension: 'mp4',
    });
  });

  it('validates every redirect URL before following it', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'http://private.example.test/story.mp4',
        },
      }),
    );

    const downloader = new RemoteMediaDownloader(config);

    await expect(
      downloader.download('https://cdn.example.test/story.mp4'),
    ).rejects.toThrow('Media source URL must be a credential-free HTTPS URL');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported response content', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1]).buffer, {
        status: 200,
        headers: {
          'content-type': 'text/html',
        },
      }),
    );

    const downloader = new RemoteMediaDownloader(config);

    await expect(
      downloader.download('https://cdn.example.test/story'),
    ).rejects.toThrow('Downloaded media has an unsupported content type');
  });

  it('enforces the size limit while streaming the response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(11).buffer, {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
        },
      }),
    );

    const downloader = new RemoteMediaDownloader(config);

    await expect(
      downloader.download('https://cdn.example.test/story.jpg'),
    ).rejects.toThrow('Downloaded media exceeds the configured size limit');
  });
});
