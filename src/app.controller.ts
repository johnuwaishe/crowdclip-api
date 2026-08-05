import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, HealthResponse } from './app.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check API and database health' })
  @ApiOkResponse({
    schema: {
      example: { status: 'ok', database: 'up' },
    },
  })
  healthCheck(): Promise<HealthResponse> {
    return this.appService.getHealth();
  }
}
