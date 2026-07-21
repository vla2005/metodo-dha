---
name: metodo-dha-plataforma
version: 3.0.0
description: Use esta skill ao projetar, implementar, revisar, testar ou documentar a plataforma web do Método DHA, incluindo frontend React, backend Node.js com NestJS, PostgreSQL com Prisma, acesso de participantes sem conta e sem login, sorteio seguro das cartas, integração com Gemini, controle de 500 RPD, AYA, relatórios, privacidade e limites de segurança.
---

# Plataforma do Método DHA

## Finalidade

Use esta skill em qualquer tarefa relacionada ao produto Método DHA.

O produto é uma plataforma de autoexploração simbólica guiada criada por uma psicóloga. A pessoa participante relata uma circunstância da vida, retira cinco conjuntos aleatórios formados por uma palavra e uma imagem, recebe perguntas reflexivas, responde a essas perguntas e, opcionalmente, aprofunda a experiência em uma conversa com a AYA antes de receber um relatório.

Não trate o método como:

- teste diagnóstico;
- medição científica da personalidade;
- previsão do futuro;
- leitura objetiva do subconsciente;
- fonte de verdades absolutas sobre a pessoa;
- substituto de psicoterapia, atendimento médico ou atendimento emergencial.

As palavras e imagens funcionam como estímulos projetivos e reflexivos. O sentido deve ser construído a partir do relato da pessoa, da etapa do percurso, da sequência completa e das respostas fornecidas.

## Stack oficial do projeto

Salvo decisão explícita no repositório, adote:

- frontend: React + TypeScript + Tailwind CSS, inicialmente prototipado no Lovable;
- backend: Node.js + TypeScript + NestJS;
- banco de dados: PostgreSQL;
- ORM e migrations: Prisma;
- documentação da API: OpenAPI/Swagger;
- acesso da pessoa participante: sem conta, senha ou login; sessão pública com token opaco em cookie `httpOnly`;
- área profissional/administrativa: autenticação própria e restrita somente se for implementada;
- armazenamento de arquivos: serviço compatível com S3, com implementação local ou MinIO apenas em desenvolvimento;
- IA: Gemini API por meio do SDK oficial `@google/genai`;
- modelo padrão: `gemini-3.1-flash-lite`;
- arquitetura: monólito modular;
- deploy: Docker;
- filas e Redis: somente quando houver necessidade comprovada.

Não introduza microserviços, Kafka, Redis ou filas no MVP sem justificativa concreta.

## Antes de modificar o projeto

Antes de alterar qualquer código:

1. Leia o README e os arquivos de configuração do repositório.
2. Identifique frontend, backend, dependências, variáveis de ambiente, migrations, rotas, modelos, testes e convenções existentes.
3. Verifique se o projeto já usa NestJS, Prisma, sessão pública, autenticação profissional ou outro padrão equivalente.
4. Reutilize a arquitetura existente em vez de criar uma estrutura paralela.
5. Leia todos os arquivos em `references/` relevantes à tarefa.
6. Consulte os schemas em `templates/` quando implementar saídas estruturadas da IA.
7. Registre suposições que alterem o comportamento do produto.
8. Prefira a menor mudança coerente que atenda ao pedido.
9. Nunca exponha a chave Gemini no frontend.
10. Nunca envie dados sensíveis para logs, ferramentas de analytics ou mensagens de erro públicas.

## Arquitetura do backend

Organize o NestJS como monólito modular. Estrutura sugerida:

```text
src/
├── acessos/
├── participantes/
├── profissionais/
├── consentimentos/
├── temas/
├── cartas/
├── jornadas/
├── perguntas/
├── respostas/
├── ia/
├── aya/
├── relatorios/
├── arquivos/
├── auditoria/
├── saude/
└── common/
```

O módulo `ia/` deve isolar o provedor externo. O domínio não deve importar diretamente o SDK Gemini.

Use uma porta de domínio semelhante a:

```ts
export interface ProvedorIa {
  gerarPerguntas(entrada: GerarPerguntasInput): Promise<PerguntasGeradas>;
  gerarAnalise(entrada: GerarAnaliseInput): Promise<AnaliseGerada>;
  executarRodadaAya(entrada: RodadaAyaInput): Promise<RodadaAyaGerada>;
}
```

Implemente `GeminiProvider` como adaptador dessa interface.

## Integração entre Lovable e backend

O frontend React deve consumir a API NestJS por HTTP. Evite acoplar componentes diretamente ao formato interno do Prisma.

Regras:

- publique contrato OpenAPI;
- crie DTOs de entrada e saída;
- valide todas as entradas no backend;
- gere ou mantenha tipos TypeScript compartilhados quando for útil;
- configure CORS apenas para origens permitidas por variável de ambiente;
- não armazene token de sessão pública, nome, e-mail, relato ou outros dados sensíveis em `localStorage` na aplicação real;
- a pessoa participante não cria conta, não define senha e não faz login;
- o backend deve criar uma sessão pública segura vinculada à jornada;
- o e-mail serve para contato e não pode autorizar acesso sozinho;
- o backend é a fonte de verdade de sessão, progresso, sorteio e IA;
- `localStorage` pode existir apenas no protótipo sem dados reais.

Consulte `references/contratos-api.md`.

## Identificação sem cadastro e sem login

A pessoa participante deve informar somente nome e e-mail para contato ao começar uma análise. Não crie conta, senha, tela de login, recuperação de senha, access token JWT ou refresh token para participantes.

O backend deve:

- criar uma jornada com `publicId` aleatório e não sequencial;
- gerar token opaco de alta entropia;
- salvar apenas o hash do token;
- definir o token em cookie `httpOnly`, `secure` em produção e com `sameSite` adequado;
- validar a associação entre sessão e jornada em todas as rotas públicas;
- impedir enumeração de jornadas;
- permitir retomada no mesmo navegador enquanto a sessão estiver válida;
- usar link temporário e de uso único enviado ao e-mail apenas se a retomada entre dispositivos for implementada.

O nome e o e-mail são dados de contato. Nunca permita abrir uma jornada informando apenas esses dois campos. Uma eventual área da psicóloga ou administração deve ter autenticação própria e separada.

## Fluxo canônico da sessão

Implemente a jornada nesta ordem:

1. Informar nome e e-mail para contato, sem criação de conta ou senha.
2. Apresentação e aceite do consentimento informado vigente.
3. Criação de sessão pública segura vinculada à jornada.
4. Escolha do tema que deseja trabalhar.
5. Relato inicial da circunstância por texto no MVP; áudio permanece configurável para fase posterior.
6. Preparação, respiração e mentalização da circunstância.
7. Primeiro conjunto: palavra e depois imagem — Circunstância percebida.
8. Segundo conjunto: palavra e depois imagem — História.
9. Terceiro conjunto: palavra e depois imagem — Condicionamentos.
10. Quarto conjunto: palavra e depois imagem — Consciência.
11. Quinto conjunto: palavra e depois imagem — Escolha consciente.
12. Visualização dos cinco conjuntos completos e ordenados.
13. Uma única requisição de IA gera todas as perguntas reflexivas.
14. A pessoa responde às perguntas.
15. Uma única requisição de IA gera análise e relatório.
16. Conversa opcional e limitada com a AYA.
17. Relatório final, com revisão profissional quando essa regra estiver habilitada.

Não altere a ordem das cinco etapas sem decisão explícita da responsável pelo método.

## Função de cada etapa

### 1. Circunstância percebida

Representa como a situação está sendo vivida ou percebida naquele momento. Não representa necessariamente a realidade absoluta nem um diagnóstico.

### 2. História

Explora narrativas, explicações, julgamentos e conclusões construídas em torno da circunstância.

### 3. Condicionamentos

Explora crenças aprendidas, experiências anteriores, expectativas, medos e padrões que podem influenciar a história construída.

### 4. Consciência

Favorece novas perspectivas quando a pessoa observa sua narrativa com maior distância e clareza.

### 5. Escolha consciente

Aponta para uma possível compreensão, postura ou ação mais consciente. Não deve ser apresentada como ordem, previsão ou resposta obrigatória.

## Regras obrigatórias das cartas

Estas regras são obrigatórias, salvo mudança explícita da responsável pelo produto:

- existem dois baralhos separados: palavras e imagens;
- as cartas permanecem viradas para baixo antes da escolha;
- a pessoa não pode ver previamente palavra, imagem, nome do arquivo, descrição, identificador, texto alternativo, metadados ou qualquer prévia;
- em cada conjunto, a palavra é sempre escolhida antes da imagem;
- o resultado é aleatório;
- a pessoa escolhe uma carta fechada, mas o resultado é definido e persistido pelo backend;
- depois da revelação, a pessoa não pode trocar, retirar novamente, regenerar ou voltar para escolher outra carta;
- atualizar a página, reabrir o navegador, repetir a requisição ou reconectar após falha deve preservar a mesma carta;
- o backend é a fonte de verdade do sorteio;
- o sorteio deve ser salvo em transação;
- use idempotência para impedir resultados diferentes em requisições duplicadas;
- a regra de repetição de cartas dentro da mesma sessão deve ser configurável até confirmação definitiva.

Nunca implemente o sorteio somente no frontend.

## Significado de um conjunto

Uma palavra não descreve obrigatoriamente a emoção atual da pessoa.

A palavra `raiva`, por exemplo, pode estar relacionada a:

- uma situação passada;
- a raiva de outra pessoa;
- uma lembrança;
- uma reação de proteção;
- um episódio que desencadeou raiva;
- uma associação que só ganhará sentido dentro da sequência completa.

A imagem não precisa parecer semanticamente relacionada à palavra. Uma combinação aparentemente desconectada é válida e não deve ser substituída.

O significado depende da interação entre:

- tema escolhido;
- relato inicial;
- palavra sorteada;
- descrição objetiva da imagem sorteada;
- etapa do percurso;
- sequência ordenada dos cinco conjuntos;
- impressões e respostas da pessoa.

Não force explicação imediatamente depois de cada revelação. Mostre orientação neutra, por exemplo:

> Observe esta combinação por alguns instantes. Não é necessário encontrar uma explicação agora.

Uma impressão inicial pode ser opcional. A pessoa deve poder continuar com:

- nenhuma resposta;
- “Não vejo relação neste momento.”;
- “Não sei responder.”;
- “Prefiro não responder.”

Nunca interprete a ausência de associação como resistência, negação, repressão, bloqueio ou trauma.

## Estratégia Gemini e controle de 500 RPD

Use o modelo configurável por ambiente, com padrão:

```text
GEMINI_MODEL=gemini-3.1-flash-lite
```

Considere `500 RPD` como orçamento configurado do projeto, não como garantia permanente do provedor. Os limites reais devem ser verificados no Google AI Studio e podem variar por projeto, nível e modelo.

Variáveis recomendadas:

```text
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_DAILY_HARD_LIMIT=500
GEMINI_DAILY_OPERATIONAL_LIMIT=450
GEMINI_MAX_AYA_ROUNDS=2
GEMINI_TIMEOUT_MS=30000
GEMINI_MAX_RETRIES=1
```

O limite operacional de 450 preserva uma reserva de 50 chamadas para falhas, testes autorizados, revisão e contingência. Torne todos os valores configuráveis.

### Consumo padrão

- geração de perguntas: 1 requisição;
- análise e relatório: 1 requisição;
- cada rodada da AYA: 1 requisição adicional.

Uma sessão padrão consome 2 RPD. Com limite operacional de 450, o máximo teórico é 225 sessões padrão por dia, reduzido pelas rodadas da AYA e por novas tentativas.

Não prometa capacidade diária fixa sem considerar concorrência, RPM, TPM, falhas e chamadas da AYA.

### Não desperdiçar requisições

Não chame a IA:

- ao embaralhar ou sortear cartas;
- depois de cada palavra ou imagem;
- para instruções estáticas;
- para textos fixos da interface;
- ao atualizar a página;
- para reformatar conteúdo já persistido;
- para exportar PDF de relatório já salvo;
- para contar tokens antes de toda chamada, salvo necessidade excepcional;
- para interpretar nomes de arquivos de imagens.

Estime tamanho localmente e registre `usage` retornado pelo Gemini. Uma chamada separada de contagem de tokens pode aumentar consumo de API e deve ser evitada no fluxo normal.

### Controle de cota no backend

Implemente um contador diário atômico no PostgreSQL, por projeto e modelo.

Requisitos:

- usar uma tabela como `AiDailyQuota`;
- calcular o dia de cota com a zona `America/Los_Angeles`, pois o RPD do provedor é reiniciado à meia-noite do horário do Pacífico;
- reservar a cota antes da chamada;
- confirmar consumo após envio ao provedor;
- registrar falhas e tentativas;
- impedir nova chamada ao atingir o limite operacional;
- permitir override apenas para administrador autorizado;
- tratar `429 RESOURCE_EXHAUSTED` sem loop de repetição;
- nunca criar múltiplas chaves para tentar contornar limites do mesmo projeto.

Consulte `references/integracao-gemini.md`.

## Operações de IA e idempotência

Toda chamada deve possuir registro persistente em `AiOperation` com, no mínimo:

- `id`;
- `journeyId`;
- `type`;
- `idempotencyKey` única;
- `inputHash`;
- `promptVersion`;
- `model`;
- `status`;
- `requestCount`;
- `promptTokens`;
- `outputTokens`;
- `thoughtTokens`, quando informado;
- `totalTokens`;
- `latencyMs`;
- `providerErrorCode`;
- `createdAt` e `completedAt`.

Não salve prompt integral em logs comuns. Quando o conteúdo precisar ser persistido para auditoria clínica ou de produto, armazene-o em tabela protegida, com acesso restrito e política de retenção.

Chaves recomendadas:

```text
jornada:{id}:perguntas:v1
jornada:{id}:analise:v1
jornada:{id}:aya:rodada:{numero}:v1
```

Se uma operação com a mesma chave estiver concluída, retorne a resposta salva. Se estiver em processamento, retorne o status atual. Não faça nova chamada.

## SDK e respostas estruturadas

Use o SDK oficial `@google/genai` somente no backend.

Prefira a API oficial mais atual suportada pelo SDK e pelo modelo. Mantenha toda chamada encapsulada no adaptador `GeminiProvider`, para permitir migração entre `Interactions API` e `generateContent` sem alterar o domínio.

Regras:

- use saída JSON estruturada;
- derive o schema a partir de Zod ou converta os schemas de `templates/`;
- valide novamente a resposta no backend;
- rejeite conteúdo inválido sem disponibilizá-lo ao usuário;
- limite tamanho de saída;
- use temperatura baixa ou moderada para consistência;
- não habilite grounding, pesquisa web, execução de código ou ferramentas externas para perguntas e relatórios;
- não envie as imagens das cartas ao Gemini no fluxo normal;
- envie descrições objetivas, curtas e revisadas pela responsável pelo método;
- registre versão de prompt e schema.

## Contexto enviado para a IA

Na geração de perguntas, envie:

- tema escolhido;
- relato inicial da circunstância;
- cinco conjuntos na ordem correta;
- palavra de cada conjunto;
- descrição objetiva e revisada de cada imagem;
- função de cada etapa;
- impressão inicial opcional, quando existir.

Na geração da análise, envie também:

- perguntas produzidas;
- respostas da pessoa;
- observações registradas durante a jornada;
- histórico autorizado da AYA, quando fizer parte da análise.

Não dependa do nome do arquivo da imagem. Não envie descrição interpretativa como se fosse observação objetiva.

## Como a IA deve interpretar

A IA deve:

- tratar toda interpretação como possibilidade, nunca como fato;
- distinguir claramente falas da pessoa de hipóteses da IA;
- formular perguntas abertas, neutras e não indutivas;
- fundamentar reflexão no relato e nas respostas fornecidas;
- considerar a sequência completa, não apenas cartas isoladas;
- aceitar que a pessoa talvez não veja relação entre palavra e imagem;
- evitar significados universais e fixos;
- reconhecer incerteza e leituras alternativas;
- preservar autonomia;
- evitar aconselhamento imperativo;
- evitar linguagem determinista;
- evitar afirmar que as cartas revelam objetivamente o subconsciente.

Formulações adequadas:

- “Esta combinação pode convidar você a observar...”
- “Uma possibilidade a investigar é...”
- “Isso se relaciona com algo da circunstância que você relatou?”
- “Ao olhar para esta sequência, o que faz sentido para você e o que não faz?”
- “Esta é uma hipótese de reflexão, não uma conclusão sobre você.”

Formulações proibidas:

- “Esta carta prova que...”
- “Seu trauma é...”
- “Você é dependente de...”
- “Seu subconsciente escolheu isso porque...”
- “A imagem significa obrigatoriamente...”
- “Você precisa perdoar...”
- “O método revelou a verdade...”

## Regras para perguntas, análise e AYA

As perguntas devem ser:

- personalizadas pelo contexto completo;
- breves;
- abertas;
- acolhedoras;
- não diagnósticas;
- não indutivas;
- centradas na linguagem da própria pessoa;
- relacionadas à etapa correspondente.

AYA deve funcionar por rodadas limitadas, não como chat ilimitado por padrão.

Cada rodada deve:

1. reconhecer brevemente a resposta anterior;
2. apresentar no máximo três perguntas relacionadas;
3. permitir pular, pausar ou encerrar;
4. evitar repetir perguntas;
5. manter o limite configurado em `GEMINI_MAX_AYA_ROUNDS`;
6. não gerar automaticamente nova versão de relatório a cada mensagem.

## Tratamento de erros do Gemini

Mapeie erros do provedor para estados internos estáveis.

- `429 RESOURCE_EXHAUSTED`: marque como `QUOTA_BLOCKED`; não repita continuamente;
- bloqueio de segurança: marque como `SAFETY_BLOCKED` e encaminhe para fluxo seguro;
- timeout ou erro 5xx: no máximo uma nova tentativa automática com backoff e mesma chave de idempotência;
- erro 4xx de validação: não repetir; corrigir entrada ou configuração;
- JSON inválido: marcar como `INVALID_OUTPUT`; permitir uma única tentativa de reparo somente se houver cota e regra explícita;
- indisponibilidade prolongada: manter jornada salva e permitir retomada posterior.

Nunca exiba stack trace, chave, prompt ou resposta bruta do provedor ao usuário.

## Dados sensíveis, consentimento e segurança

O sistema pode armazenar relatos íntimos e dados potencialmente relacionados à saúde. Trate-os como dados altamente sensíveis.

Requisitos mínimos:

- consentimento versionado;
- acesso público à jornada apenas por sessão opaca válida e vinculada ao recurso;
- o e-mail nunca funciona como credencial;
- autorização por papel para rotas profissionais e administrativas;
- acesso profissional somente quando autorizado;
- criptografia em trânsito;
- criptografia do storage e banco em produção;
- segredos apenas em secret manager ou variáveis seguras;
- auditoria de acesso a jornadas e relatórios;
- política de retenção e exclusão;
- exportação e exclusão de dados conforme regras do produto;
- backups protegidos;
- nenhuma informação pessoal em logs de aplicação;
- mascaramento de dados em ambientes de teste;
- não usar relatos reais como fixtures.

Não faça alegações de conformidade jurídica automática. Marque revisão de LGPD, termos, privacidade e responsabilidade profissional como etapa obrigatória antes de produção.

## Sinalização de segurança

Perguntas e análises devem retornar a estrutura de sinalização prevista nos schemas, sem criar uma chamada adicional.

Quando o conteúdo indicar risco grave ou necessidade urgente de suporte:

- não continue com interpretações simbólicas como se fossem suficientes;
- mostre mensagem segura e não julgadora;
- ofereça pausa e encaminhamento a suporte humano conforme política aprovada;
- sinalize revisão profissional;
- não faça diagnóstico;
- não gere instruções perigosas;
- não invente contatos locais; mantenha recursos regionais configuráveis.

## Persistência e modelo de dados

Use Prisma migrations. Não use `prisma db push` como estratégia de produção.

Entidades mínimas:

- `JourneyContact`;
- `PublicAccessSession`;
- `JourneyResumeToken`, somente se a retomada por e-mail for implementada;
- `ProfessionalAccount`, somente para área restrita;
- `ProfessionalProfile`, somente para área restrita;
- `ConsentDocument`;
- `ConsentAcceptance`;
- `Theme`;
- `WordCard`;
- `ImageCard`;
- `Journey`;
- `JourneySet`;
- `InitialImpression`;
- `ReflectiveQuestion`;
- `ReflectiveAnswer`;
- `AiOperation`;
- `AiDailyQuota`;
- `AyaRound`;
- `Report`;
- `AuditLog`.

Consulte `references/modelo-dados.md`.

## Testes obrigatórios

Implemente testes para:

- palavra sempre antes da imagem;
- impossibilidade de trocar carta;
- idempotência em clique duplo;
- persistência após recarregar página;
- sorteio concorrente da mesma etapa;
- acesso à jornada por sessão pública válida;
- impossibilidade de acessar uma jornada apenas com nome ou e-mail;
- expiração e revogação da sessão pública;
- autenticação separada da área profissional, quando existir;
- versão de consentimento;
- bloqueio ao atingir orçamento diário;
- retorno de resposta salva sem nova chamada;
- validação dos JSONs do Gemini;
- tratamento de 429, timeout, bloqueio de segurança e saída inválida;
- limite de rodadas da AYA;
- ausência de chave Gemini no bundle frontend;
- remoção de dados sensíveis de logs.

Use testes unitários para regras de domínio e integração para banco, sorteio, cota e provedor simulado.

## Critérios de conclusão

Uma tarefa só está concluída quando:

- respeita o fluxo canônico;
- mantém regras das cartas;
- backend é fonte de verdade;
- não expõe segredo;
- possui validação de entrada e saída;
- controla cota e idempotência;
- preserva respostas já geradas;
- possui testes adequados;
- documenta variáveis de ambiente e migrations;
- não transforma hipóteses psicológicas em fatos;
- não adiciona dependências ou infraestrutura desnecessárias.
