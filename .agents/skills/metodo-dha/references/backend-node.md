# Fluxo técnico recomendado

## Etapas sem IA

As seguintes etapas não precisam de IA:

1. informar nome e e-mail para contato;
2. criar sessão pública segura;
3. registrar consentimento;
4. escolher o tema;
5. registrar o relato inicial;
6. exibir instruções de preparação;
7. sortear as cartas;
8. animar a revelação;
9. persistir os conjuntos;
10. visualizar a sequência;
11. exportar conteúdo já gerado.

## Início sem cadastro e sem login

Fluxo sugerido:

```text
POST /api/public/journeys/start
        ↓
backend valida nome, e-mail e consentimento
        ↓
cria JourneyContact, ConsentAcceptance, Journey e AccessSession
        ↓
define cookie de sessão opaco e httpOnly
        ↓
retorna publicJourneyId e próximo passo
```

Regras:

- não criar senha;
- não exigir conta;
- não considerar o e-mail uma credencial;
- não expor ID sequencial da jornada;
- não armazenar token de acesso em texto puro no banco;
- não armazenar relato, e-mail ou token em `localStorage` na versão real;
- atualizar a página deve manter a jornada pela sessão do backend;
- acesso em outro navegador deve depender de link seguro e temporário, quando essa função existir.

## Requisição 1 — perguntas

Depois dos cinco conjuntos, envie em uma única chamada:

- tema;
- relato;
- cinco palavras;
- cinco descrições objetivas de imagens;
- nome e função das etapas;
- impressões iniciais opcionais.

Retorne:

- reflexão breve da sequência;
- uma ou duas perguntas por etapa;
- uma ou duas perguntas integradoras;
- sinalização de segurança;
- aviso não diagnóstico.

## Requisição 2 — análise e relatório

Depois das respostas, envie:

- todo o contexto anterior;
- perguntas;
- respostas;
- observações autorizadas.

Retorne:

- resumo da circunstância;
- análise cuidadosa por etapa;
- síntese da sequência;
- fundamentos;
- incertezas;
- perguntas futuras opcionais;
- sinalização de segurança;
- indicação de revisão profissional;
- relatório.

## AYA opcional

Cada rodada adicional da AYA equivale normalmente a uma nova requisição.

Para reduzir RPD:

- agrupe duas ou três perguntas por rodada;
- limite a quantidade de rodadas;
- salve todas as respostas;
- não gere novo relatório em toda rodada;
- faça a última rodada atualizar o relatório somente quando necessário;
- não use chat infinito por padrão.

## Orçamento diário

Configuração sugerida:

```text
limite informado: 500 RPD
limite operacional: 450 RPD
reserva: 50 RPD
sessão padrão: 2 RPD
máximo teórico operacional: 225 sessões padrão/dia
```

As rodadas da AYA e retries reduzem esse máximo.

## Idempotência

Exemplos de chave:

```text
jornada:123:inicio:v1
jornada:123:palavra:etapa:1
jornada:123:imagem:etapa:1
jornada:123:perguntas:v1
jornada:123:analise:v1
jornada:123:aya:rodada:1:v1
```

Uma operação concluída deve retornar o resultado existente em vez de executar novamente.

## Estados sugeridos de jornada

```text
INICIADA
AGUARDANDO_CONSENTIMENTO
AGUARDANDO_TEMA
AGUARDANDO_RELATO
RELATO_REGISTRADO
EM_PREPARACAO
EM_TIRAGEM
CARTAS_CONCLUIDAS
PERGUNTAS_GERANDO
PERGUNTAS_DISPONIVEIS
AGUARDANDO_RESPOSTAS
ANALISE_GERANDO
ANALISE_DISPONIVEL
AYA_EM_ANDAMENTO
RELATORIO_DISPONIVEL
AGUARDANDO_REVISAO
LIBERADA
PAUSADA
CANCELADA
EXPIRADA
```

Não permita transições fora de ordem sem regra explícita.
