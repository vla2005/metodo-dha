import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

type WordsCatalog = {
  versao: string;
  palavras: Array<{ id: string; texto: string }>;
};

type ThemesCatalog = {
  versao: string;
  temas: Array<{ id: string; nome: string; descricao: string; ativo: boolean; ordem: number }>;
};

type ImagesCatalog = {
  versao: string;
  imagens: Array<{
    id: string;
    arquivo: string;
    descricao_imagem: string;
    texto_alternativo: string;
    mime_type: string;
    hash_sha256: string;
    ativo: boolean;
    ordem: number;
  }>;
};

const catalogDirectory = resolve(__dirname, '../catalog');
const imagesDirectory = resolve(__dirname, '../../imagens');
const readCatalog = <T>(fileName: string): T =>
  JSON.parse(readFileSync(resolve(catalogDirectory, fileName), 'utf8')) as T;

describe('catÃ¡logos JSON definitivos do MÃ©todo DHA', () => {
  const wordsCatalog = readCatalog<WordsCatalog>('palavras.json');
  const themesCatalog = readCatalog<ThemesCatalog>('temas.json');
  const imagesCatalog = readCatalog<ImagesCatalog>('imagens.json');

  it('mantÃ©m a mesma versÃ£o nos trÃªs catÃ¡logos', () => {
    expect(wordsCatalog.versao).toBe('dha-2026-v1');
    expect(themesCatalog.versao).toBe(wordsCatalog.versao);
    expect(imagesCatalog.versao).toBe(wordsCatalog.versao);
  });

  it('contÃ©m as 164 palavras na ordem recebida, com IDs sequenciais e sem duplicatas', () => {
    const sequence = Array.from({ length: 164 }, (_, index) => index + 1);
    const normalizedWords = wordsCatalog.palavras.map(({ texto }) => texto.normalize('NFC').toLocaleLowerCase('pt-BR'));

    expect(wordsCatalog.palavras).toHaveLength(164);
    expect(wordsCatalog.palavras.map(({ id }) => id)).toEqual(
      sequence.map((number) => `palavra-${number.toString().padStart(3, '0')}`),
    );
    expect(new Set(wordsCatalog.palavras.map(({ id }) => id)).size).toBe(164);
    expect(new Set(normalizedWords).size).toBe(164);
    expect(wordsCatalog.palavras[0].texto).toBe('Aceitar');
    expect(wordsCatalog.palavras[163].texto).toBe('Violentar');
  });

  it('contÃ©m os temas ordenados, ativos e com conteÃºdo completo', () => {
    const themes = themesCatalog.temas;

    expect(themes).toHaveLength(5);
    expect(new Set(themes.map(({ id }) => id)).size).toBe(themes.length);
    expect(themes.map(({ ordem }) => ordem)).toEqual([1, 2, 3, 4, 5]);
    expect(themes.every(({ ativo }) => ativo)).toBe(true);
    expect(themes.every(({ nome, descricao }) => nome.trim().length > 0 && descricao.trim().length > 0)).toBe(true);
  });

  it('mantÃ©m 164 imagens com IDs, arquivos e ordens sequenciais', () => {
    const sequence = Array.from({ length: 164 }, (_, index) => index + 1);
    const images = imagesCatalog.imagens;

    expect(images).toHaveLength(164);
    expect(images.map(({ id }) => id)).toEqual(
      sequence.map((number) => `imagem-${number.toString().padStart(3, '0')}`),
    );
    expect(images.map(({ arquivo }) => arquivo)).toEqual(sequence.map((number) => `${number}.webp`));
    expect(images.map(({ ordem }) => ordem)).toEqual(sequence);
    expect(new Set(images.map(({ id }) => id)).size).toBe(164);
    expect(new Set(images.map(({ arquivo }) => arquivo)).size).toBe(164);
    expect(images.every(({ ativo, mime_type }) => ativo && mime_type === 'image/webp')).toBe(true);
  });

  it('possui descriÃ§Ãµes objetivas e textos alternativos preenchidos, sem marcadores pendentes', () => {
    const placeholder = /^(?:pendente(?: de revisÃ£o)?|placeholder|todo|revisar)[.!]?$/i;

    for (const image of imagesCatalog.imagens) {
      expect(image.descricao_imagem.trim().length).toBeGreaterThanOrEqual(10);
      expect(image.texto_alternativo.trim().length).toBeGreaterThanOrEqual(5);
      expect(image.descricao_imagem.trim()).not.toMatch(placeholder);
      expect(image.texto_alternativo.trim()).not.toMatch(placeholder);
    }
  });

  it('corresponde exatamente aos 164 arquivos WebP e confirma seus hashes SHA-256', () => {
    const files = readdirSync(imagesDirectory)
      .filter((name) => name.endsWith('.webp'))
      .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
    const catalogFiles = imagesCatalog.imagens.map(({ arquivo }) => arquivo);

    expect(files).toEqual(catalogFiles);
    for (const image of imagesCatalog.imagens) {
      const actualHash = createHash('sha256')
        .update(readFileSync(resolve(imagesDirectory, image.arquivo)))
        .digest('hex');
      expect(image.hash_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(image.hash_sha256).toBe(actualHash);
    }
    expect(new Set(imagesCatalog.imagens.map(({ hash_sha256 }) => hash_sha256)).size).toBe(164);
  });
});


