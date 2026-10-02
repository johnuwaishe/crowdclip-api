import { Module } from '@nestjs/common';
import { environmentConfig } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [environmentConfig(), DatabaseModule, WorkersModule],
})
export class WorkerModule {}
