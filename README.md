# Método DHA — MVP

Plataforma de jornada reflexiva do Método DHA, com frontend React, API NestJS e PostgreSQL. O participante entra sem conta ou senha; sua sessão é mantida por cookie seguro.

O fluxo atual é: identificação e consentimentos → tema e relato → cinco conjuntos de palavra/imagem → cinco perguntas reflexivas → respostas → análise final estruturada.

## Rodar tudo com Docker

Com o Docker Desktop aberto, execute na raiz:

```powershell
docker compose -f docker-compose.local.yml up --build
```

Isso inicia PostgreSQL, backend e frontend de uma só vez. O backend cria o schema SQL automaticamente na primeira inicialização; não há ORM, geração de cliente ou comando de migration.

Sem `GEMINI_API_KEY`, perguntas e análise usam o modo local de demonstração. Para usar o Gemini:

```powershell
Copy-Item backend/.env.example backend/.env
# preencha GEMINI_API_KEY em backend/.env
docker compose -f docker-compose.local.yml up --build -d
```

Acesse:

- aplicação: `http://localhost:8080`;
- Swagger: `http://localhost:8080/api/docs`;
- health: `http://localhost:8080/api/health`.

Para parar preservando o banco:

```powershell
docker compose -f docker-compose.local.yml down
```

Para apagar definitivamente as jornadas locais e começar com um banco vazio:

```powershell
docker compose -f docker-compose.local.yml down -v
```

## Banco de dados sem ORM

O backend usa apenas o driver PostgreSQL `pg` e consultas SQL parametrizadas. O schema completo está em `backend/sql/schema.sql`.

Na inicialização, com `DATABASE_AUTO_SCHEMA=true`, a API:

1. testa a conexão;
2. verifica se a tabela `Journey` existe;
3. se o banco estiver vazio, executa `backend/sql/schema.sql` uma única vez;
4. inicia normalmente nas próximas execuções sem recriar dados.

Portanto, não existe etapa de geração de cliente nem comando separado de deploy do banco. O usuário informado em `DATABASE_URL` ainda precisa ter permissão para conectar, criar tabelas, índices, tipos, funções e triggers na primeira execução.

Se o provedor não permitir criação automática de tabelas, importe uma vez o arquivo `backend/sql/schema.sql` em uma ferramenta compatível com PostgreSQL e configure `DATABASE_AUTO_SCHEMA=false`.

> O phpMyAdmin é para MySQL/MariaDB. Para este projeto PostgreSQL, use o gerenciador PostgreSQL do cPanel, phpPgAdmin, Adminer com driver PostgreSQL ou o terminal `psql`.

## Estrutura

- `frontend/`: React, TypeScript, Tailwind e Vite;
- `backend/`: NestJS, driver `pg`, Swagger e integração Gemini;
- `backend/sql/schema.sql`: estrutura transacional do PostgreSQL;
- `backend/catalog/`: temas, 164 palavras e 164 descrições de imagens em JSON;
- `imagens/`: arquivos privados das cartas visuais;
- `docker-compose.yml`: ambiente local completo.

Os catálogos não são gravados no banco. O PostgreSQL guarda apenas dados transacionais: jornadas, contato, consentimentos, sessão, cartas já sorteadas, perguntas, respostas, análises, auditoria e cotas da IA.

## Desenvolvimento local

Requisitos: Node.js 22+, npm e PostgreSQL 16+.

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
docker compose -f docker-compose.local.yml up -d postgres
npm run dev:backend
```

Em outro terminal:

```powershell
npm run dev:frontend
```

A API aplica o schema automaticamente ao iniciar. Não é necessário executar seed, pois os catálogos vêm dos arquivos JSON.

## Deploy recomendado no Coolify

O arquivo principal `docker-compose.yml` é a configuração de produção para o Coolify. Ele publica somente o frontend na porta interna 80; backend e PostgreSQL permanecem acessíveis apenas pela rede privada do stack. O frontend encaminha `/api` para o backend, portanto um único domínio atende todo o sistema.

1. Envie o repositório, incluindo `imagens/`, para um repositório Git privado.
2. No Coolify, crie um recurso a partir do repositório e selecione o build pack **Docker Compose**.
3. Use `Base Directory: /` e `Docker Compose Location: /docker-compose.yml`.
4. Configure no serviço `frontend` o domínio `https://metodo-dha.viktorware.com` apontando para a porta `80`.
5. Não associe domínio aos serviços `backend` ou `postgres`.
6. Na tela de variáveis, informe `APP_URL` e `GEMINI_API_KEY`. O Coolify pode gerar automaticamente `SERVICE_PASSWORD_POSTGRES`.
7. Faça o deploy e valide `https://metodo-dha.viktorware.com/api/health`.

As variáveis aceitas estão documentadas em `.env.coolify.example`. A chave Gemini e a senha do banco são apenas de runtime e nunca devem ser marcadas como variáveis de build ou incluídas no repositório.

O volume nomeado `dha_postgres` preserva o banco entre deploys. Configure também um backup agendado do PostgreSQL para um destino externo compatível com S3 antes de usar dados reais.

## Deploy simples no cPanel

No backend, configure uma aplicação Node.js 22 apontando para a pasta `backend`, com arquivo de inicialização `dist/main.js`.

Antes de enviar ou iniciar:

```powershell
npm install
npm run build -w backend
```

Envie ao servidor pelo menos:

- `backend/dist/`;
- `backend/catalog/`;
- `backend/sql/`;
- `backend/package.json`;
- `package-lock.json`;
- a pasta privada `imagens/` fora de `public_html`.

No cPanel, instale as dependências de produção da aplicação Node e configure as variáveis do `.env`. Na primeira inicialização, o backend cria as tabelas automaticamente.

Exemplo de banco no cPanel:

```dotenv
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/BANCO
DATABASE_POOL_MAX=5
DATABASE_AUTO_SCHEMA=true
DATABASE_SCHEMA_PATH=/home/SEU_USUARIO/api.metodo-dha.seudominio.com/backend/sql/schema.sql
```

Use exatamente host, porta, banco e usuário fornecidos pelo cPanel. Associar o usuário ao banco e conceder todas as permissões continua obrigatório.

## Variáveis principais do backend

- `DATABASE_URL`: conexão PostgreSQL;
- `DATABASE_POOL_MAX`: limite do pool de conexões;
- `DATABASE_AUTO_SCHEMA`: cria o schema automaticamente quando o banco está vazio;
- `DATABASE_SCHEMA_PATH`: caminho absoluto ou relativo para `schema.sql`;
- `CATALOG_DIR`: pasta dos catálogos JSON;
- `CARD_IMAGES_DIR`: pasta privada com `1.webp` a `164.webp`;
- `FRONTEND_ORIGINS`: origens permitidas, separadas por vírgula;
- `PUBLIC_SESSION_COOKIE_*`: configuração do cookie de sessão;
- `AI_PROVIDER=auto|gemini|demo`;
- `GEMINI_API_KEY`: somente no backend;
- `GEMINI_MODEL`, limites, timeout e versões dos prompts.

Em produção com HTTPS, mantenha `PUBLIC_SESSION_COOKIE_SECURE=true`.

## Validação

```powershell
npm run lint
npm test
npm run build
```

As operações críticas permanecem transacionais e idempotentes. O sorteio é feito apenas no backend; cartas fechadas não são enviadas ao navegador; tokens de sessão são persistidos somente como hash; e as consultas usam parâmetros, sem concatenar entrada do participante no SQL.

Antes de produção ainda são necessárias revisão profissional dos textos e descrições visuais, definição formal de retenção/exclusão para LGPD, storage privado das imagens e testes de integração/carga no ambiente de hospedagem.
