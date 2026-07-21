import { ConfigService } from '@nestjs/config';
import { JourneyStatus, Movement } from '../src/database/database.types';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CatalogService } from '../src/catalogo/catalog.service';
import type { CatalogImage } from '../src/catalogo/catalog.types';
import { DatabaseService } from '../src/database/database.service';
import { JourneysService } from '../src/jornadas/journeys.service';

const catalogImage: CatalogImage = {
  id: 'imagem-001',
  arquivo: '1.webp',
  descricao_imagem: 'Uma mÃ£o segura um espelho oval diante de um fundo verde.',
  texto_alternativo: 'MÃ£o segurando espelho oval sobre fundo verde.',
  mime_type: 'image/webp',
  hash_sha256: 'a'.repeat(64),
  ativo: true,
  ordem: 1,
};

const createCatalogMock = () => {
  const getTheme = jest.fn().mockImplementation((key: string) =>
    key === 'relacionamentos'
      ? {
          id: 'relacionamentos',
          nome: 'Relacionamentos',
          descricao: 'RelaÃ§Ãµes afetivas, familiares ou sociais.',
          ativo: true,
          ordem: 1,
        }
      : undefined,
  );
  const getWord = jest.fn().mockImplementation((key: string) =>
    key === 'palavra-001' ? { id: 'palavra-001', texto: 'Aceitar' } : undefined,
  );
  const getImage = jest.fn().mockImplementation((key: string) =>
    key === catalogImage.id ? catalogImage : undefined,
  );
  const readImage = jest.fn();
  const service = { version: 'dha-2026-v1', getTheme, getWord, getImage, readImage } as unknown as CatalogService;
  return { service, getTheme, getWord, getImage, readImage };
};

describe('contrato pÃºblico das imagens reveladas', () => {
  it('resolve cartas pelo catÃ¡logo sem expor arquivo, hash, IDs internos ou chaves das cartas', async () => {
    const database = {
      journey: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'internal-journey-id',
          publicId: 'jrn_public',
          status: JourneyStatus.EM_TIRAGEM,
          currentStep: 1,
          catalogVersion: 'dha-2026-v1',
          themeKey: 'relacionamentos',
          customTheme: null,
          circumstanceText: 'Relato autorizado',
          sets: [{
            id: 'internal-set-id',
            journeyId: 'internal-journey-id',
            position: 1,
            movement: Movement.CIRCUNSTANCIA_PERCEBIDA,
            initialImpression: null,
            wordKey: 'palavra-001',
            imageKey: 'imagem-001',
            wordDrawnAt: new Date('2026-07-18T12:00:00.000Z'),
            imageDrawnAt: new Date('2026-07-18T12:01:00.000Z'),
          }],
        }),
      },
    } as unknown as DatabaseService;
    const catalog = createCatalogMock();
    const service = new JourneysService(database, new ConfigService(), catalog.service);

    const result = await service.get('jrn_public', 'internal-journey-id');
    const serialized = JSON.stringify(result);

    expect(result.theme).toEqual({ id: 'relacionamentos', name: 'Relacionamentos' });
    expect(result.sets[0].wordCard).toEqual({ word: 'Aceitar' });
    expect(result.sets[0].imageCard).toEqual({
      url: '/journeys/jrn_public/sets/1/image',
      objectiveDescription: catalogImage.descricao_imagem,
      alternativeText: catalogImage.texto_alternativo,
      descriptionReviewed: false,
      descriptionSource: 'catalog_json_ai_draft',
    });
    expect(catalog.getTheme).toHaveBeenCalledWith('relacionamentos');
    expect(catalog.getWord).toHaveBeenCalledWith('palavra-001');
    expect(catalog.getImage).toHaveBeenCalledWith('imagem-001');
    expect(catalog.readImage).not.toHaveBeenCalled();

    for (const privateValue of [
      'arquivo',
      'hash_sha256',
      catalogImage.arquivo,
      catalogImage.hash_sha256,
      'themeKey',
      'wordKey',
      'imageKey',
      'palavra-001',
      'imagem-001',
      'internal-set-id',
      'internal-journey-id',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('entrega somente a imagem marcada como revelada na jornada autorizada', async () => {
    const imagesDirectory = resolve(__dirname, '../../imagens');
    const content = await readFile(resolve(imagesDirectory, '1.webp'));
    const findFirst = jest.fn().mockResolvedValue({
      imageKey: 'imagem-001',
      journey: { catalogVersion: 'dha-2026-v1' },
    });
    const database = { journeySet: { findFirst } } as unknown as DatabaseService;
    const catalog = createCatalogMock();
    catalog.readImage.mockResolvedValue({ content, contentType: 'image/webp' });
    const service = new JourneysService(database, new ConfigService(), catalog.service);

    const result = await service.getRevealedImage('jrn_public', 'internal-journey-id', 1);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        position: 1,
        imageKey: { not: null },
        imageDrawnAt: { not: null },
        journey: { publicId: 'jrn_public', id: 'internal-journey-id' },
      },
      select: { imageKey: true, journey: { select: { catalogVersion: true } } },
    });
    expect(catalog.getImage).toHaveBeenCalledWith('imagem-001');
    expect(catalog.readImage).toHaveBeenCalledTimes(1);
    expect(catalog.readImage).toHaveBeenCalledWith('imagem-001');
    expect(result.contentType).toBe('image/webp');
    expect(result.content.equals(content)).toBe(true);
  });

  it('nÃ£o lÃª o arquivo quando a imagem nÃ£o foi revelada para a jornada', async () => {
    const database = {
      journeySet: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as DatabaseService;
    const catalog = createCatalogMock();
    const service = new JourneysService(database, new ConfigService(), catalog.service);

    await expect(
      service.getRevealedImage('jrn_public', 'internal-journey-id', 1),
    ).rejects.toMatchObject({ code: 'IMAGE_NOT_AVAILABLE' });
    expect(catalog.getImage).not.toHaveBeenCalled();
    expect(catalog.readImage).not.toHaveBeenCalled();
  });

  it('nÃ£o lÃª o arquivo quando a chave persistida nÃ£o existe no catÃ¡logo', async () => {
    const database = {
      journeySet: { findFirst: jest.fn().mockResolvedValue({ imageKey: 'imagem-999' }) },
    } as unknown as DatabaseService;
    const catalog = createCatalogMock();
    const service = new JourneysService(database, new ConfigService(), catalog.service);

    await expect(
      service.getRevealedImage('jrn_public', 'internal-journey-id', 1),
    ).rejects.toMatchObject({ code: 'IMAGE_NOT_AVAILABLE' });
    expect(catalog.getImage).toHaveBeenCalledWith('imagem-999');
    expect(catalog.readImage).not.toHaveBeenCalled();
  });
});


