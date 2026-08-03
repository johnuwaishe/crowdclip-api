import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { UserProfileRow } from './types/user-profile-row.type';

@Injectable()
export class UserProfilesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByUserId(
    userId: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<UserProfileRow | null> {
    const result = await executor.query<UserProfileRow>(
      `SELECT * FROM public.user_profiles WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async findOrCreate(
    userId: string,
    instagramUsername: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<UserProfileRow> {
    const preferred = this.normalizeUsername(instagramUsername);
    await executor.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [preferred],
    );
    const existing = await this.findByUserId(userId, executor);
    if (existing) return existing;

    const candidates = [
      preferred,
      this.suffixedUsername(preferred, userId, 8),
      this.suffixedUsername(preferred, userId, 12),
    ];
    const result = await executor.query<UserProfileRow>(
      `
        WITH candidates(username, priority) AS (
          VALUES ($2::text, 1), ($3::text, 2), ($4::text, 3)
        ), available AS (
          SELECT candidate.username
          FROM candidates AS candidate
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.user_profiles AS profile
            WHERE lower(profile.username) = lower(candidate.username)
          )
          ORDER BY candidate.priority
          LIMIT 1
        )
        INSERT INTO public.user_profiles (user_id, username)
        SELECT $1, available.username
        FROM available
        ON CONFLICT (user_id)
        DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING *
      `,
      [userId, ...candidates],
    );
    const profile = result.rows[0];
    if (!profile) {
      throw new Error('A unique CrowdClip username could not be allocated');
    }
    return profile;
  }

  private normalizeUsername(value: string): string {
    const normalized = value
      .trim()
      .replace(/^@+/, '')
      .toLowerCase()
      .replace(/[^a-z0-9._]+/g, '_')
      .replace(/^[^a-z0-9]+/, '')
      .slice(0, 30);
    return normalized || 'user';
  }

  private suffixedUsername(
    preferred: string,
    userId: string,
    suffixLength: number,
  ): string {
    const suffix = userId.replace(/-/g, '').slice(0, suffixLength);
    const base = preferred.slice(0, 29 - suffix.length).replace(/[._]+$/, '');
    return `${base || 'user'}_${suffix}`;
  }
}
