# Contratos de API sugeridos

Os caminhos são sugestões. Adapte às convenções já existentes no projeto.

## Início público sem conta e sem login

```text
POST /api/public/journeys/start
GET  /api/public/journeys/current
POST /api/public/journeys/current/end-session
```

Exemplo de início:

```json
{
  "name": "Mariana Alves",
  "email": "mariana@example.com",
  "consentDocumentId": "uuid",
  "accepted": true
}
```

Resposta sugerida:

```json
{
  "publicJourneyId": "jrn_7wjQm9...",
  "status": "AGUARDANDO_TEMA",
  "nextStep": "THEME"
}
```

O backend deve definir um cookie de sessão opaco e `httpOnly`. Não retorne senha, JWT de participante ou token bruto no corpo quando o cookie puder ser usado com segurança.

## Consentimento

```text
GET /api/public/consents/current
GET /api/public/journeys/current/consent
```

O aceite normalmente ocorre em `POST /api/public/journeys/start` para evitar uma jornada sem identificação e sem consentimento. Caso o produto separe as telas, permita aceite posterior antes de qualquer relato sensível.

## Temas

```text
GET /api/public/themes
```

## Jornada pública atual

```text
GET   /api/public/journeys/:publicJourneyId
PATCH /api/public/journeys/:publicJourneyId/context
POST  /api/public/journeys/:publicJourneyId/pause
POST  /api/public/journeys/:publicJourneyId/resume
```

Exemplo de contexto:

```json
{
  "themeId": "uuid",
  "customTheme": null,
  "initialNarrative": "Texto relatado pela pessoa"
}
```

Todas as rotas exigem a sessão pública associada à jornada. O e-mail não pode ser usado como autorização.

## Sorteio das cartas

```text
POST /api/public/journeys/:publicJourneyId/sets/:stepNumber/draw-word
POST /api/public/journeys/:publicJourneyId/sets/:stepNumber/draw-image
PUT  /api/public/journeys/:publicJourneyId/sets/:stepNumber/impression
```

As rotas de sorteio devem aceitar cabeçalho ou campo de idempotência.

Exemplo de resposta de palavra:

```json
{
  "publicJourneyId": "jrn_7wjQm9...",
  "stepNumber": 1,
  "stepName": "Circunstância percebida",
  "word": {
    "id": "uuid",
    "text": "RAIVA"
  },
  "locked": true,
  "drawnAt": "2026-07-18T12:00:00.000Z"
}
```

Nunca retorne cartas não escolhidas nem IDs que permitam descobrir o baralho oculto.

## Perguntas

```text
POST /api/public/journeys/:publicJourneyId/questions/generate
GET  /api/public/journeys/:publicJourneyId/questions
PUT  /api/public/journeys/:publicJourneyId/answers
```

`POST .../generate` deve:

- exigir cinco conjuntos concluídos;
- usar chave de idempotência estável;
- retornar resposta salva se já gerada;
- retornar `202` com status quando processamento for assíncrono;
- bloquear quando cota operacional estiver esgotada.

## Análise e relatório

```text
POST /api/public/journeys/:publicJourneyId/analysis/generate
GET  /api/public/journeys/:publicJourneyId/analysis
GET  /api/public/journeys/:publicJourneyId/report
```

Não faça nova chamada Gemini ao abrir ou exportar relatório.

## AYA

```text
POST /api/public/journeys/:publicJourneyId/aya/rounds
GET  /api/public/journeys/:publicJourneyId/aya/rounds
```

Exemplo:

```json
{
  "answers": [
    {
      "questionId": "uuid",
      "text": "Resposta da pessoa"
    }
  ]
}
```

O backend determina o número da rodada e bloqueia além do limite.

## Retomada por e-mail — opcional

Não implementar no MVP sem necessidade. Quando implementada:

```text
POST /api/public/journeys/resume-link/request
GET  /api/public/journeys/resume-link/consume?token=...
```

Regras:

- resposta genérica para evitar enumeração de e-mails;
- token aleatório, armazenado somente como hash;
- validade curta;
- uso único;
- limite por IP e e-mail;
- após consumo, criar nova sessão e invalidar o token;
- nunca enviar o relatório diretamente para qualquer e-mail sem validação do fluxo aprovado.

## Área profissional — restrita

```text
POST /api/professional/auth/login
POST /api/professional/auth/refresh
POST /api/professional/auth/logout
GET  /api/professional/journeys
GET  /api/professional/journeys/:journeyId
POST /api/professional/journeys/:journeyId/notes
POST /api/professional/journeys/:journeyId/report/approve
POST /api/professional/journeys/:journeyId/report/release
```

Acesso depende de autenticação profissional e autorização explícita para a jornada.

## Erros padronizados

Formato sugerido:

```json
{
  "code": "AI_DAILY_LIMIT_REACHED",
  "message": "A análise não pôde ser gerada agora. Sua jornada foi salva para continuar depois.",
  "correlationId": "uuid",
  "details": null
}
```

Códigos úteis:

- `PUBLIC_SESSION_REQUIRED`;
- `PUBLIC_SESSION_EXPIRED`;
- `INVALID_JOURNEY_STATE`;
- `CARD_ALREADY_DRAWN`;
- `WORD_REQUIRED_BEFORE_IMAGE`;
- `CONSENT_REQUIRED`;
- `FORBIDDEN_RESOURCE`;
- `AI_DAILY_LIMIT_REACHED`;
- `AI_TEMPORARILY_UNAVAILABLE`;
- `AI_OUTPUT_INVALID`;
- `AI_CONTENT_BLOCKED`;
- `AYA_ROUND_LIMIT_REACHED`.
