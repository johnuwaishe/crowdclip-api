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
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentWorkspaceAccess } from './current-workspace-access.decorator';
import { ShowsService } from './shows.service';
import type { ShowRequestBody } from './shows.service';
import type { WorkspaceAccess } from './types/workspace-access.type';
import { WorkspaceAccessGuard } from './workspace-access.guard';

@ApiTags('Shows')
@ApiBearerAuth('supabase')
@ApiCookieAuth('crowdclip-session')
@Controller('shows')
@UseGuards(WorkspaceAccessGuard)
export class ShowsController {
  constructor(private readonly showsService: ShowsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a show and its reference catalogue' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'instagramAccountId'],
      properties: {
        name: { type: 'string', maxLength: 200 },
        instagramAccountId: { type: 'string', format: 'uuid' },
        startsAt: { type: 'string', format: 'date-time', nullable: true },
        venueName: { type: 'string', maxLength: 200, nullable: true },
        city: { type: 'string', maxLength: 200, nullable: true },
      },
    },
  })
  create(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Body() body: ShowRequestBody,
  ) {
    return this.showsService.create(session, body);
  }

  @Get()
  @ApiOperation({ summary: 'List shows in the current workspace' })
  list(@CurrentWorkspaceAccess() session: WorkspaceAccess) {
    return this.showsService.list(session);
  }

  @Get(':showId')
  @ApiOperation({ summary: 'Get a show' })
  @ApiParam({ name: 'showId', format: 'uuid' })
  get(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.showsService.get(session, showId);
  }

  @Patch(':showId')
  @ApiOperation({ summary: 'Update a show' })
  @ApiParam({ name: 'showId', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', maxLength: 200 },
        startsAt: { type: 'string', format: 'date-time', nullable: true },
        venueName: { type: 'string', maxLength: 200, nullable: true },
        city: { type: 'string', maxLength: 200, nullable: true },
      },
    },
  })
  update(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
    @Body() body: ShowRequestBody,
  ) {
    return this.showsService.update(session, showId, body);
  }

  @Post(':showId/activate')
  @ApiOperation({
    summary: 'Activate a show and end the previously active show',
  })
  @ApiParam({ name: 'showId', format: 'uuid' })
  activate(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.showsService.activate(session, showId);
  }

  @Post(':showId/end')
  @ApiOperation({ summary: 'End an active show' })
  @ApiParam({ name: 'showId', format: 'uuid' })
  end(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.showsService.end(session, showId);
  }
}
