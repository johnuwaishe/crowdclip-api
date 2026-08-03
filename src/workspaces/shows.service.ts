import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShowsRepository } from './shows.repository';
import { ShowWithCatalogueRow } from './types/show-row.type';
import { WorkspaceSession } from './workspace-session.service';

export interface ShowRequestBody {
  instagramAccountId?: unknown;
  name?: unknown;
  startsAt?: unknown;
  venueName?: unknown;
  city?: unknown;
}

@Injectable()
export class ShowsService {
  constructor(private readonly showsRepository: ShowsRepository) {}

  async create(session: WorkspaceSession, body: ShowRequestBody) {
    const show = await this.showsRepository.create({
      workspaceId: session.workspaceId,
      instagramAccountId: this.requiredUuid(
        body.instagramAccountId,
        'instagramAccountId',
      ),
      name: this.requiredText(body.name, 'name', 200),
      startsAt: this.optionalDate(body.startsAt),
      venueName: this.optionalText(body.venueName, 'venueName', 200),
      city: this.optionalText(body.city, 'city', 200),
    });
    if (!show) {
      throw new NotFoundException('Connected Instagram account not found');
    }
    return this.toView(show);
  }

  async list(session: WorkspaceSession) {
    const shows = await this.showsRepository.list(session.workspaceId);
    return { shows: shows.map((show) => this.toView(show)) };
  }

  async get(session: WorkspaceSession, id: string) {
    return this.toView(await this.requiredShow(session, id));
  }

  async update(session: WorkspaceSession, id: string, body: ShowRequestBody) {
    const current = await this.requiredShow(session, id);
    const show = await this.showsRepository.update({
      id,
      workspaceId: session.workspaceId,
      name: this.requiredText(body.name, 'name', 200),
      startsAt: this.optionalDate(body.startsAt),
      venueName: this.optionalText(body.venueName, 'venueName', 200),
      city: this.optionalText(body.city, 'city', 200),
    });
    if (!show && current.status === 'ended') {
      throw new ConflictException('Ended shows cannot be edited');
    }
    if (!show) throw new NotFoundException('Show not found');
    return this.toView(show);
  }

  async activate(session: WorkspaceSession, id: string) {
    const show = await this.showsRepository.activate(id, session.workspaceId);
    if (!show) {
      const current = await this.showsRepository.findById(
        id,
        session.workspaceId,
      );
      if (current?.status === 'ended') {
        throw new ConflictException('Ended shows cannot be reactivated');
      }
      throw new NotFoundException('Show not found');
    }
    return this.toView(show);
  }

  async end(session: WorkspaceSession, id: string) {
    const show = await this.showsRepository.end(id, session.workspaceId);
    if (!show) throw new ConflictException('Show is already ended or missing');
    return this.toView(show);
  }

  private async requiredShow(session: WorkspaceSession, id: string) {
    const show = await this.showsRepository.findById(id, session.workspaceId);
    if (!show) throw new NotFoundException('Show not found');
    return show;
  }

  private toView(show: ShowWithCatalogueRow) {
    return {
      id: show.id,
      workspaceId: show.workspace_id,
      instagramAccountId: show.instagram_account_id,
      name: show.name,
      startsAt: show.starts_at,
      venueName: show.venue_name,
      city: show.city,
      status: show.status,
      endedAt: show.ended_at,
      catalogue: { id: show.catalogue_id, name: show.catalogue_name },
      createdAt: show.created_at,
      updatedAt: show.updated_at,
    };
  }

  private requiredUuid(value: unknown, name: string): string {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException(`${name} must be a UUID`);
    }
    return value;
  }

  private requiredText(value: unknown, name: string, maximum: number): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${name} is required`);
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum) {
      throw new BadRequestException(
        `${name} must contain 1-${maximum} characters`,
      );
    }
    return normalized;
  }

  private optionalText(
    value: unknown,
    name: string,
    maximum: number,
  ): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.requiredText(value, name, maximum);
  }

  private optionalDate(value: unknown): Date | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(
        'startsAt must be an ISO-8601 timestamp or null',
      );
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestException(
        'startsAt must be an ISO-8601 timestamp or null',
      );
    }
    return date;
  }
}
