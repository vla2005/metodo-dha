# Skill do Codex — Método DHA v3

Skill em português para orientar o Codex no desenvolvimento completo da plataforma Método DHA, incluindo o frontend criado no Lovable, backend Node.js e integração com Gemini.

## Decisão atual de acesso

A pessoa participante **não cria conta e não faz login**.

Ao iniciar uma análise, informa apenas:

- nome;
- e-mail para contato;
- aceite do consentimento vigente.

O backend cria uma jornada e uma sessão pública segura. O e-mail não pode ser usado sozinho para autorizar acesso aos dados. Para retomada no mesmo navegador, use cookie de sessão opaco e `httpOnly`. Para retomada em outro dispositivo, implemente futuramente um link seguro, temporário e de uso único enviado ao e-mail, sem senha.

Uma eventual área da psicóloga ou de administração continua sendo restrita e deve possuir autenticação própria.

## Stack definida

- React + TypeScript + Tailwind CSS
- Node.js + NestJS + TypeScript
- PostgreSQL + Prisma
- Gemini API com modelo configurável, inicialmente `gemini-3.1-flash-lite`
- limite operacional configurável a partir de um orçamento de 500 RPD
- Docker

## Estrutura

- `SKILL.md`: regras principais da plataforma e da implementação.
- `references/resumo-metodo.md`: funcionamento do Método DHA.
- `references/decisoes-produto.md`: decisões confirmadas com a cliente.
- `references/diretrizes-ia.md`: regras de perguntas, análise, relatório e AYA.
- `references/fluxo-tecnico.md`: jornada, idempotência e consumo de IA.
- `references/backend-node.md`: arquitetura NestJS, sessão sem login e segurança.
- `references/modelo-dados.md`: entidades e restrições para PostgreSQL/Prisma.
- `references/contratos-api.md`: endpoints sugeridos para integrar o Lovable.
- `references/integracao-gemini.md`: SDK, modelo, 500 RPD, erros e observabilidade.
- `templates/perguntas.schema.json`: schema de perguntas.
- `templates/analise.schema.json`: schema de análise e relatório.
- `templates/aya.schema.json`: schema de uma rodada da AYA.
- `templates/env.example`: variáveis de ambiente sugeridas.

## Instalação no projeto

Copie a pasta inteira para:

```text
seu-projeto/
└── .agents/
    └── skills/
        └── metodo-dha/
            ├── SKILL.md
            ├── README.md
            ├── references/
            └── templates/
```

O arquivo principal deve ficar em:

```text
.agents/skills/metodo-dha/SKILL.md
```

Reabra o projeto ou inicie uma nova sessão no Codex depois de copiar a skill.

## Exemplo de uso

```text
$metodo-dha Analise o projeto atual e implemente o backend NestJS sem cadastro e sem login para participantes. A jornada deve começar com nome, e-mail, consentimento e uma sessão pública segura.
```
