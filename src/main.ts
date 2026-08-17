import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  apiPublicUrl,
  crossSiteCookiesUnavailable,
  instagramCallbackUrl,
  webAppUrl,
} from './config/public-urls';
import { setupOpenApi, SWAGGER_UI_PATH } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const publicUrl = apiPublicUrl();
  const webApp = webAppUrl();
  app.enableCors({
    origin: webApp ? [webApp, publicUrl] : true,
    credentials: true,
  });
  app.enableShutdownHooks();
  setupOpenApi(app);

  const port = Number(process.env.PORT ?? 3000);

  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger docs on http://localhost:${port}/${SWAGGER_UI_PATH}`);
  console.log(`Public API origin ${publicUrl}`);
  console.log(`Instagram OAuth callback ${instagramCallbackUrl()}`);
  if (crossSiteCookiesUnavailable()) {
    console.warn(
      `The web app (${webApp ?? 'unset'}) and the API (${publicUrl}) are on ` +
        'different sites, but the API is not served over HTTPS. Browsers will ' +
        'refuse to send the CrowdClip session cookie on requests from the web ' +
        'app. Point CROWDCLIP_API_PUBLIC_URL at the HTTPS tunnel.',
    );
  }

  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start API', error);
  process.exitCode = 1;
});
