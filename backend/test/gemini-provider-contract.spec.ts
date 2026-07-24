import { ConfigService } from '@nestjs/config';
import { DemoIaProvider } from '../src/ia/demo.provider';
import { GeminiProvider } from '../src/ia/gemini.provider';
import {
  DHA_STEP_NAMES,
  analysisGenerationContextSchema,
  type AnalysisGenerationContext,
  type IaProviderError,
  type QuestionGenerationContext,
} from '../src/ia/provedor-ia';

type GeminiRequest = {
  contents: Array<{
    parts: Array<{ text: string }>;
  }>;
  config: {
    systemInstruction: string;
    responseJsonSchema?: SchemaNode;
  };
};

type SchemaNode = Record<string, unknown>;

type MockResponseOptions = {
  rawText?: string | null;
  finishReason?: string;
  blockReason?: string;
};

const questionContext: QuestionGenerationContext = {
  theme: 'Relacionamentos',
  initialNarrative: 'Quero observar uma situaÃ§Ã£o importante com mais calma.',
  catalogVersion: 'dha-2026-v1',
  steps: DHA_STEP_NAMES.map((name, index) => ({
    number: (index + 1) as 1 | 2 | 3 | 4 | 5,
    name,
    purpose: `FunÃ§Ã£o reflexiva da etapa ${index + 1}.`,
    word: `Palavra ${index + 1}`,
    imageDescription: `DescriÃ§Ã£o objetiva suficientemente detalhada da imagem ${index + 1}.`,
    initialImpression: null,
  })),
};

const questionWireResponse = {
  reflexaoSequencia: [
    'Visão da sequência:',
    'A sequência pode ser observada sem conclusões antecipadas.',
    '',
    'Síntese da leitura:',
    'Esta é uma hipótese inicial que poderá ser revista pelas respostas.',
  ].join('\n'),
  etapas: DHA_STEP_NAMES.map((nomeEtapa, index) => ({
    numeroEtapa: index + 1,
    nomeEtapa,
    pergunta: [
      'O que o conjunto revela:',
      `Esta combinação pode convidar a observar o movimento ${index + 1} como possibilidade.`,
      '',
      'Pergunta de reflexão:',
      `O que surge para você ao observar a etapa ${index + 1}?`,
      '',
      'Convite à consciência:',
      'Considere apenas o que fizer sentido na sua experiência.',
    ].join('\n'),
  })),
  sinalizacaoSeguranca: {
    requerPausa: false,
    requerRevisaoProfissional: false,
    motivo: '',
  },
  aviso: 'Esta reflexÃ£o nÃ£o Ã© diagnÃ³stico, previsÃ£o ou orientaÃ§Ã£o profissional.',
};

const analysisContext: AnalysisGenerationContext = analysisGenerationContextSchema.parse({
  ...questionContext,
  steps: questionContext.steps.map((step, index) => ({
    ...step,
    questions: [{
      displayOrder: index + 1,
      text: `Pergunta da etapa ${index + 1}?`,
      responseType: 'TEXT',
      answer: `Resposta da etapa ${index + 1}.`,
    }],
  })),
  integrativeQuestions: [],
});

function providerWithResponse(
  data: unknown,
  options: MockResponseOptions = {},
) {
  const requests: unknown[] = [];
  const generateContent = jest.fn((request: unknown) => {
    requests.push(request);
    return Promise.resolve({
      text: options.rawText === undefined
        ? JSON.stringify(data)
        : options.rawText,
      promptFeedback: options.blockReason
        ? { blockReason: options.blockReason }
        : undefined,
      candidates: [{ finishReason: options.finishReason ?? 'STOP' }],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 200,
        thoughtsTokenCount: 10,
        totalTokenCount: 310,
      },
      responseId: 'response-test',
      modelVersion: 'gemini-test',
    });
  });
  const provider = new GeminiProvider(new ConfigService({
    GEMINI_API_KEY: 'test-key-without-network-access',
    GEMINI_MODEL: 'gemini-test',
  }));
  (provider as unknown as {
    client: { models: { generateContent: typeof generateContent } };
  }).client = { models: { generateContent } };
  return { provider, generateContent, requests };
}

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  'type',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);

function assertSupportedSchemaKeywords(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(assertSupportedSchemaKeywords);
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const [keyword, value] of Object.entries(node)) {
    expect(SUPPORTED_SCHEMA_KEYWORDS).toContain(keyword);
    if (keyword === 'properties') {
      Object.values(value as Record<string, unknown>)
        .forEach(assertSupportedSchemaKeywords);
    } else if (keyword === 'items' || keyword === 'prefixItems') {
      assertSupportedSchemaKeywords(value);
    }
  }
}

async function capturedProviderError(
  action: () => Promise<unknown>,
): Promise<IaProviderError> {
  try {
    await action();
  } catch (error) {
    return error as IaProviderError;
  }
  throw new Error('EXPECTED_PROVIDER_ERROR');
}

describe('contratos estruturados do GeminiProvider', () => {
  it('envia um wire schema fixo e normaliza cinco perguntas para o domÃ­nio', async () => {
    const { provider, generateContent, requests } = providerWithResponse(
      questionWireResponse,
    );

    const result = await provider.gerarPerguntas(questionContext);
    const request = requests[0] as GeminiRequest;
    const schema = request.config.responseJsonSchema!;
    const properties = schema.properties as Record<string, SchemaNode>;
    const stagesSchema = properties.etapas;
    const prefixItems = stagesSchema.prefixItems as SchemaNode[];

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.data.etapas).toHaveLength(5);
    expect(result.data.etapas.every((stage) => stage.perguntas.length === 1))
      .toBe(true);
    expect(result.data.etapas[0]?.perguntas[0])
      .toBe(questionWireResponse.etapas[0]?.pergunta);
    expect(result.data.perguntasIntegradoras).toEqual([]);

    expect(schema.required).not.toContain('perguntasIntegradoras');
    expect(properties).not.toHaveProperty('perguntasIntegradoras');
    expect(prefixItems).toHaveLength(5);
    prefixItems.forEach((stage, index) => {
      const stageProperties = stage.properties as Record<string, SchemaNode>;
      expect(stageProperties.numeroEtapa?.enum).toEqual([index + 1]);
      expect(stageProperties.nomeEtapa?.enum).toEqual([DHA_STEP_NAMES[index]]);
      expect(stageProperties).toHaveProperty('pergunta');
      expect(stageProperties).not.toHaveProperty('perguntas');
    });

    assertSupportedSchemaKeywords(schema);
    expect(JSON.stringify(schema)).not.toMatch(
      /minLength|maxLength|minimum|maximum/,
    );
    expect(request.config.systemInstruction)
      .toContain('campo singular "pergunta"');
    expect(request.config.systemInstruction)
      .toContain('três blocos editoriais');
    expect(request.contents[0]?.parts[0]?.text)
      .toContain('"versaoPrompt":"dha-ia-v3.0.0"');
  });

  it('envia o schema da anÃ¡lise no subconjunto aceito e fixa as cinco etapas', async () => {
    const demoResult = await new DemoIaProvider().gerarAnalise(analysisContext);
    const { provider, generateContent, requests } = providerWithResponse(
      demoResult.data,
    );

    const result = await provider.gerarAnalise(analysisContext);
    const request = requests[0] as GeminiRequest;
    const schema = request.config.responseJsonSchema!;
    const properties = schema.properties as Record<string, SchemaNode>;
    const stagesSchema = properties.reflexoesEtapas;
    const prefixItems = stagesSchema.prefixItems as SchemaNode[];

    expect(result.data.reflexoesEtapas).toHaveLength(5);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(request.config.systemInstruction).toContain('HIERARQUIA DE EVIDÊNCIAS');
    expect(request.config.systemInstruction).toContain('VERIFICAÇÃO FINAL SILENCIOSA');
    expect(request.config.systemInstruction).toContain('Respostas não textuais nunca significam');
    expect(prefixItems).toHaveLength(5);
    prefixItems.forEach((stage, index) => {
      const stageProperties = stage.properties as Record<string, SchemaNode>;
      expect(stageProperties.numeroEtapa?.enum).toEqual([index + 1]);
      expect(stageProperties.nomeEtapa?.enum).toEqual([DHA_STEP_NAMES[index]]);
    });
    assertSupportedSchemaKeywords(schema);
    expect(JSON.stringify(schema)).not.toMatch(
      /minLength|maxLength|minimum|maximum/,
    );
  });

  it.each([
    {
      label: 'resposta vazia',
      options: { rawText: '   ' },
      expectedCode: 'INVALID_OUTPUT',
      expectedDiagnostic: 'EMPTY_RESPONSE',
    },
    {
      label: 'JSON malformado',
      options: { rawText: '{"campoPrivado":' },
      expectedCode: 'INVALID_OUTPUT',
      expectedDiagnostic: 'MALFORMED_JSON',
    },
    {
      label: 'JSON fora do schema',
      options: { rawText: '{"valorNaoPermitido":"nao-vazar"}' },
      expectedCode: 'INVALID_OUTPUT',
      expectedDiagnostic: 'SCHEMA_VALIDATION',
    },
    {
      label: 'encerramento por limite de tokens',
      options: { finishReason: 'MAX_TOKENS' },
      expectedCode: 'INVALID_OUTPUT',
      expectedDiagnostic: 'FINISH_REASON_MAX_TOKENS',
    },
    {
      label: 'encerramento de seguranÃ§a',
      options: { finishReason: 'SAFETY' },
      expectedCode: 'SAFETY_BLOCKED',
      expectedDiagnostic: 'FINISH_REASON_SAFETY',
    },
    {
      label: 'encerramento desconhecido',
      options: { finishReason: 'VALOR_BRUTO_NAO_PERMITIDO' },
      expectedCode: 'INVALID_OUTPUT',
      expectedDiagnostic: 'FINISH_REASON_UNSUPPORTED',
    },
  ])('retorna diagnÃ³stico seguro para $label', async ({
    options,
    expectedCode,
    expectedDiagnostic,
  }) => {
    const { provider } = providerWithResponse(questionWireResponse, options);
    const error = await capturedProviderError(
      () => provider.gerarPerguntas(questionContext),
    );
    const serialized = JSON.stringify(error);

    expect(error).toMatchObject({
      code: expectedCode,
      retryable: false,
      diagnosticCode: expectedDiagnostic,
    });
    expect(serialized).not.toContain('campoPrivado');
    expect(serialized).not.toContain('valorNaoPermitido');
    expect(serialized).not.toContain('VALOR_BRUTO_NAO_PERMITIDO');
    expect(serialized).not.toContain('Zod');
  });

  it('nÃ£o expÃµe o motivo bruto de bloqueio do prompt', async () => {
    const { provider } = providerWithResponse(questionWireResponse, {
      blockReason: 'MOTIVO_BRUTO_NAO_PERMITIDO',
    });
    const error = await capturedProviderError(
      () => provider.gerarPerguntas(questionContext),
    );

    expect(error).toMatchObject({
      code: 'SAFETY_BLOCKED',
      retryable: false,
      diagnosticCode: 'PROMPT_BLOCKED',
    });
    expect(JSON.stringify(error)).not.toContain('MOTIVO_BRUTO_NAO_PERMITIDO');
  });
});


