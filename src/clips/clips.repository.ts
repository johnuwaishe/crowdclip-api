import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { ClipRow } from './types/clip-row.type';

export interface FindOrCreateClipInput {
  fanId: string;
  sourceWebhookEventId: string;
  mentionedAt: Date | null;
}

@Injectable()
export class ClipsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findOrCreate(
    input: FindOrCreateClipInput,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<ClipRow> {
    const insertResult = await executor.query<ClipRow>(
      `
        INSERT INTO public.clips (
          fan_id,
          source_webhook_event_id,
          mentioned_at
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (source_webhook_event_id)
        DO NOTHING
        RETURNING *
      `,
      [input.fanId, input.sourceWebhookEventId, input.mentionedAt],
    );

    const insertedClip = insertResult.rows[0];

    if (insertedClip) {
      return insertedClip;
    }

    const existingResult = await executor.query<ClipRow>(
      `
        SELECT *
        FROM public.clips
        WHERE source_webhook_event_id = $1
      `,
      [input.sourceWebhookEventId],
    );

    const existingClip = existingResult.rows[0];

    if (!existingClip) {
      throw new Error('Clip was not found after insert conflict');
    }

    return existingClip;
  }
}
