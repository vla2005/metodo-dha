import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { CatalogImage, CatalogTheme, CatalogWord } from './catalog.types';

const wordsSchema = z.object({
  versao: z.string().min(1).max(40),
  palavras: z.array(z.object({ id: z.string().regex(/^palavra-\d{3}$/), texto: z.string().min(1).max(80) }).strict()).length(164)
}).strict();
const themesSchema = z.object({
  versao: z.string().min(1).max(40),
  temas: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/).max(80), nome: z.string().min(1).max(80), descricao: z.string().min(1).max(300),
    ativo: z.boolean(), ordem: z.number().int().positive()
  }).strict()).min(1)
}).strict();
const imagesSchema = z.object({
  versao: z.string().min(1).max(40),
  imagens: z.array(z.object({
    id: z.string().regex(/^imagem-\d{3}$/),
    arquivo: z.string().regex(/^(?:[1-9]|[1-9]\d|1[0-5]\d|16[0-4])\.webp$/),
    descricao_imagem: z.string().min(10).max(1000),
    texto_alternativo: z.string().min(5).max(500),
    mime_type: z.literal('image/webp'),
    hash_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    ativo: z.boolean(), ordem: z.number().int().min(1).max(164)
  }).strict()).length(164)
}).strict();

@Injectable()
export class CatalogService implements OnModuleInit {
  private words: readonly CatalogWord[] = [];
  private themes: readonly CatalogTheme[] = [];
  private images: readonly CatalogImage[] = [];
  private catalogVersion = '';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const catalogDirectory = resolve(this.config.get<string>('CATALOG_DIR', 'catalog'));
    const [wordsRaw, themesRaw, imagesRaw] = await Promise.all([
      readFile(resolve(catalogDirectory, 'palavras.json'), 'utf8'),
      readFile(resolve(catalogDirectory, 'temas.json'), 'utf8'),
      readFile(resolve(catalogDirectory, 'imagens.json'), 'utf8')
    ]);
    const wordsCatalog = wordsSchema.parse(JSON.parse(wordsRaw));
    const themesCatalog = themesSchema.parse(JSON.parse(themesRaw));
    const imagesCatalog = imagesSchema.parse(JSON.parse(imagesRaw));
    if (new Set([wordsCatalog.versao, themesCatalog.versao, imagesCatalog.versao]).size !== 1) throw new Error('As versões dos catálogos JSON não coincidem.');
    this.assertUnique(wordsCatalog.palavras, (item) => item.id, 'IDs de palavras');
    this.assertUnique(wordsCatalog.palavras, (item) => item.texto.normalize('NFC').toLocaleLowerCase('pt-BR'), 'palavras');
    this.assertUnique(themesCatalog.temas, (item) => item.id, 'IDs de temas');
    this.assertUnique(themesCatalog.temas, (item) => String(item.ordem), 'ordens de temas');
    this.assertUnique(imagesCatalog.imagens, (item) => item.id, 'IDs de imagens');
    this.assertUnique(imagesCatalog.imagens, (item) => item.arquivo, 'arquivos de imagens');
    wordsCatalog.palavras.forEach((word, index) => {
      const expectedId = `palavra-${String(index + 1).padStart(3, '0')}`;
      if (word.id !== expectedId) throw new Error(`Sequência inválida no catálogo de palavras: esperado ${expectedId}.`);
    });
    imagesCatalog.imagens.forEach((image, index) => {
      const number = index + 1;
      const expectedId = `imagem-${String(number).padStart(3, '0')}`;
      if (image.id !== expectedId || image.arquivo !== `${number}.webp` || image.ordem !== number) {
        throw new Error(`Sequência inválida no catálogo de imagens: esperado ${expectedId}.`);
      }
    });
    this.words = Object.freeze(wordsCatalog.palavras);
    this.themes = Object.freeze(themesCatalog.temas);
    this.images = Object.freeze(imagesCatalog.imagens);
    this.catalogVersion = wordsCatalog.versao;
    await this.validateImageFiles();
  }

  get version(): string { return this.catalogVersion; }
  listThemes(): readonly CatalogTheme[] { return this.themes.filter((theme) => theme.ativo).sort((a, b) => a.ordem - b.ordem); }
  getTheme(id: string): CatalogTheme | undefined { return this.themes.find((theme) => theme.ativo && theme.id === id); }
  getWord(id: string | null): CatalogWord | undefined { return id ? this.words.find((word) => word.id === id) : undefined; }
  getImage(id: string | null): CatalogImage | undefined { return id ? this.images.find((image) => image.id === id) : undefined; }
  availableWords(usedIds: readonly string[]): readonly CatalogWord[] { const used = new Set(usedIds); return this.words.filter((word) => !used.has(word.id)); }
  availableImages(usedIds: readonly string[]): readonly CatalogImage[] { const used = new Set(usedIds); return this.images.filter((image) => image.ativo && !used.has(image.id)); }
  counts(): { words: number; images: number; themes: number } { return { words: this.words.length, images: this.images.filter((image) => image.ativo).length, themes: this.themes.filter((theme) => theme.ativo).length }; }

  async readImage(id: string): Promise<{ content: Buffer; contentType: string }> {
    const image = this.getImage(id);
    if (!image) throw new Error('IMAGE_NOT_IN_CATALOG');
    const content = await this.readValidatedImage(image);
    return { content, contentType: image.mime_type };
  }

  private async validateImageFiles(): Promise<void> {
    await Promise.all(this.images.filter((image) => image.ativo).map((image) => this.readValidatedImage(image).then(() => undefined)));
  }

  private async readValidatedImage(image: CatalogImage): Promise<Buffer> {
    if (basename(image.arquivo) !== image.arquivo) throw new Error('Chave de arquivo inválida no catálogo.');
    const root = await realpath(resolve(this.config.get<string>('CARD_IMAGES_DIR', '../imagens')));
    const file = await realpath(resolve(root, image.arquivo));
    const relativePath = relative(root, file);
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('Arquivo de imagem fora do diretório autorizado.');
    const content = await readFile(file);
    const actualHash = createHash('sha256').update(content).digest('hex');
    if (actualHash !== image.hash_sha256) throw new Error(`Falha de integridade no arquivo ${image.arquivo}.`);
    return content;
  }

  private assertUnique<T>(items: readonly T[], key: (item: T) => string, label: string): void {
    if (new Set(items.map(key)).size !== items.length) throw new Error(`Catálogo contém duplicidade em ${label}.`);
  }
}
