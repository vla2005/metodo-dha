export interface CatalogWord {
  id: string;
  texto: string;
}

export interface CatalogTheme {
  id: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  ordem: number;
}

export interface CatalogImage {
  id: string;
  arquivo: string;
  descricao_imagem: string;
  texto_alternativo: string;
  mime_type: 'image/webp';
  hash_sha256: string;
  ativo: boolean;
  ordem: number;
}

