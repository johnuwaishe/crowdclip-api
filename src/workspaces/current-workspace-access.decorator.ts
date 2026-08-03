import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { WorkspaceAccess } from './types/workspace-access.type';

export interface WorkspaceAccessRequest extends Request {
  crowdclipWorkspace?: WorkspaceAccess;
}

export const CurrentWorkspaceAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceAccess => {
    const request = context.switchToHttp().getRequest<WorkspaceAccessRequest>();
    if (!request.crowdclipWorkspace) {
      throw new Error('Workspace access was not attached to the request');
    }
    return request.crowdclipWorkspace;
  },
);
