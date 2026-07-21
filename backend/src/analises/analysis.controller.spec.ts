import type { PublicRequest } from '../common/public-session.guard';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

describe('AnalysisController', () => {
  it('sempre encaminha o identificador pÃºblico junto da jornada autenticada', async () => {
    const generate = jest.fn().mockResolvedValue({ generationStatus: 'AVAILABLE' });
    const get = jest.fn().mockResolvedValue({ generationStatus: 'AVAILABLE' });
    const controller = new AnalysisController({ generate, get } as unknown as AnalysisService);
    const request = {
      publicSession: { id: 'session-id', journeyId: 'internal-journey-id' },
    } as unknown as PublicRequest;

    await expect(controller.generate('public-journey-id', request))
      .resolves.toEqual({ generationStatus: 'AVAILABLE' });
    await expect(controller.get('public-journey-id', request))
      .resolves.toEqual({ generationStatus: 'AVAILABLE' });
    expect(generate).toHaveBeenCalledWith('public-journey-id', 'internal-journey-id');
    expect(get).toHaveBeenCalledWith('public-journey-id', 'internal-journey-id');
  });
});


