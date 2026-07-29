import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { FanRow } from './types/fan-row.type';

export interface FindOrCreateFanInput {
  instagramScopedUserId: string;
}

@Injectable()
export class FansRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findOrCreate(
    input: FindOrCreateFanInput,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<FanRow> {
    const insertResult = await executor.query<FanRow>(
      `
        INSERT INTO public.fans (
          instagram_scoped_user_id
        )
        VALUES ($1)
        ON CONFLICT (instagram_scoped_user_id)
        DO NOTHING
        RETURNING *
      `,
      [input.instagramScopedUserId],
    );

    const insertedFan = insertResult.rows[0];

    if (insertedFan) {
      return insertedFan;
    }

    const existingResult = await executor.query<FanRow>(
      `
        SELECT *
        FROM public.fans
        WHERE instagram_scoped_user_id = $1
      `,
      [input.instagramScopedUserId],
    );

    const existingFan = existingResult.rows[0];

    if (!existingFan) {
      throw new Error('Fan was not found after insert conflict');
    }

    return existingFan;
  }
}
