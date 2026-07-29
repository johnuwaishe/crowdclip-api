import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ClipsService } from './../src/clips/clips.service';
import { DatabaseService } from './../src/database/database.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const listRecentForReview = jest.fn().mockResolvedValue([]);
  const decideMediaChoice = jest.fn();
  const query = jest.fn((sql: string) => {
    if (sql.includes('SELECT 1 AS connected')) {
      return Promise.resolve({ rows: [{ connected: 1 }] });
    }

    return Promise.resolve({ rows: [] });
  });

  beforeEach(async () => {
    query.mockClear();
    listRecentForReview.mockClear();
    decideMediaChoice.mockReset();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        query,
      })
      .overrideProvider(ClipsService)
      .useValue({
        listRecentForReview,
        decideMediaChoice,
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

  it('/clips/:id/media-choice records a decision (PATCH)', () => {
    const clipId = '8ad85e44-af72-430c-a8ca-14db25b3e37e';
    decideMediaChoice.mockResolvedValueOnce({
      clipId,
      mediaChoice: 'use_instagram_story',
      updatedAt: new Date('2026-07-30T00:00:00.000Z'),
      originalFileRequest: null,
    });

    return request(app.getHttpServer())
      .patch(`/clips/${clipId}/media-choice`)
      .send({ mediaChoice: 'use_instagram_story' })
      .expect(200)
      .expect({
        clipId,
        mediaChoice: 'use_instagram_story',
        updatedAt: '2026-07-30T00:00:00.000Z',
        originalFileRequest: null,
      });
  });

  it('/clips/:id/media-choice rejects an invalid UUID (PATCH)', () => {
    return request(app.getHttpServer())
      .patch('/clips/not-a-uuid/media-choice')
      .send({ mediaChoice: 'use_instagram_story' })
      .expect(400);
  });

  it('/clips/:id/media-choice rejects an invalid choice (PATCH)', () => {
    return request(app.getHttpServer())
      .patch('/clips/8ad85e44-af72-430c-a8ca-14db25b3e37e/media-choice')
      .send({ mediaChoice: 'undecided' })
      .expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});
