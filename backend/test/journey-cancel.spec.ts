import { ConfigService } from '@nestjs/config';
import { JourneyStatus } from '../src/database/database.types';
import { CatalogService } from '../src/catalogo/catalog.service';
import { DatabaseService } from '../src/database/database.service';
import { JourneysService } from '../src/jornadas/journeys.service';

const catalog = { version: 'dha-2026-v1' } as CatalogService;

describe('encerramento da jornada', () => {
  it('cancela a jornada, revoga suas sessÃµes e registra auditoria sem conteÃºdo sensÃ­vel', async () => {
    const tx = {
      journey: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'journey-id',
          status: JourneyStatus.EM_TIRAGEM,
          completedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      publicAccessSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const database = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => Promise.resolve(operation(tx))),
    } as unknown as DatabaseService;
    const service = new JourneysService(database, new ConfigService(), catalog);

    await expect(service.cancel('jrn_public', 'journey-id')).resolves.toEqual({
      status: JourneyStatus.CANCELADA,
    });

    expect(tx.journey.findFirst).toHaveBeenCalledWith({
      where: { publicId: 'jrn_public', id: 'journey-id' },
      select: { id: true, status: true, completedAt: true },
    });
    expect(tx.journey.update).toHaveBeenCalledWith({
      where: { id: 'journey-id' },
      data: {
        status: JourneyStatus.CANCELADA,
        completedAt: expect.any(Date) as Date,
      },
    });
    expect(tx.publicAccessSession.updateMany).toHaveBeenCalledWith({
      where: { journeyId: 'journey-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        journeyId: 'journey-id',
        action: 'JOURNEY_CANCELLED',
        entityType: 'Journey',
        entityId: 'self',
        metadata: { previousStatus: JourneyStatus.EM_TIRAGEM },
      },
    });
  });

  it('revoga a sessÃ£o sem duplicar atualizaÃ§Ã£o ou auditoria se jÃ¡ estiver cancelada', async () => {
    const tx = {
      journey: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'journey-id',
          status: JourneyStatus.CANCELADA,
          completedAt: new Date(),
        }),
        update: jest.fn(),
      },
      publicAccessSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const database = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => Promise.resolve(operation(tx))),
    } as unknown as DatabaseService;
    const service = new JourneysService(database, new ConfigService(), catalog);

    await expect(service.cancel('jrn_public', 'journey-id')).resolves.toEqual({
      status: JourneyStatus.CANCELADA,
    });
    expect(tx.journey.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.publicAccessSession.updateMany).toHaveBeenCalledTimes(1);
  });
});


