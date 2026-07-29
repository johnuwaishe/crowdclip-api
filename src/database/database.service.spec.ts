import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from './database.service';

jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

interface ValueRow extends QueryResultRow {
  value: number;
}

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

describe('DatabaseService', () => {
  const client = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const pool = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('postgresql://localhost/test'),
  };

  let service: DatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();

    (Pool as unknown as jest.Mock).mockImplementation(() => pool);
    pool.connect.mockResolvedValue(client);
    pool.end.mockResolvedValue(undefined);
    client.query.mockResolvedValue(queryResult([]));

    service = new DatabaseService(configService as unknown as ConfigService);
  });

  it('passes parameterized queries to the pool', async () => {
    const result = queryResult<ValueRow>([{ value: 1 }]);
    pool.query.mockResolvedValue(result);

    await expect(
      service.query<ValueRow>('SELECT $1::int AS value', [1]),
    ).resolves.toBe(result);

    expect(pool.query).toHaveBeenCalledWith('SELECT $1::int AS value', [1]);
  });

  it('commits successful work and releases the client', async () => {
    const selectResult = queryResult<ValueRow>([{ value: 1 }]);

    client.query
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(selectResult)
      .mockResolvedValueOnce(queryResult([]));

    const result = await service.withTransaction(async (transaction) => {
      const query = await transaction.query<ValueRow>(
        'SELECT $1::int AS value',
        [1],
      );

      return query.rows[0].value;
    });

    expect(result).toBe(1);
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      'SELECT $1::int AS value',
      [1],
    );
    expect(client.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('rolls back when transactional work fails', async () => {
    const transactionError = new Error('Insert failed');

    await expect(
      service.withTransaction(() => Promise.reject(transactionError)),
    ).rejects.toBe(transactionError);

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('rolls back when committing fails', async () => {
    const commitError = new Error('Commit failed');

    client.query
      .mockResolvedValueOnce(queryResult([]))
      .mockRejectedValueOnce(commitError)
      .mockResolvedValueOnce(queryResult([]));

    await expect(
      service.withTransaction(() => Promise.resolve('result')),
    ).rejects.toBe(commitError);

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(client.query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('discards the client when rollback also fails', async () => {
    const transactionError = new Error('Insert failed');
    const rollbackError = new Error('Connection lost');
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    client.query
      .mockResolvedValueOnce(queryResult([]))
      .mockRejectedValueOnce(rollbackError);

    await expect(
      service.withTransaction(() => Promise.reject(transactionError)),
    ).rejects.toBe(transactionError);

    expect(client.release).toHaveBeenCalledWith(true);
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to roll back database transaction; discarding client',
      rollbackError.stack,
    );

    loggerError.mockRestore();
  });

  it('closes the pool when the module is destroyed', async () => {
    await service.onModuleDestroy();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
