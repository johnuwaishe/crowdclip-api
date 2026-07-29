import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const query = jest.fn((sql: string) => {
    if (sql.includes('SELECT 1 AS connected')) {
      return Promise.resolve({ rows: [{ connected: 1 }] });
    }

    return Promise.resolve({ rows: [] });
  });

  beforeEach(async () => {
    query.mockClear();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        query,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
      database: 'up',
    });
  });

  it('/clips (GET)', () => {
    return request(app.getHttpServer()).get('/clips').expect(200).expect({
      clips: [],
    });
  });

  it('/clips rejects an invalid limit (GET)', () => {
    return request(app.getHttpServer()).get('/clips?limit=101').expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});
