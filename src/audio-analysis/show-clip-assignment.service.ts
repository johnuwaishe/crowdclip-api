import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';

@Injectable()
export class ShowClipAssignmentService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly analysesRepository: ClipAudioAnalysesRepository,
  ) {}

  assign(clipId: string, showId: string, workspaceId: string) {
    return this.databaseService.withTransaction(async (transaction) => {
      const result = await transaction.query<{
        clip_id: string;
        media_asset_id: string | null;
      }>(
        `
          WITH target AS (
            SELECT show.id, show.instagram_account_id
            FROM public.shows AS show
            WHERE show.id = $2
              AND show.workspace_id = $3
              AND show.status <> 'ended'
          ), assigned AS (
            UPDATE public.clips AS clip
            SET show_id = target.id
            FROM target
            WHERE clip.id = $1
              AND clip.instagram_account_id = target.instagram_account_id
              AND clip.show_id IS NULL
            RETURNING clip.id
          )
          SELECT
            assigned.id AS clip_id,
            preferred_asset.id AS media_asset_id
          FROM assigned
          LEFT JOIN LATERAL (
            SELECT media_asset.id
            FROM public.media_assets AS media_asset
            WHERE media_asset.clip_id = assigned.id
              AND media_asset.status = 'stored'
              AND (
                media_asset.mime_type LIKE 'video/%'
                OR media_asset.mime_type LIKE 'audio/%'
              )
            ORDER BY
              (media_asset.asset_type = 'fan_original') DESC,
              media_asset.stored_at DESC,
              media_asset.id
            LIMIT 1
          ) AS preferred_asset ON TRUE
        `,
        [clipId, showId, workspaceId],
      );
      const assigned = result.rows[0];
      if (!assigned) {
        const existing = await transaction.query<{ show_id: string | null }>(
          `
            SELECT clip.show_id
            FROM public.clips AS clip
            JOIN public.instagram_accounts AS account
              ON account.id = clip.instagram_account_id
            WHERE clip.id = $1 AND account.workspace_id = $2
          `,
          [clipId, workspaceId],
        );
        if (existing.rows[0]?.show_id) {
          throw new ConflictException('Clip is already assigned to a show');
        }
        throw new NotFoundException(
          'Inbox clip and compatible show were not found',
        );
      }
      if (assigned.media_asset_id) {
        await this.analysesRepository.enqueueForStoredMediaAsset(
          assigned.media_asset_id,
          transaction,
        );
      }
      return {
        clipId: assigned.clip_id,
        showId,
        analysisQueued: assigned.media_asset_id !== null,
      };
    });
  }
}
