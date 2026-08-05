import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupOpenApi, SWAGGER_UI_PATH } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.enableCors();
  app.enableShutdownHooks();
  setupOpenApi(app);

  const port = Number(process.env.PORT ?? 3000);

  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger docs on http://localhost:${port}/${SWAGGER_UI_PATH}`);

  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start API', error);
  process.exitCode = 1;
});
