import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';

export interface DatabaseExecutor {
  query<T extends QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

@Injectable()
export class DatabaseService implements DatabaseExecutor, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    this.pool = new Pool({
      connectionString: this.configService.getOrThrow('DATABASE_URL'),
      connectionTimeoutMillis: 5_000,
      query_timeout: 5_000,
    });
  }

  query<T extends QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  async withTransaction<T>(
    callback: (transaction: DatabaseExecutor) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let destroyClient = false;

    const transaction: DatabaseExecutor = {
      query: <Row extends QueryResultRow>(
        sql: string,
        params: unknown[] = [],
      ) => client.query<Row>(sql, params),
    };

    try {
      await client.query('BEGIN');

      const result = await callback(transaction);

      await client.query('COMMIT');

      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        destroyClient = true;
        this.logger.error(
          'Failed to roll back database transaction; discarding client',
          rollbackError instanceof Error
            ? rollbackError.stack
            : String(rollbackError),
        );
      }

      throw error;
    } finally {
      client.release(destroyClient);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
