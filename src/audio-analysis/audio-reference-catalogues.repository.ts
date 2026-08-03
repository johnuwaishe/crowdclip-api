import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { AudioReferenceCatalogueRow } from './types/audio-reference-catalogue-row.type';
import { AudioReferenceTrackRow } from './types/audio-reference-track-row.type';

export interface CreateUploadingReferenceTrackInput {
  catalogueId: string;
  title: string;
  artistName: string | null;
}

export interface MarkReferenceTrackReadyInput {
  id: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
}

@Injectable()
export class AudioReferenceCataloguesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findById(
    id: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<AudioReferenceCatalogueRow | null> {
    const result = await executor.query<AudioReferenceCatalogueRow>(
      `
        SELECT *
        FROM public.audio_reference_catalogues
        WHERE id = $1
      `,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findByShowId(
    showId: string,
    workspaceId?: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<AudioReferenceCatalogueRow | null> {
    const result = await executor.query<AudioReferenceCatalogueRow>(
      `
        SELECT catalogue.*
        FROM public.audio_reference_catalogues AS catalogue
        JOIN public.shows AS show ON show.id = catalogue.show_id
        WHERE catalogue.show_id = $1
          AND ($2::uuid IS NULL OR show.workspace_id = $2)
      `,
      [showId, workspaceId ?? null],
    );
    return result.rows[0] ?? null;
  }

  async createUploadingTrack(
    input: CreateUploadingReferenceTrackInput,
  ): Promise<AudioReferenceTrackRow | null> {
    const result = await this.databaseService.query<AudioReferenceTrackRow>(
      `
        INSERT INTO public.audio_reference_tracks (
          catalogue_id,
          title,
          artist_name,
          status
        )
        SELECT id, $2, $3, 'uploading'
        FROM public.audio_reference_catalogues
        WHERE id = $1
        RETURNING *
      `,
      [input.catalogueId, input.title, input.artistName],
    );
    return result.rows[0] ?? null;
  }

  async markTrackReady(
    input: MarkReferenceTrackReadyInput,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<AudioReferenceTrackRow | null> {
    const result = await executor.query<AudioReferenceTrackRow>(
      `
        UPDATE public.audio_reference_tracks
        SET status = 'ready',
            storage_bucket = $2,
            storage_path = $3,
            mime_type = $4,
            byte_size = $5,
            last_error = NULL,
            uploaded_at = NOW()
        WHERE id = $1
          AND status = 'uploading'
        RETURNING *
      `,
      [
        input.id,
        input.storageBucket,
        input.storagePath,
        input.mimeType,
        input.byteSize,
      ],
    );
    return result.rows[0] ?? null;
  }

  async markTrackFailed(
    id: string,
    errorMessage: string,
  ): Promise<AudioReferenceTrackRow | null> {
    const result = await this.databaseService.query<AudioReferenceTrackRow>(
      `
        UPDATE public.audio_reference_tracks
        SET status = 'failed',
            last_error = $2
        WHERE id = $1
          AND status = 'uploading'
        RETURNING *
      `,
      [id, errorMessage],
    );
    return result.rows[0] ?? null;
  }

  async listTracks(catalogueId: string): Promise<AudioReferenceTrackRow[]> {
    const result = await this.databaseService.query<AudioReferenceTrackRow>(
      `
        SELECT *
        FROM public.audio_reference_tracks
        WHERE catalogue_id = $1
        ORDER BY created_at, id
      `,
      [catalogueId],
    );
    return result.rows;
  }

  async listReadyTracks(
    catalogueId: string,
  ): Promise<AudioReferenceTrackRow[]> {
    const result = await this.databaseService.query<AudioReferenceTrackRow>(
      `
        SELECT *
        FROM public.audio_reference_tracks
        WHERE catalogue_id = $1
          AND status = 'ready'
        ORDER BY created_at, id
      `,
      [catalogueId],
    );
    return result.rows;
  }
}
