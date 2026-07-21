import { ConfigService } from '@nestjs/config';
import { JourneyStatus, Movement } from '../src/database/database.types';
import { CatalogService } from '../src/catalogo/catalog.service';
import { DatabaseService } from '../src/database/database.service';
import { JourneysService } from '../src/jornadas/journeys.service';

const catalog = { version: 'dha-2026-v1' } as CatalogService;

describe('avanÃ§o atÃ´mico da jornada', () => {
  it('usa compare-and-set no passo atual para nÃ£o pular etapa em chamadas concorrentes', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValue({
      publicId: 'jrn_public',
      status: JourneyStatus.EM_TIRAGEM,
      currentStep: 2,
    });
    const database = {
      journey: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'journey-id',
          publicId: 'jrn_public',
          status: JourneyStatus.EM_TIRAGEM,
          currentStep: 1,
          catalogVersion: 'dha-2026-v1',
          themeKey: 'relacionamentos',
          customTheme: null,
          circumstanceText: 'Contexto da jornada',
          sets: [{
            id: 'set-id',
            journeyId: 'journey-id',
            position: 1,
            movement: Movement.CIRCUNSTANCIA_PERCEBIDA,
            wordKey: 'palavra-001',
            imageKey: 'imagem-001',
            initialImpression: null,
            wordDrawnAt: new Date(),
            imageDrawnAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          }],
        }),
        updateMany,
        findUnique,
      },
    } as unknown as DatabaseService;
    const service = new JourneysService(database, new ConfigService(), catalog);

    await expect(service.advance('jrn_public', 'journey-id')).resolves.toEqual({
      publicId: 'jrn_public',
      status: JourneyStatus.EM_TIRAGEM,
      currentStep: 2,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'journey-id', status: JourneyStatus.EM_TIRAGEM, currentStep: 1 },
      data: { currentStep: 2 },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'journey-id' },
      select: { publicId: true, status: true, currentStep: true },
    });
  });

  it.each([JourneyStatus.PAUSADA, JourneyStatus.CANCELADA, JourneyStatus.EXPIRADA])(
    'bloqueia avanÃ§o quando o status Ã© %s',
    async (status) => {
      const updateMany = jest.fn();
      const database = {
        journey: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'journey-id',
            publicId: 'jrn_public',
            status,
            currentStep: 1,
            catalogVersion: 'dha-2026-v1',
            themeKey: 'relacionamentos',
            customTheme: null,
            circumstanceText: 'Contexto da jornada',
            sets: [],
          }),
          updateMany,
        },
      } as unknown as DatabaseService;
      const service = new JourneysService(database, new ConfigService(), catalog);

      await expect(service.advance('jrn_public', 'journey-id')).rejects.toMatchObject({
        code: 'INVALID_JOURNEY_STATE',
      });
      expect(updateMany).not.toHaveBeenCalled();
    },
  );
});


