import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DemoModule } from '../src/demo/demo.module';
import { DemoService } from '../src/demo/demo.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      isGlobal: true,
    }),
    DemoModule,
  ],
})
class DemoSeedModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DemoSeedModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(DemoService).seed();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.failed.length > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
