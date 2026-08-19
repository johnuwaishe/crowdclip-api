import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CasinoDemoView } from './casino-demo';
import { DemoService } from './demo.service';

@ApiTags('Demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the public Baby Keem CA$INO timeline demo',
  })
  @ApiOkResponse({
    description:
      'A read-only reference timeline with attributed external performance sources. ' +
      'Reference and clip media are returned as short-lived signed URLs over private ' +
      'objects, or null when that media has not been stored.',
  })
  getDemo(): Promise<CasinoDemoView> {
    return this.demoService.getDemo();
  }
}
