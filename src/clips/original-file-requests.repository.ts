import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { OriginalFileRequestRow } from './types/original-file-request-row.type';

export interface CreateOriginalFileRequestInput {
  id: string;
  clipId: string;
  uploadTokenHash: string;
  expiresAt: Date;
}

export interface ClaimOriginalFileUploadInput {
  requestId: string;
  uploadTokenHash: string;
  uploadLeaseId: string;
  staleBefore: Date;
}

@Injectable()
export class OriginalFileRequestsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(
    input: CreateOriginalFileRequestInput,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<OriginalFileRequestRow> {
    const result = await executor.query<OriginalFileRequestRow>(
      `
        INSERT INTO public.original_file_requests (
          id,
          clip_id,
          upload_token_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [input.id, input.clipId, input.uploadTokenHash, input.expiresAt],
    );

    const request = result.rows[0];

    if (!request) {
      throw new Error('Original file request was not returned after insert');
    }

    return request;
  }

  async findByClipId(
    clipId: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<OriginalFileRequestRow | null> {
    const result = await executor.query<OriginalFileRequestRow>(
      `
        SELECT *
        FROM public.original_file_requests
        WHERE clip_id = $1
      `,
      [clipId],
    );

    return result.rows[0] ?? null;
  }

  async findById(
    requestId: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<OriginalFileRequestRow | null> {
    const result = await executor.query<OriginalFileRequestRow>(
      `
        SELECT *
        FROM public.original_file_requests
        WHERE id = $1
      `,
      [requestId],
    );

    return result.rows[0] ?? null;
  }

  async findByIdForUpdate(
    requestId: string,
    executor: DatabaseExecutor,
  ): Promise<OriginalFileRequestRow | null> {
    const result = await executor.query<OriginalFileRequestRow>(
      `
        SELECT *
        FROM public.original_file_requests
        WHERE id = $1
        FOR UPDATE
      `,
      [requestId],
    );

    return result.rows[0] ?? null;
  }

  async claimForUpload(
    input: ClaimOriginalFileUploadInput,
  ): Promise<OriginalFileRequestRow | null> {
    const result = await this.databaseService.query<OriginalFileRequestRow>(
      `
        UPDATE public.original_file_requests
        SET status = 'uploading',
            upload_started_at = NOW(),
            upload_lease_id = $3,
            last_error = NULL
        WHERE id = $1
          AND upload_token_hash = $2
          AND expires_at > NOW()
          AND (
            status IN ('pending', 'sent', 'failed')
            OR (
              status = 'uploading'
              AND upload_started_at < $4
            )
          )
        RETURNING *
      `,
      [
        input.requestId,
        input.uploadTokenHash,
        input.uploadLeaseId,
        input.staleBefore,
      ],
    );

    return result.rows[0] ?? null;
  }

  async releaseUploadAfterFailure(
    requestId: string,
    uploadLeaseId: string,
    errorMessage: string,
  ): Promise<OriginalFileRequestRow | null> {
    const result = await this.databaseService.query<OriginalFileRequestRow>(
      `
        UPDATE public.original_file_requests
        SET status = CASE
              WHEN sent_at IS NOT NULL THEN 'sent'
              ELSE 'pending'
            END,
            upload_started_at = NULL,
            upload_lease_id = NULL,
            last_error = $3
        WHERE id = $1
          AND status = 'uploading'
          AND upload_lease_id = $2
        RETURNING *
      `,
      [requestId, uploadLeaseId, errorMessage],
    );

    return result.rows[0] ?? null;
  }

  async markFulfilled(
    requestId: string,
    uploadLeaseId: string,
    executor: DatabaseExecutor,
  ): Promise<OriginalFileRequestRow | null> {
    const result = await executor.query<OriginalFileRequestRow>(
      `
        UPDATE public.original_file_requests
        SET status = 'fulfilled',
            last_error = NULL,
            upload_started_at = NULL,
            upload_lease_id = NULL,
            fulfilled_at = NOW()
        WHERE id = $1
          AND status = 'uploading'
          AND upload_lease_id = $2
        RETURNING *
      `,
      [requestId, uploadLeaseId],
    );

    return result.rows[0] ?? null;
  }
}
