import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';

describe('AppController', () => {
  let appController: AppController;
  const databaseService = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    databaseService.query.mockResolvedValue({ rows: [{ connected: 1 }] });

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DatabaseService,
          useValue: databaseService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('reports that the API and database are available', async () => {
      await expect(appController.healthCheck()).resolves.toEqual({
        status: 'ok',
        database: 'up',
      });
    });

    it('reports an unavailable service when the database is down', async () => {
      databaseService.query.mockRejectedValueOnce(
        new Error('Database unavailable'),
      );

      await expect(appController.healthCheck()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
