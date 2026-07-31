import { OriginalFileUploadsController } from './original-file-uploads.controller';
import { OriginalFileUploadsService } from './original-file-uploads.service';

describe('OriginalFileUploadsController', () => {
  const upload = jest.fn();
  const service = {
    upload,
  } as unknown as OriginalFileUploadsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the signed token and multipart file to the service', async () => {
    const file = {
      buffer: Buffer.from([1, 2, 3]),
      mimetype: 'video/mp4',
      size: 3,
    };
    const result = {
      requestId: 'request-id',
      clipId: 'clip-id',
      status: 'fulfilled' as const,
      mediaAsset: {
        id: 'asset-id',
        type: 'fan_original' as const,
        mimeType: 'video/mp4',
        byteSize: 3,
        storedAt: new Date('2026-07-30T17:00:00.000Z'),
      },
    };
    upload.mockResolvedValueOnce(result);
    const controller = new OriginalFileUploadsController(service);

    await expect(controller.upload('signed-token', file)).resolves.toBe(result);
    expect(upload).toHaveBeenCalledWith('signed-token', file);
  });
});
