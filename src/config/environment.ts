import { ConfigModule } from '@nestjs/config';

// Shared by the API and worker entrypoints so both processes always read the
// same environment files in the same order.
export function environmentConfig() {
  return ConfigModule.forRoot({
    envFilePath: ['.env.local', '.env'],
    isGlobal: true,
  });
}
