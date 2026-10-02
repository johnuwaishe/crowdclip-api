import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Worker poll timers are unref()'d so they never hold a process open on
  // their own. The API is kept alive by its HTTP server; this process has
  // none, so it holds one referenced handle until shutdown begins.
  const keepAlive = setInterval(() => undefined, 60 * 60 * 1_000);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => clearInterval(keepAlive));
  }

  // On SIGTERM/SIGINT, Nest runs each worker's onApplicationShutdown, which
  // waits for the in-flight job before the process exits.
  app.enableShutdownHooks();
  new Logger('Worker').log('Background worker process started');
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start worker', error);
  process.exitCode = 1;
});
