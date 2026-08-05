import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const OPENAPI_DOCUMENT_PATH = 'docs-json';
export const SWAGGER_UI_PATH = 'docs';

export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('CrowdClip API')
    .setDescription(
      'API for connecting artist Instagram accounts, collecting fan clips, uploading reference tracks, and building show timelines.',
    )
    .setVersion('0.0.1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Verified Supabase access token.',
      },
      'supabase',
    )
    .addCookieAuth(
      'crowdclip_session',
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Provisional workspace session issued after Instagram OAuth.',
      },
      'crowdclip-session',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(SWAGGER_UI_PATH, app, document, {
    jsonDocumentUrl: OPENAPI_DOCUMENT_PATH,
    customSiteTitle: 'CrowdClip API Docs',
    swaggerOptions: {
      displayRequestDuration: true,
      persistAuthorization: true,
    },
  });
}
