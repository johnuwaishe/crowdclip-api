import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ShowWithCatalogueRow } from './types/show-row.type';

export interface CreateShowInput {
  workspaceId: string;
  instagramAccountId: string;
  name: string;
  startsAt: Date | null;
  venueName: string | null;
  city: string | null;
}

export interface UpdateShowInput {
  id: string;
  workspaceId: string;
  name: string;
  startsAt: Date | null;
  venueName: string | null;
  city: string | null;
}

@Injectable()
export class ShowsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  create(input: CreateShowInput): Promise<ShowWithCatalogueRow | null> {
    return this.databaseService.withTransaction(async (transaction) => {
      const showResult = await transaction.query<ShowWithCatalogueRow>(
        `
          INSERT INTO public.shows (
            workspace_id,
            instagram_account_id,
            name,
            starts_at,
            venue_name,
            city
          )
          SELECT $1, account.id, $3, $4, $5, $6
          FROM public.instagram_accounts AS account
          WHERE account.id = $2
            AND account.workspace_id = $1
            AND account.connection_status = 'connected'
          RETURNING *
        `,
        [
          input.workspaceId,
          input.instagramAccountId,
          input.name,
          input.startsAt,
          input.venueName,
          input.city,
        ],
      );
      const show = showResult.rows[0];
      if (!show) return null;
      const catalogueResult = await transaction.query<{
        id: string;
        name: string;
      }>(
        `
          INSERT INTO public.audio_reference_catalogues (show_id, name)
          VALUES ($1, $2)
          RETURNING id, name
        `,
        [show.id, `${show.name} reference songs`],
      );
      const catalogue = catalogueResult.rows[0];
      if (!catalogue)
        throw new Error('Show reference catalogue was not created');
      return {
        ...show,
        catalogue_id: catalogue.id,
        catalogue_name: catalogue.name,
      };
    });
  }

  async list(workspaceId: string): Promise<ShowWithCatalogueRow[]> {
    const result = await this.databaseService.query<ShowWithCatalogueRow>(
      `${this.selectWithCatalogue()}
       WHERE show.workspace_id = $1
       ORDER BY
         show.starts_at DESC NULLS LAST,
         show.created_at DESC,
         show.id DESC`,
      [workspaceId],
    );
    return result.rows;
  }

  async findById(
    id: string,
    workspaceId: string,
  ): Promise<ShowWithCatalogueRow | null> {
    const result = await this.databaseService.query<ShowWithCatalogueRow>(
      `${this.selectWithCatalogue()}
       WHERE show.id = $1 AND show.workspace_id = $2`,
      [id, workspaceId],
    );
    return result.rows[0] ?? null;
  }

  async update(input: UpdateShowInput): Promise<ShowWithCatalogueRow | null> {
    const result = await this.databaseService.query<ShowWithCatalogueRow>(
      `
        WITH updated AS (
          UPDATE public.shows
          SET name = $3,
              starts_at = $4,
              venue_name = $5,
              city = $6
          WHERE id = $1
            AND workspace_id = $2
            AND status <> 'ended'
          RETURNING *
        )
        SELECT
          updated.*,
          catalogue.id AS catalogue_id,
          catalogue.name AS catalogue_name
        FROM updated
        JOIN public.audio_reference_catalogues AS catalogue
          ON catalogue.show_id = updated.id
      `,
      [
        input.id,
        input.workspaceId,
        input.name,
        input.startsAt,
        input.venueName,
        input.city,
      ],
    );
    return result.rows[0] ?? null;
  }

  activate(
    id: string,
    workspaceId: string,
  ): Promise<ShowWithCatalogueRow | null> {
    return this.databaseService.withTransaction(async (transaction) => {
      const target = await transaction.query<{ instagram_account_id: string }>(
        `
          SELECT instagram_account_id
          FROM public.shows
          WHERE id = $1
            AND workspace_id = $2
            AND status IN ('draft', 'active')
          FOR UPDATE
        `,
        [id, workspaceId],
      );
      const show = target.rows[0];
      if (!show) return null;
      await transaction.query(
        `
          SELECT id
          FROM public.instagram_accounts
          WHERE id = $1
          FOR UPDATE
        `,
        [show.instagram_account_id],
      );
      await transaction.query(
        `
          UPDATE public.shows
          SET status = 'ended', ended_at = NOW()
          WHERE instagram_account_id = $1
            AND status = 'active'
            AND id <> $2
        `,
        [show.instagram_account_id, id],
      );
      await transaction.query(
        `
          UPDATE public.shows
          SET status = 'active', ended_at = NULL
          WHERE id = $1
        `,
        [id],
      );
      const result = await transaction.query<ShowWithCatalogueRow>(
        `${this.selectWithCatalogue()}
         WHERE show.id = $1 AND show.workspace_id = $2`,
        [id, workspaceId],
      );
      return result.rows[0] ?? null;
    });
  }

  async end(
    id: string,
    workspaceId: string,
  ): Promise<ShowWithCatalogueRow | null> {
    const result = await this.databaseService.query<ShowWithCatalogueRow>(
      `
        WITH ended AS (
          UPDATE public.shows
          SET status = 'ended', ended_at = NOW()
          WHERE id = $1
            AND workspace_id = $2
            AND status IN ('draft', 'active')
          RETURNING *
        )
        SELECT
          ended.*,
          catalogue.id AS catalogue_id,
          catalogue.name AS catalogue_name
        FROM ended
        JOIN public.audio_reference_catalogues AS catalogue
          ON catalogue.show_id = ended.id
      `,
      [id, workspaceId],
    );
    return result.rows[0] ?? null;
  }

  private selectWithCatalogue(): string {
    return `
      SELECT
        show.*,
        catalogue.id AS catalogue_id,
        catalogue.name AS catalogue_name
      FROM public.shows AS show
      JOIN public.audio_reference_catalogues AS catalogue
        ON catalogue.show_id = show.id
    `;
  }
}
