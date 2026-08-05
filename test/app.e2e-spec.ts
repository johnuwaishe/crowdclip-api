import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ClipsService } from './../src/clips/clips.service';
import { OriginalFileUploadsService } from './../src/clips/original-file-uploads.service';
import { OriginalFileUploadTokenGuard } from './../src/clips/original-file-upload-token.guard';
import { DatabaseService } from './../src/database/database.service';
import { WorkspaceAccessGuard } from './../src/workspaces/workspace-access.guard';
import { WorkspaceAccessRequest } from './../src/workspaces/current-workspace-access.decorator';
import { setupOpenApi } from './../src/openapi';
import type { OpenAPIObject } from '@nestjs/swagger';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const workspaceId = '20000000-0000-4000-8000-000000000002';
  const instagramAccountId = '10000000-0000-4000-8000-000000000001';
  const listRecentForReview = jest.fn().mockResolvedValue([]);
  const decideMediaChoice = jest.fn();
  const uploadOriginalFile = jest.fn();
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
    uploadOriginalFile.mockReset();
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
      .overrideProvider(OriginalFileUploadsService)
      .useValue({
        upload: uploadOriginalFile,
      })
      .overrideGuard(OriginalFileUploadTokenGuard)
      .useValue({
        canActivate: () => true,
      })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context
            .switchToHttp()
            .getRequest<WorkspaceAccessRequest>().crowdclipWorkspace = {
            workspaceId,
            instagramAccountId,
            userId: null,
            authenticationMethod: 'instagram_provisional',
            provisional: true,
            expiresAt: new Date('2026-09-01T00:00:00.000Z'),
          };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    setupOpenApi(app);
    await app.init();
  });

  it('/docs serves the interactive Swagger UI (GET)', () => {
    return request(app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('content-type', /html/);
  });

  it('/docs-json serves the OpenAPI document (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200)
      .expect('content-type', /json/);

    const document = response.body as unknown as OpenAPIObject;

    expect(document.info).toMatchObject({
      title: 'CrowdClip API',
      version: '0.0.1',
    });
    expect(document.paths).toHaveProperty('/shows/{showId}/timeline');
    expect(document.paths).toHaveProperty('/uploads/original/{token}');
    expect(document.components?.securitySchemes).toHaveProperty('supabase');
    expect(document.components?.securitySchemes).toHaveProperty(
      'crowdclip-session',
    );
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
      database: 'up',
    });
  });

  it('/clips returns clips from the connected workspace (GET)', async () => {
    await request(app.getHttpServer()).get('/clips').expect(200).expect({
      clips: [],
    });
    expect(listRecentForReview).toHaveBeenCalledWith(20, workspaceId);
  });

  it('/clips rejects an invalid limit (GET)', () => {
    return request(app.getHttpServer()).get('/clips?limit=101').expect(400);
  });

  it('/clips/:id/media-choice records a workspace-scoped decision (PATCH)', async () => {
    const clipId = '8ad85e44-af72-430c-a8ca-14db25b3e37e';
    decideMediaChoice.mockResolvedValueOnce({
      clipId,
      mediaChoice: 'use_instagram_story',
      updatedAt: new Date('2026-07-30T00:00:00.000Z'),
      originalFileRequest: null,
    });

    await request(app.getHttpServer())
      .patch(`/clips/${clipId}/media-choice`)
      .send({ mediaChoice: 'use_instagram_story' })
      .expect(200)
      .expect({
        clipId,
        mediaChoice: 'use_instagram_story',
        updatedAt: '2026-07-30T00:00:00.000Z',
        originalFileRequest: null,
      });
    expect(decideMediaChoice).toHaveBeenCalledWith(
      clipId,
      'use_instagram_story',
      workspaceId,
    );
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

  it('/auth/account/claim requires a verified Supabase identity (POST)', () => {
    return request(app.getHttpServer()).post('/auth/account/claim').expect(401);
  });

  it('/uploads/original/:token accepts a fan-original file (POST)', () => {
    uploadOriginalFile.mockResolvedValueOnce({
      requestId: 'request-id',
      clipId: 'clip-id',
      status: 'fulfilled',
      mediaAsset: {
        id: 'asset-id',
        type: 'fan_original',
        mimeType: 'video/mp4',
        byteSize: 3,
        storedAt: new Date('2026-07-30T17:00:00.000Z'),
      },
    });

    return request(app.getHttpServer())
      .post('/uploads/original/signed-token')
      .attach('file', Buffer.from([1, 2, 3]), {
        filename: 'concert.mp4',
        contentType: 'video/mp4',
      })
      .expect(200)
      .expect({
        requestId: 'request-id',
        clipId: 'clip-id',
        status: 'fulfilled',
        mediaAsset: {
          id: 'asset-id',
          type: 'fan_original',
          mimeType: 'video/mp4',
          byteSize: 3,
          storedAt: '2026-07-30T17:00:00.000Z',
        },
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
