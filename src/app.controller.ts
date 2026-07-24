import { Controller, Get } from '@nestjs/common';
import { AppService, HealthResponse } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  healthCheck(): Promise<HealthResponse> {
    return this.appService.getHealth();
  }
}
