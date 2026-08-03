import { BadRequestException, ConflictException } from '@nestjs/common';
import { ShowsRepository } from './shows.repository';
import { ShowsService } from './shows.service';
import { ShowWithCatalogueRow } from './types/show-row.type';

describe('ShowsService', () => {
  const workspaceId = '20000000-0000-4000-8000-000000000002';
  const accountId = '10000000-0000-4000-8000-000000000001';
  const showId = '30000000-0000-4000-8000-000000000003';
  const now = new Date('2026-08-03T10:00:00.000Z');
  const session = {
    instagramAccountId: accountId,
    workspaceId,
    expiresAt: new Date('2026-09-01T00:00:00.000Z'),
  };
  const show: ShowWithCatalogueRow = {
    id: showId,
    workspace_id: workspaceId,
    instagram_account_id: accountId,
    name: 'London night one',
    starts_at: new Date('2026-09-15T19:30:00.000Z'),
    venue_name: 'Roundhouse',
    city: 'London',
    status: 'draft',
    ended_at: null,
    catalogue_id: 'catalogue-id',
    catalogue_name: 'London night one reference songs',
    created_at: now,
    updated_at: now,
  };
  const create = jest.fn();
  const list = jest.fn();
  const findById = jest.fn();
  const update = jest.fn();
  const activate = jest.fn();
  const end = jest.fn();
  const repository = {
    create,
    list,
    findById,
    update,
    activate,
    end,
  } as unknown as ShowsRepository;

  beforeEach(() => jest.clearAllMocks());

  it('creates a dated show and its song catalogue under the connected account', async () => {
    create.mockResolvedValueOnce(show);
    const service = new ShowsService(repository);

    await expect(
      service.create(session, {
        instagramAccountId: accountId,
        name: ' London night one ',
        startsAt: '2026-09-15T19:30:00.000Z',
        venueName: ' Roundhouse ',
        city: ' London ',
      }),
    ).resolves.toMatchObject({
      id: showId,
      name: 'London night one',
      catalogue: { id: 'catalogue-id' },
    });
    expect(create).toHaveBeenCalledWith({
      workspaceId,
      instagramAccountId: accountId,
      name: 'London night one',
      startsAt: new Date('2026-09-15T19:30:00.000Z'),
      venueName: 'Roundhouse',
      city: 'London',
    });
  });

  it('creates an unscheduled show when date, time, and location are omitted', async () => {
    create.mockResolvedValueOnce({
      ...show,
      starts_at: null,
      venue_name: null,
      city: null,
    });
    const service = new ShowsService(repository);

    await expect(
      service.create(session, {
        instagramAccountId: accountId,
        name: 'Untitled live session',
      }),
    ).resolves.toMatchObject({
      startsAt: null,
      venueName: null,
      city: null,
    });
    expect(create).toHaveBeenCalledWith({
      workspaceId,
      instagramAccountId: accountId,
      name: 'Untitled live session',
      startsAt: null,
      venueName: null,
      city: null,
    });
  });

  it('rejects an invalid timestamp when one is supplied', async () => {
    const service = new ShowsService(repository);

    await expect(
      service.create(session, {
        instagramAccountId: accountId,
        name: 'London night one',
        startsAt: 'not-a-date',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not reactivate a show that has ended', async () => {
    activate.mockResolvedValueOnce(null);
    findById.mockResolvedValueOnce({
      ...show,
      status: 'ended',
      ended_at: now,
    });
    const service = new ShowsService(repository);

    await expect(service.activate(session, showId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
