import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.enableCors();

  const port = Number(process.env.PORT ?? 3000);

  console.log(`API running on http://localhost:${port}`);

  await app.listen(port);
}

bootstrap();
