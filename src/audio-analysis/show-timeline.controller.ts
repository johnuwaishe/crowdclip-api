import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Post,
} from '@nestjs/common';
import { CurrentWorkspaceSession } from '../workspaces/current-workspace-session.decorator';
import type { WorkspaceSession } from '../workspaces/workspace-session.service';
import { WorkspaceSessionGuard } from '../workspaces/workspace-session.guard';
import { ShowTimelineService } from './show-timeline.service';
import { ShowClipAssignmentService } from './show-clip-assignment.service';

@Controller('shows/:showId')
@UseGuards(WorkspaceSessionGuard)
export class ShowTimelineController {
  constructor(
    private readonly timelineService: ShowTimelineService,
    private readonly assignmentService: ShowClipAssignmentService,
  ) {}

  @Get('timeline')
  get(
    @CurrentWorkspaceSession() session: WorkspaceSession,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
  ) {
    return this.timelineService.get(showId, session.workspaceId);
  }

  @Post('clips/:clipId')
  assignClip(
    @CurrentWorkspaceSession() session: WorkspaceSession,
    @Param('showId', new ParseUUIDPipe({ version: '4' })) showId: string,
    @Param('clipId', new ParseUUIDPipe({ version: '4' })) clipId: string,
  ) {
    return this.assignmentService.assign(clipId, showId, session.workspaceId);
  }
}
