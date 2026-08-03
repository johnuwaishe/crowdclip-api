import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { ArtistClipMediaChoice } from './types/clip-decision.type';
import { ClipReviewRow } from './types/clip-review-row.type';
import { ClipRow } from './types/clip-row.type';

export interface FindOrCreateClipInput {
  fanId: string;
  sourceWebhookEventId: string;
  instagramAccountId: string;
  showId: string | null;
  mentionedAt: Date | null;
}

@Injectable()
export class ClipsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByIdForUpdate(
    clipId: string,
    executor: DatabaseExecutor,
    workspaceId?: string,
  ): Promise<ClipRow | null> {
    const result = await executor.query<ClipRow>(
      `
        SELECT clip.*
        FROM public.clips AS clip
        JOIN public.instagram_accounts AS account
          ON account.id = clip.instagram_account_id
        WHERE clip.id = $1
          AND ($2::uuid IS NULL OR account.workspace_id = $2)
        FOR UPDATE
      `,
      [clipId, workspaceId ?? null],
    );

    return result.rows[0] ?? null;
  }

  async updateMediaChoice(
    clipId: string,
    mediaChoice: ArtistClipMediaChoice,
    executor: DatabaseExecutor,
  ): Promise<ClipRow> {
    const result = await executor.query<ClipRow>(
      `
        UPDATE public.clips
        SET media_choice = $2
        WHERE id = $1
          AND media_choice = 'undecided'
        RETURNING *
      `,
      [clipId, mediaChoice],
    );

    const clip = result.rows[0];

    if (!clip) {
      throw new Error('Clip media choice was not updated');
    }

    return clip;
  }

  async listRecentForReview(
    limit: number,
    workspaceId: string,
  ): Promise<ClipReviewRow[]> {
    const result = await this.databaseService.query<ClipReviewRow>(
      `
        SELECT
          clip.id AS clip_id,
          clip.media_choice,
          clip.mentioned_at,
          clip.created_at AS clip_created_at,
          fan.id AS fan_id,
          fan.instagram_scoped_user_id,
          media_asset.id AS asset_id,
          media_asset.asset_type,
          media_asset.status AS asset_status,
          media_asset.storage_bucket,
          media_asset.storage_path,
          media_asset.mime_type,
          media_asset.byte_size,
          media_asset.stored_at AS asset_stored_at,
          media_asset.created_at AS asset_created_at
        FROM (
          SELECT *
          FROM public.clips AS scoped_clip
          WHERE EXISTS (
            SELECT 1
            FROM public.instagram_accounts AS account
            WHERE account.id = scoped_clip.instagram_account_id
              AND account.workspace_id = $2
          )
          ORDER BY created_at DESC, id DESC
          LIMIT $1
        ) AS clip
        INNER JOIN public.fans AS fan
          ON fan.id = clip.fan_id
        LEFT JOIN public.media_assets AS media_asset
          ON media_asset.clip_id = clip.id
        ORDER BY
          clip.created_at DESC,
          clip.id DESC,
          media_asset.created_at ASC
      `,
      [limit, workspaceId],
    );

    return result.rows;
  }

  async findOrCreate(
    input: FindOrCreateClipInput,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<ClipRow> {
    const insertResult = await executor.query<ClipRow>(
      `
        INSERT INTO public.clips (
          fan_id,
          source_webhook_event_id,
          instagram_account_id,
          show_id,
          mentioned_at
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (source_webhook_event_id)
        DO NOTHING
        RETURNING *
      `,
      [
        input.fanId,
        input.sourceWebhookEventId,
        input.instagramAccountId,
        input.showId,
        input.mentionedAt,
      ],
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
