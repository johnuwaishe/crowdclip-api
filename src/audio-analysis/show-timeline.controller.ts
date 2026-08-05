import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentWorkspaceAccess } from '../workspaces/current-workspace-access.decorator';
import type { WorkspaceAccess } from '../workspaces/types/workspace-access.type';
import { WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { ShowTimelineService } from './show-timeline.service';
import { ShowClipAssignmentService } from './show-clip-assignment.service';

@ApiTags('Show timeline')
@ApiBearerAuth('supabase')
@ApiCookieAuth('crowdclip-session')
@Controller('shows/:showId')
@UseGuards(WorkspaceAccessGuard)
export class ShowTimelineController {
  constructor(
    private readonly timelineService: ShowTimelineService,
    private readonly assignmentService: ShowClipAssignmentService,
  ) {}

  @Get('timeline')
  @ApiOperation({ summary: 'Get song timelines and aligned fan clips' })
  @ApiParam({ name: 'showId', format: 'uuid' })
  get(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.timelineService.get(showId, session.workspaceId);
  }

  @Post('clips/:clipId')
  @ApiOperation({ summary: 'Assign a workspace-inbox clip to a show' })
  @ApiParam({ name: 'showId', format: 'uuid' })
  @ApiParam({ name: 'clipId', format: 'uuid' })
  assignClip(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
    @Param('clipId', new ParseUUIDPipe({ version: '4' })) clipId: string,
  ) {
    return this.assignmentService.assign(clipId, showId, session.workspaceId);
  }
}
