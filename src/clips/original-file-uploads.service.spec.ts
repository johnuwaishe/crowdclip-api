import {
  BadRequestException,
  ConflictException,
  GoneException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClipAudioAnalysesRepository } from '../audio-analysis/clip-audio-analyses.repository';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { MediaDownloadConfig } from '../media/media-download.config';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { MediaAssetsRepository } from './media-assets.repository';
import { OriginalFileRequestsRepository } from './original-file-requests.repository';
import { OriginalFileUploadTokenService } from './original-file-upload-token.service';
import { OriginalFileUploadsService } from './original-file-uploads.service';
import { MediaAssetRow } from './types/media-asset-row.type';
import { OriginalFileRequestRow } from './types/original-file-request-row.type';

describe('OriginalFileUploadsService', () => {
  const now = new Date('2026-07-30T17:00:00.000Z');
  const requestId = '8ad85e44-af72-430c-a8ca-14db25b3e37e';
  const clipId = '9bd85e44-af72-430c-a8ca-14db25b3e37e';
  const uploadLeaseId = '7ad85e44-af72-430c-a8ca-14db25b3e37e';
  const tokenHash = 'a'.repeat(64);
  const token = {
    requestId,
    expiresAt: new Date('2026-08-06T17:00:00.000Z'),
    rawToken: 'signed-token',
    tokenHash,
  };
  const request: OriginalFileRequestRow = {
    id: requestId,
    clip_id: clipId,
    status: 'pending',
    upload_token_hash: tokenHash,
    expires_at: token.expiresAt,
    instagram_message_id: null,
    attempt_count: 0,
    last_error: null,
    sending_started_at: null,
    sent_at: null,
    upload_started_at: null,
    upload_lease_id: null,
    fulfilled_at: null,
    created_at: now,
    updated_at: now,
  };
  const uploadingRequest: OriginalFileRequestRow = {
    ...request,
    status: 'uploading',
    upload_started_at: now,
    upload_lease_id: uploadLeaseId,
  };
  const fulfilledRequest: OriginalFileRequestRow = {
    ...uploadingRequest,
    status: 'fulfilled',
    upload_started_at: null,
    upload_lease_id: null,
    fulfilled_at: now,
  };
  const asset: MediaAssetRow = {
    id: 'asset-id',
    clip_id: clipId,
    asset_type: 'fan_original',
    status: 'stored',
    source_url: null,
    storage_bucket: 'clip-media',
    storage_path: `${clipId}/original/${requestId}.mp4`,
    mime_type: 'video/mp4',
    byte_size: '3',
    attempt_count: 0,
    last_error: null,
    download_started_at: null,
    next_attempt_at: null,
    stored_at: now,
    created_at: now,
    updated_at: now,
  };
  const file = {
    buffer: Buffer.from([1, 2, 3]),
    mimetype: 'video/mp4',
    size: 3,
  };
  const transaction = {
    query: jest.fn(),
  } as unknown as DatabaseExecutor;
  const withTransaction = jest.fn(
    (callback: (executor: DatabaseExecutor) => Promise<unknown>) =>
      callback(transaction),
  );
  const databaseService = {
    withTransaction,
  } as unknown as DatabaseService;
  const mediaConfig = {
    maxBytes: 50 * 1024 * 1024,
    storageBucket: 'clip-media',
  } as MediaDownloadConfig;
  const uploadObject = jest.fn();
  const storage = {
    upload: uploadObject,
  } as unknown as SupabaseObjectStorage;
  const verifyToken = jest.fn();
  const matchesHash = jest.fn();
  const tokenService = {
    verify: verifyToken,
    matchesHash,
  } as unknown as OriginalFileUploadTokenService;
  const claimForUpload = jest.fn<
    ReturnType<OriginalFileRequestsRepository['claimForUpload']>,
    Parameters<OriginalFileRequestsRepository['claimForUpload']>
  >();
  const findRequestById = jest.fn();
  const findRequestByIdForUpdate = jest.fn();
  const releaseUploadAfterFailure = jest.fn();
  const markFulfilled = jest.fn();
  const requestsRepository = {
    claimForUpload,
    findById: findRequestById,
    findByIdForUpdate: findRequestByIdForUpdate,
    releaseUploadAfterFailure,
    markFulfilled,
  } as unknown as OriginalFileRequestsRepository;
  const createStoredFanOriginal = jest.fn();
  const findStoredByClipAndType = jest.fn();
  const mediaAssetsRepository = {
    createStoredFanOriginal,
    findStoredByClipAndType,
  } as unknown as MediaAssetsRepository;
  const enqueueForStoredMediaAsset = jest.fn();
  const analysesRepository = {
    enqueueForStoredMediaAsset,
  } as unknown as ClipAudioAnalysesRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    verifyToken.mockReturnValue(token);
    matchesHash.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = () =>
    new OriginalFileUploadsService(
      databaseService,
      mediaConfig,
      storage,
      tokenService,
      requestsRepository,
      mediaAssetsRepository,
      analysesRepository,
    );

  it('stores and transactionally fulfills a fan-original upload', async () => {
    claimForUpload.mockImplementationOnce((input) =>
      Promise.resolve({
        ...uploadingRequest,
        upload_lease_id: input.uploadLeaseId,
      }),
    );
    uploadObject.mockResolvedValueOnce(undefined);
    findRequestByIdForUpdate.mockImplementationOnce(() =>
      Promise.resolve({
        ...uploadingRequest,
        upload_lease_id: claimForUpload.mock.calls[0][0].uploadLeaseId,
      }),
    );
    createStoredFanOriginal.mockResolvedValueOnce(asset);
    markFulfilled.mockResolvedValueOnce(fulfilledRequest);

    await expect(createService().upload(token.rawToken, file)).resolves.toEqual(
      {
        requestId,
        clipId,
        status: 'fulfilled',
        mediaAsset: {
          id: asset.id,
          type: 'fan_original',
          mimeType: 'video/mp4',
          byteSize: 3,
          storedAt: now,
        },
      },
    );

    const claimedLeaseId = claimForUpload.mock.calls[0][0].uploadLeaseId;

    expect(claimedLeaseId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(claimForUpload).toHaveBeenCalledWith({
      requestId,
      uploadTokenHash: tokenHash,
      uploadLeaseId: claimedLeaseId,
      staleBefore: new Date(now.getTime() - 5 * 60 * 1_000),
    });
    expect(uploadObject).toHaveBeenCalledWith({
      bucket: 'clip-media',
      path: `${clipId}/original/${requestId}.mp4`,
      data: file.buffer,
      contentType: 'video/mp4',
    });
    expect(createStoredFanOriginal).toHaveBeenCalledWith(
      {
        clipId,
        storageBucket: 'clip-media',
        storagePath: `${clipId}/original/${requestId}.mp4`,
        mimeType: 'video/mp4',
        byteSize: 3,
      },
      transaction,
    );
    expect(markFulfilled).toHaveBeenCalledWith(
      requestId,
      claimedLeaseId,
      transaction,
    );
    expect(enqueueForStoredMediaAsset).toHaveBeenCalledWith(
      asset.id,
      transaction,
    );
  });

  it('returns an existing fulfilled upload without replacing its object', async () => {
    claimForUpload.mockResolvedValueOnce(null);
    findRequestById.mockResolvedValueOnce(fulfilledRequest);
    findStoredByClipAndType.mockResolvedValueOnce(asset);

    await expect(
      createService().upload(token.rawToken, file),
    ).resolves.toMatchObject({
      requestId,
      status: 'fulfilled',
      mediaAsset: { id: asset.id },
    });

    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('releases the upload lease when Storage fails', async () => {
    claimForUpload.mockImplementationOnce((input) =>
      Promise.resolve({
        ...uploadingRequest,
        upload_lease_id: input.uploadLeaseId,
      }),
    );
    uploadObject.mockRejectedValueOnce(new Error('Storage unavailable'));
    releaseUploadAfterFailure.mockResolvedValueOnce(request);

    await expect(
      createService().upload(token.rawToken, file),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const claimedLeaseId = claimForUpload.mock.calls[0][0].uploadLeaseId;

    expect(releaseUploadAfterFailure).toHaveBeenCalledWith(
      requestId,
      claimedLeaseId,
      'Storage unavailable',
    );
  });

  it.each([
    [undefined, 'A non-empty image or video file is required'],
    [
      { buffer: Buffer.from([1]), mimetype: 'text/plain', size: 1 },
      'File type is not supported',
    ],
    [
      { buffer: Buffer.from([1, 2]), mimetype: 'video/mp4', size: 1 },
      'File must not exceed 52428800 bytes',
    ],
  ])('rejects an invalid file', async (invalidFile, message) => {
    await expect(
      createService().upload(token.rawToken, invalidFile),
    ).rejects.toThrow(message);
    await expect(
      createService().upload(token.rawToken, invalidFile),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(claimForUpload).not.toHaveBeenCalled();
  });

  it('does not reveal malformed or unknown tokens', async () => {
    verifyToken.mockReturnValueOnce(null);

    await expect(
      createService().upload('invalid-token', file),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(claimForUpload).not.toHaveBeenCalled();
  });

  it('returns gone for an expired signed token', async () => {
    verifyToken.mockReturnValueOnce({
      ...token,
      expiresAt: new Date(now.getTime() - 1),
    });

    await expect(
      createService().upload(token.rawToken, file),
    ).rejects.toBeInstanceOf(GoneException);
    expect(claimForUpload).not.toHaveBeenCalled();
  });

  it('returns conflict while another upload owns the lease', async () => {
    claimForUpload.mockResolvedValueOnce(null);
    findRequestById.mockResolvedValueOnce(uploadingRequest);

    await expect(
      createService().upload(token.rawToken, file),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(uploadObject).not.toHaveBeenCalled();
  });
});
