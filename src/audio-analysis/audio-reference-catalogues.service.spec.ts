import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioReferenceCataloguesRepository } from './audio-reference-catalogues.repository';
import { AudioReferenceCataloguesService } from './audio-reference-catalogues.service';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';

describe('AudioReferenceCataloguesService', () => {
  const now = new Date('2026-08-01T00:00:00.000Z');
  const catalogue = {
    id: 'catalogue-id',
    instagram_recipient_id: 'instagram-artist-id',
    name: 'Cornell test catalogue',
    status: 'active' as const,
    created_at: now,
    updated_at: now,
  };
  const uploadingTrack = {
    id: 'track-id',
    catalogue_id: catalogue.id,
    title: 'Brown Eyed Women',
    artist_name: 'Grateful Dead',
    status: 'uploading' as const,
    storage_bucket: null,
    storage_path: null,
    mime_type: null,
    byte_size: null,
    last_error: null,
    uploaded_at: null,
    created_at: now,
    updated_at: now,
  };
  const readyTrack = {
    ...uploadingTrack,
    status: 'ready' as const,
    storage_bucket: 'clip-media',
    storage_path: `${catalogue.id}/references/${uploadingTrack.id}.mp3`,
    mime_type: 'audio/mpeg',
    byte_size: '3',
    uploaded_at: now,
  };
  const transaction = { query: jest.fn() } as unknown as DatabaseExecutor;
  const database = {
    withTransaction: jest.fn(
      (callback: (executor: DatabaseExecutor) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as DatabaseService;
  const analysisConfig = {
    maximumReferenceBytes: 100 * 1024 * 1024,
    referenceStorageBucket: 'audio-references',
  } as AudioAnalysisConfig;
  const upload = jest.fn();
  const storage = { upload } as unknown as SupabaseObjectStorage;
  const createActive = jest.fn();
  const findById = jest.fn();
  const listTracks = jest.fn();
  const createUploadingTrack = jest.fn();
  const markTrackReady = jest.fn();
  const markTrackFailed = jest.fn();
  const cataloguesRepository = {
    createActive,
    findById,
    listTracks,
    createUploadingTrack,
    markTrackReady,
    markTrackFailed,
  } as unknown as AudioReferenceCataloguesRepository;
  const enqueueStoredClipsForCatalogue = jest.fn();
  const analysesRepository = {
    enqueueStoredClipsForCatalogue,
  } as unknown as ClipAudioAnalysesRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  const service = () =>
    new AudioReferenceCataloguesService(
      database,
      analysisConfig,
      storage,
      cataloguesRepository,
      analysesRepository,
    );

  it('creates the active catalogue for an Instagram recipient', async () => {
    createActive.mockResolvedValueOnce(catalogue);
    await expect(
      service().create({
        instagramRecipientId: ' instagram-artist-id ',
        name: ' Cornell test catalogue ',
      }),
    ).resolves.toMatchObject({
      id: catalogue.id,
      instagramRecipientId: 'instagram-artist-id',
      tracks: [],
    });
    expect(createActive).toHaveBeenCalledWith({
      instagramRecipientId: 'instagram-artist-id',
      name: 'Cornell test catalogue',
    });
  });

  it('uploads a reference and queues existing stored clips atomically', async () => {
    const file = {
      buffer: Buffer.from([1, 2, 3]),
      mimetype: 'audio/mpeg',
      size: 3,
    };
    createUploadingTrack.mockResolvedValueOnce(uploadingTrack);
    upload.mockResolvedValueOnce(undefined);
    markTrackReady.mockResolvedValueOnce(readyTrack);
    enqueueStoredClipsForCatalogue.mockResolvedValueOnce(4);

    await expect(
      service().uploadTrack(
        catalogue.id,
        { title: 'Brown Eyed Women', artistName: 'Grateful Dead' },
        file,
      ),
    ).resolves.toMatchObject({
      id: uploadingTrack.id,
      status: 'ready',
      mimeType: 'audio/mpeg',
      byteSize: 3,
    });

    expect(upload).toHaveBeenCalledWith({
      bucket: 'audio-references',
      path: readyTrack.storage_path,
      data: file.buffer,
      contentType: 'audio/mpeg',
    });
    expect(markTrackReady).toHaveBeenCalledWith(
      {
        id: uploadingTrack.id,
        storageBucket: 'audio-references',
        storagePath: readyTrack.storage_path,
        mimeType: 'audio/mpeg',
        byteSize: 3,
      },
      transaction,
    );
    expect(enqueueStoredClipsForCatalogue).toHaveBeenCalledWith(
      catalogue.id,
      transaction,
    );
  });

  it('rejects a non-audio reference before creating a row', async () => {
    await expect(
      service().uploadTrack(
        catalogue.id,
        { title: 'Brown Eyed Women' },
        { buffer: Buffer.from([1]), mimetype: 'video/mp4', size: 1 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createUploadingTrack).not.toHaveBeenCalled();
  });

  it('marks the upload failed when object storage fails', async () => {
    createUploadingTrack.mockResolvedValueOnce(uploadingTrack);
    upload.mockRejectedValueOnce(new Error('Storage unavailable'));
    markTrackFailed.mockResolvedValueOnce({
      ...uploadingTrack,
      status: 'failed',
      last_error: 'Storage unavailable',
    });

    await expect(
      service().uploadTrack(
        catalogue.id,
        { title: 'Brown Eyed Women' },
        { buffer: Buffer.from([1]), mimetype: 'audio/mpeg', size: 1 },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(markTrackFailed).toHaveBeenCalledWith(
      uploadingTrack.id,
      'Storage unavailable',
    );
  });
});
