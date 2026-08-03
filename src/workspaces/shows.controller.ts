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
import { CurrentWorkspaceAccess } from './current-workspace-access.decorator';
import { ShowsService } from './shows.service';
import type { ShowRequestBody } from './shows.service';
import type { WorkspaceAccess } from './types/workspace-access.type';
import { WorkspaceAccessGuard } from './workspace-access.guard';

@Controller('shows')
@UseGuards(WorkspaceAccessGuard)
export class ShowsController {
  constructor(private readonly showsService: ShowsService) {}

  @Post()
  create(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Body() body: ShowRequestBody,
  ) {
    return this.showsService.create(session, body);
  }

  @Get()
  list(@CurrentWorkspaceAccess() session: WorkspaceAccess) {
    return this.showsService.list(session);
  }

  @Get(':showId')
  get(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.showsService.get(session, showId);
  }

  @Patch(':showId')
  update(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
    @Body() body: ShowRequestBody,
  ) {
    return this.showsService.update(session, showId, body);
  }

  @Post(':showId/activate')
  activate(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.showsService.activate(session, showId);
  }

  @Post(':showId/end')
  end(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.showsService.end(session, showId);
  }
}
