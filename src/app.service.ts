import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

export interface HealthResponse {
  status: 'ok';
  database: 'up';
}

@Injectable()
export class AppService {
  constructor(private readonly databaseService: DatabaseService) {}
  async getHealth(): Promise<HealthResponse> {
    try {
      await this.databaseService.query('SELECT 1');

      return {
        status: 'ok',
        database: 'up',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }
  }
}
