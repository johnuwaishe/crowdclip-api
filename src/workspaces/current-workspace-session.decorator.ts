import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { WorkspaceSession } from './workspace-session.service';

export interface WorkspaceSessionRequest extends Request {
  crowdclipSession?: WorkspaceSession;
}

export const CurrentWorkspaceSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceSession => {
    const request = context
      .switchToHttp()
      .getRequest<WorkspaceSessionRequest>();
    if (!request.crowdclipSession) {
      throw new Error('Workspace session guard did not attach a session');
    }
    return request.crowdclipSession;
  },
);
