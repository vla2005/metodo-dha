# Backend Node.js — arquitetura recomendada

## Objetivo

O backend é responsável por criar sessões públicas sem login, registrar nome e e-mail de contato, consentimentos, progresso da jornada, sorteio das cartas, persistência, controle de acesso, chamadas Gemini, cota diária, relatórios e auditoria.

O frontend criado no Lovable nunca deve ser a fonte de verdade para regras de negócio.

## Stack

- Node.js LTS;
- NestJS;
- TypeScript em modo estrito;
- PostgreSQL;
- Prisma;
- class-validator/class-transformer ou validação equivalente nos DTOs;
- Swagger/OpenAPI;
- Jest para testes;
- Docker.

Não fixe números de versão na skill. Use versões estáveis e compatíveis com o repositório.

## Módulos

### AcessosModule

- criação de sessão pública sem conta e sem senha;
- emissão de token opaco;
- cookie `httpOnly`;
- expiração e revogação;
- retomada no mesmo navegador;
- link seguro temporário por e-mail, caso seja implementado;
- autenticação separada para área profissional ou administrativa.

### ParticipantesModule

- nome e e-mail de contato vinculados à jornada;
- normalização do e-mail;
- atualização controlada dos dados de contato;
- nenhuma suposição de que um e-mail represente uma conta.

### ConsentimentosModule

- documento vigente;
- versionamento;
- aceite com data, versão e contexto mínimo necessário;
- bloqueio de jornada sem consentimento válido.

### CartasModule

- cadastro e ativação de palavras e imagens;
- descrição objetiva das imagens;
- sorteio aleatório;
- exclusão das cartas já usadas quando a configuração impedir repetição;
- nenhuma exposição das cartas não escolhidas.

### JornadasModule

- criação;
- estado atual;
- transições;
- cinco conjuntos;
- impressão inicial opcional;
- retomada segura.

### IaModule

- porta `ProvedorIa`;
- adaptador Gemini;
- prompts versionados;
- schemas de saída;
- idempotência;
- cota;
- métricas e erros.

### AyaModule

- rodadas limitadas;
- histórico autorizado;
- limite por jornada;
- geração assíncrona opcional no futuro.

### RelatoriosModule

- versão gerada;
- revisão profissional;
- status de liberação;
- exportação sem nova chamada à IA.

### AuditoriaModule

- acesso a jornada;
- alterações de consentimento;
- sorteios;
- geração e liberação de relatório;
- ações profissionais e administrativas.

## Acesso da pessoa participante sem login

A pessoa participante não possui conta, senha, access token JWT ou refresh token.

No início da análise:

1. recebe nome, e-mail e aceite do consentimento;
2. cria uma jornada com identificador público não sequencial;
3. gera um token aleatório de alta entropia;
4. armazena apenas o hash do token no banco;
5. envia o token em cookie `httpOnly`, `secure` em produção e com `sameSite` adequado;
6. vincula a sessão à jornada e define expiração;
7. valida o token em todas as rotas públicas da jornada.

Regras obrigatórias:

- e-mail não autoriza acesso por si só;
- nome e e-mail não substituem token de sessão;
- não permitir consulta de jornada apenas por e-mail;
- não retornar tokens em logs ou erros;
- não armazenar token em texto puro;
- não armazenar dados pessoais ou token em `localStorage` na aplicação real;
- limitar tentativas e criar proteção contra enumeração de jornadas;
- revogar ou rotacionar token ao usar link de retomada;
- expirar sessões abandonadas conforme política de retenção.

### Área profissional e administrativa

Se houver painel da psicóloga ou administração, ele deve possuir autenticação própria e independente do fluxo da pessoa participante.

Pode usar JWT ou sessão segura, mas nunca torne as rotas profissionais públicas. Papéis sugeridos:

- `PROFISSIONAL`;
- `ADMIN`.

## Validação

- rejeitar propriedades desconhecidas quando possível;
- limitar tamanho de nome, e-mail, relato e respostas;
- normalizar e validar e-mail;
- normalizar enums e estados;
- validar UUIDs e IDs públicos;
- validar MIME type e tamanho de arquivos;
- não confiar em `journeyId`, etapa, papel ou token enviados sem verificação;
- aplicar validação também nas respostas do Gemini.

## Sorteio seguro

A retirada deve ocorrer em transação.

Pseudofluxo:

1. validar a sessão pública e sua associação com a jornada;
2. buscar jornada com lock lógico ou estratégia concorrente equivalente;
3. verificar estado;
4. verificar se a carta da etapa já existe;
5. se existir, retornar a carta salva;
6. listar IDs elegíveis;
7. sortear no backend usando fonte aleatória adequada;
8. inserir a seleção com restrição única;
9. em conflito concorrente, buscar e retornar o registro vencedor;
10. avançar estado somente quando válido.

Restrições úteis:

- `UNIQUE(journeyId, stepNumber)` em `JourneySet`;
- uma palavra e uma imagem por conjunto;
- nenhuma alteração da carta após preenchimento;
- controle de repetição por consulta e restrição de aplicação.

## Arquivos

Para imagens das cartas e áudio futuro:

- armazenar objeto em S3 ou compatível;
- salvar somente chave, MIME, tamanho, hash e metadados mínimos no PostgreSQL;
- usar URLs assinadas quando necessário;
- impedir listagem pública do bucket;
- não enviar URL privada ao frontend sem autorização;
- não enviar áudio ao Gemini automaticamente sem consentimento e decisão de produto.

## Observabilidade

Registrar sem conteúdo sensível:

- rota;
- status;
- duração;
- ID de correlação;
- tipo de operação de IA;
- modelo;
- tokens;
- erro categorizado;
- quota consumida.

Não registrar nome, e-mail, relato, respostas, relatório, prompt completo, cookie, token ou chave.

## Filas

Não adicione Redis/BullMQ inicialmente.

Adicionar fila somente quando:

- tempo de resposta da IA prejudicar a API;
- houver múltiplas instâncias;
- for necessário retry persistente;
- relatórios forem processados em segundo plano.

Mesmo com fila, preserve idempotência e cota antes de executar o job.
