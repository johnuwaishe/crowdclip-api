import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { OriginalFileRequestRow } from './types/original-file-request-row.type';

export interface CreateOriginalFileRequestInput {
  clipId: string;
  uploadTokenHash: string;
  ttlSeconds: number;
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
          clip_id,
          upload_token_hash,
          expires_at
        )
        VALUES (
          $1,
          $2,
          NOW() + ($3 * INTERVAL '1 second')
        )
        RETURNING *
      `,
      [input.clipId, input.uploadTokenHash, input.ttlSeconds],
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
}
