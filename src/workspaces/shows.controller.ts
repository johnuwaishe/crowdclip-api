import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentWorkspaceSession } from './current-workspace-session.decorator';
import { ShowsService } from './shows.service';
import type { ShowRequestBody } from './shows.service';
import type { WorkspaceSession } from './workspace-session.service';
import { WorkspaceSessionGuard } from './workspace-session.guard';

@Controller('shows')
@UseGuards(WorkspaceSessionGuard)
export class ShowsController {
  constructor(private readonly showsService: ShowsService) {}

  @Post()
  create(
    @CurrentWorkspaceSession() session: WorkspaceSession,
    @Body() body: ShowRequestBody,
  ) {
    return this.showsService.create(session, body);
  }

  @Get()
  list(@CurrentWorkspaceSession() session: WorkspaceSession) {
    return this.showsService.list(session);
  }

  @Get(':showId')
  get(
    @CurrentWorkspaceSession() session: WorkspaceSession,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.showsService.get(session, showId);
  }

  @Patch(':showId')
  update(
    @CurrentWorkspaceSession() session: WorkspaceSession,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
    @Body() body: ShowRequestBody,
  ) {
    return this.showsService.update(session, showId, body);
  }

  @Post(':showId/activate')
  activate(
    @CurrentWorkspaceSession() session: WorkspaceSession,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.showsService.activate(session, showId);
  }

  @Post(':showId/end')
  end(
    @CurrentWorkspaceSession() session: WorkspaceSession,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.showsService.end(session, showId);
  }
}
