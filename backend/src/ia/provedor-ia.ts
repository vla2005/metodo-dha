import { z } from 'zod';

export const DHA_STEP_NAMES = [
  'Circunstância percebida',
  'História',
  'Condicionamentos',
  'Consciência',
  'Escolha consciente',
] as const;

const stepNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const questionGenerationStepContextSchema = z.object({
  number: stepNumberSchema,
  name: z.enum(DHA_STEP_NAMES),
  purpose: z.string().trim().min(1).max(1000),
  word: z.string().trim().min(1).max(80),
  imageDescription: z.string().trim().min(10).max(1000),
  initialImpression: z.string().trim().max(1000).nullable(),
}).strict();

export const questionGenerationContextSchema = z.object({
  theme: z.string().trim().min(1).max(120),
  initialNarrative: z.string().trim().min(1).max(5000),
  catalogVersion: z.string().trim().min(1).max(40),
  steps: z.array(questionGenerationStepContextSchema).length(5),
}).strict().superRefine((context, refinement) => {
  context.steps.forEach((step, index) => {
    const expectedNumber = index + 1;
    if (step.number !== expectedNumber) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps', index, 'number'],
        message: `A etapa ${expectedNumber} deve ocupar esta posição.`,
      });
    }
    if (step.name !== DHA_STEP_NAMES[index]) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps', index, 'name'],
        message: `O nome esperado é ${DHA_STEP_NAMES[index]}.`,
      });
    }
  });
});

const safetySignalSchema = z.object({
  requerPausa: z.boolean(),
  requerRevisaoProfissional: z.boolean(),
  motivo: z.string().trim().max(800),
}).strict();

const generatedStepQuestionsSchema = z.object({
  numeroEtapa: stepNumberSchema,
  nomeEtapa: z.enum(DHA_STEP_NAMES),
  perguntas: z.array(z.string().trim().min(1).max(500)).length(1),
}).strict();

const legacyGeneratedStepQuestionsSchema = z.object({
  numeroEtapa: stepNumberSchema,
  nomeEtapa: z.enum(DHA_STEP_NAMES),
  perguntas: z.array(z.string().trim().min(1).max(500)).min(1).max(2),
}).strict();

type QuestionResultShape = {
  etapas: Array<{
    numeroEtapa: 1 | 2 | 3 | 4 | 5;
    nomeEtapa: (typeof DHA_STEP_NAMES)[number];
    perguntas: string[];
  }>;
  perguntasIntegradoras: string[];
};

function validateQuestionResult(
  result: QuestionResultShape,
  refinement: z.RefinementCtx,
): void {
  const questionsSeen = new Set<string>();
  result.etapas.forEach((step, index) => {
    const expectedNumber = index + 1;
    if (step.numeroEtapa !== expectedNumber) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['etapas', index, 'numeroEtapa'],
        message: `A etapa ${expectedNumber} deve ocupar esta posição.`,
      });
    }
    if (step.nomeEtapa !== DHA_STEP_NAMES[index]) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['etapas', index, 'nomeEtapa'],
        message: `O nome esperado é ${DHA_STEP_NAMES[index]}.`,
      });
    }
    step.perguntas.forEach((question, questionIndex) => {
      const normalized = question.normalize('NFC').toLocaleLowerCase('pt-BR');
      if (questionsSeen.has(normalized)) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['etapas', index, 'perguntas', questionIndex],
          message: 'As perguntas não podem se repetir.',
        });
      }
      questionsSeen.add(normalized);
    });
  });
  result.perguntasIntegradoras.forEach((question, index) => {
    const normalized = question.normalize('NFC').toLocaleLowerCase('pt-BR');
    if (questionsSeen.has(normalized)) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['perguntasIntegradoras', index],
        message: 'As perguntas não podem se repetir.',
      });
    }
    questionsSeen.add(normalized);
  });
}

export const questionGenerationSchema = z.object({
  reflexaoSequencia: z.string().trim().min(1).max(1200),
  etapas: z.array(generatedStepQuestionsSchema).length(5),
  perguntasIntegradoras: z.array(z.string().trim().min(1).max(500)).length(0),
  sinalizacaoSeguranca: safetySignalSchema,
  aviso: z.string().trim().min(1).max(700),
}).strict().superRefine(validateQuestionResult);

const legacyQuestionGenerationSchema = z.object({
  reflexaoSequencia: z.string().trim().min(1).max(1200),
  etapas: z.array(legacyGeneratedStepQuestionsSchema).length(5),
  perguntasIntegradoras: z.array(z.string().trim().min(1).max(500)).max(2),
  sinalizacaoSeguranca: safetySignalSchema,
  aviso: z.string().trim().min(1).max(700),
}).strict().superRefine(validateQuestionResult);

/**
 * Aceita operações antigas já concluídas sem permitir que novas gerações
 * voltem a produzir mais de cinco perguntas.
 */
export const persistedQuestionGenerationSchema = z.union([
  questionGenerationSchema,
  legacyQuestionGenerationSchema,
]);

const geminiGeneratedStepQuestionWireSchema = z.object({
  numeroEtapa: stepNumberSchema,
  nomeEtapa: z.enum(DHA_STEP_NAMES),
  pergunta: z.string().trim().min(1).max(500),
}).strict();

export const geminiQuestionGenerationWireSchema = z.object({
  reflexaoSequencia: z.string().trim().min(1).max(1200),
  etapas: z.array(geminiGeneratedStepQuestionWireSchema).length(5),
  sinalizacaoSeguranca: safetySignalSchema,
  aviso: z.string().trim().min(1).max(700),
}).strict().superRefine((result, refinement) => {
  const questionsSeen = new Set<string>();
  result.etapas.forEach((step, index) => {
    const expectedNumber = index + 1;
    if (step.numeroEtapa !== expectedNumber) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['etapas', index, 'numeroEtapa'],
        message: `A etapa ${expectedNumber} deve ocupar esta posição.`,
      });
    }
    if (step.nomeEtapa !== DHA_STEP_NAMES[index]) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['etapas', index, 'nomeEtapa'],
        message: `O nome esperado é ${DHA_STEP_NAMES[index]}.`,
      });
    }
    const normalized = step.pergunta.normalize('NFC').toLocaleLowerCase('pt-BR');
    if (questionsSeen.has(normalized)) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['etapas', index, 'pergunta'],
        message: 'As perguntas não podem se repetir.',
      });
    }
    questionsSeen.add(normalized);
  });
});

export type GeminiQuestionGenerationWireResult = z.infer<
  typeof geminiQuestionGenerationWireSchema
>;

export function normalizeGeminiQuestionGenerationWireResult(
  wireResult: GeminiQuestionGenerationWireResult,
): PerguntasGeradas {
  return questionGenerationSchema.parse({
    reflexaoSequencia: wireResult.reflexaoSequencia,
    etapas: wireResult.etapas.map((step) => ({
      numeroEtapa: step.numeroEtapa,
      nomeEtapa: step.nomeEtapa,
      perguntas: [step.pergunta],
    })),
    perguntasIntegradoras: [],
    sinalizacaoSeguranca: wireResult.sinalizacaoSeguranca,
    aviso: wireResult.aviso,
  });
}

const QUESTION_WIRE_STEP_SCHEMAS = DHA_STEP_NAMES.map((name, index) => ({
  type: 'object',
  title: `Pergunta da etapa ${index + 1}`,
  description: 'Uma única pergunta reflexiva vinculada à etapa indicada.',
  additionalProperties: false,
  propertyOrdering: ['numeroEtapa', 'nomeEtapa', 'pergunta'],
  required: ['numeroEtapa', 'nomeEtapa', 'pergunta'],
  properties: {
    numeroEtapa: {
      type: 'integer',
      description: 'Posição fixa desta etapa na sequência.',
      enum: [index + 1],
    },
    nomeEtapa: {
      type: 'string',
      description: 'Nome fixo da etapa correspondente.',
      enum: [name],
    },
    pergunta: {
      type: 'string',
      description: 'Pergunta aberta, breve, neutra e não diagnóstica.',
    },
  },
}));

export const QUESTION_GENERATION_JSON_SCHEMA = {
  type: 'object',
  title: 'Perguntas reflexivas do Método DHA',
  description: 'Contrato wire da Gemini com exatamente uma pergunta para cada etapa.',
  additionalProperties: false,
  propertyOrdering: [
    'reflexaoSequencia',
    'etapas',
    'sinalizacaoSeguranca',
    'aviso',
  ],
  required: [
    'reflexaoSequencia',
    'etapas',
    'sinalizacaoSeguranca',
    'aviso',
  ],
  properties: {
    reflexaoSequencia: {
      type: 'string',
      description: 'Contextualização breve da sequência, sem formular perguntas.',
    },
    etapas: {
      type: 'array',
      description: 'Cinco itens fixos e ordenados, um para cada etapa.',
      prefixItems: QUESTION_WIRE_STEP_SCHEMAS,
      minItems: 5,
      maxItems: 5,
    },
    sinalizacaoSeguranca: {
      type: 'object',
      description: 'Sinalização produzida na mesma chamada, sem diagnóstico.',
      additionalProperties: false,
      propertyOrdering: [
        'requerPausa',
        'requerRevisaoProfissional',
        'motivo',
      ],
      required: ['requerPausa', 'requerRevisaoProfissional', 'motivo'],
      properties: {
        requerPausa: {
          type: 'boolean',
          description: 'Indica se a experiência reflexiva deve ser pausada.',
        },
        requerRevisaoProfissional: {
          type: 'boolean',
          description: 'Indica se é recomendada revisão humana profissional.',
        },
        motivo: {
          type: 'string',
          description: 'Justificativa breve, segura e não diagnóstica.',
        },
      },
    },
    aviso: {
      type: 'string',
      description: 'Aviso de limites da reflexão gerada.',
    },
  },
} as const;

const analysisResponseTypeSchema = z.enum([
  'TEXT',
  'NO_RELATION',
  'DONT_KNOW',
  'PREFER_NOT_TO_ANSWER',
  'SKIPPED',
]);

const analysisQuestionContextSchema = z.object({
  displayOrder: z.number().int().min(1).max(12),
  text: z.string().trim().min(1).max(500),
  responseType: analysisResponseTypeSchema,
  answer: z.string().trim().min(1).max(5000).nullable(),
}).strict().superRefine((question, refinement) => {
  if (question.responseType === 'TEXT' && question.answer === null) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['answer'],
      message: 'Uma resposta textual deve possuir conteúdo.',
    });
  }
  if (question.responseType !== 'TEXT' && question.answer !== null) {
    refinement.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['answer'],
      message: 'Respostas não textuais não devem possuir conteúdo adicional.',
    });
  }
});

const analysisStepContextSchema = z.object({
  number: stepNumberSchema,
  name: z.enum(DHA_STEP_NAMES),
  purpose: z.string().trim().min(1).max(1000),
  word: z.string().trim().min(1).max(80),
  imageDescription: z.string().trim().min(10).max(1000),
  initialImpression: z.string().trim().max(1000).nullable(),
  questions: z.array(analysisQuestionContextSchema).min(1).max(2),
}).strict();

export const analysisGenerationContextSchema = z.object({
  theme: z.string().trim().min(1).max(120),
  initialNarrative: z.string().trim().min(1).max(5000),
  catalogVersion: z.string().trim().min(1).max(40),
  steps: z.array(analysisStepContextSchema).length(5),
  integrativeQuestions: z.array(analysisQuestionContextSchema).max(2),
}).strict().superRefine((context, refinement) => {
  const displayOrders = new Set<number>();
  context.steps.forEach((step, index) => {
    const expectedNumber = index + 1;
    if (step.number !== expectedNumber) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps', index, 'number'],
        message: `A etapa ${expectedNumber} deve ocupar esta posição.`,
      });
    }
    if (step.name !== DHA_STEP_NAMES[index]) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps', index, 'name'],
        message: `O nome esperado é ${DHA_STEP_NAMES[index]}.`,
      });
    }
    step.questions.forEach((question, questionIndex) => {
      if (displayOrders.has(question.displayOrder)) {
        refinement.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'questions', questionIndex, 'displayOrder'],
          message: 'A ordem das perguntas não pode se repetir.',
        });
      }
      displayOrders.add(question.displayOrder);
    });
  });
  context.integrativeQuestions.forEach((question, index) => {
    if (displayOrders.has(question.displayOrder)) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['integrativeQuestions', index, 'displayOrder'],
        message: 'A ordem das perguntas não pode se repetir.',
      });
    }
    displayOrders.add(question.displayOrder);
  });
});

const analysisTextItemSchema = z.string().trim().min(1).max(700);

const analysisStepSchema = z.object({
  numeroEtapa: stepNumberSchema,
  nomeEtapa: z.enum(DHA_STEP_NAMES),
  fatosFundamentados: z.array(analysisTextItemSchema).max(6),
  associacoesParticipante: z.array(analysisTextItemSchema).max(6),
  possibilidadesReflexivas: z.array(analysisTextItemSchema).max(4),
  perguntasAbertas: z.array(analysisTextItemSchema).max(4),
  sintese: z.string().trim().min(1).max(1200),
}).strict();

export const analysisGenerationSchema = z.object({
  resumoCircunstancia: z.string().trim().min(1).max(1800),
  reflexoesEtapas: z.array(analysisStepSchema).length(5),
  sinteseSequencia: z.string().trim().min(1).max(3000),
  conexoesPossiveis: z.array(analysisTextItemSchema).max(5),
  incertezas: z.array(analysisTextItemSchema).min(1).max(8),
  proximasReflexoes: z.array(analysisTextItemSchema).min(1).max(5),
  sinalizacaoSeguranca: safetySignalSchema,
  aviso: z.string().trim().min(1).max(900),
}).strict().superRefine((result, refinement) => {
  result.reflexoesEtapas.forEach((step, index) => {
    const expectedNumber = index + 1;
    if (step.numeroEtapa !== expectedNumber) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reflexoesEtapas', index, 'numeroEtapa'],
        message: `A etapa ${expectedNumber} deve ocupar esta posição.`,
      });
    }
    if (step.nomeEtapa !== DHA_STEP_NAMES[index]) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reflexoesEtapas', index, 'nomeEtapa'],
        message: `O nome esperado é ${DHA_STEP_NAMES[index]}.`,
      });
    }
  });
});

const ANALYSIS_WIRE_STEP_SCHEMAS = DHA_STEP_NAMES.map((name, index) => ({
  type: 'object',
  title: `Reflexão da etapa ${index + 1}`,
  description: 'Reflexão estruturada e não diagnóstica da etapa indicada.',
  additionalProperties: false,
  propertyOrdering: [
    'numeroEtapa',
    'nomeEtapa',
    'fatosFundamentados',
    'associacoesParticipante',
    'possibilidadesReflexivas',
    'perguntasAbertas',
    'sintese',
  ],
  required: [
    'numeroEtapa',
    'nomeEtapa',
    'fatosFundamentados',
    'associacoesParticipante',
    'possibilidadesReflexivas',
    'perguntasAbertas',
    'sintese',
  ],
  properties: {
    numeroEtapa: {
      type: 'integer',
      description: 'Posição fixa desta etapa na sequência.',
      enum: [index + 1],
    },
    nomeEtapa: {
      type: 'string',
      description: 'Nome fixo da etapa correspondente.',
      enum: [name],
    },
    fatosFundamentados: {
      type: 'array',
      description: 'Fatos explicitamente presentes no relato ou nas respostas.',
      maxItems: 6,
      items: {
        type: 'string',
        description: 'Um fato relatado, sem inferência adicional.',
      },
    },
    associacoesParticipante: {
      type: 'array',
      description: 'Associações expressamente feitas pela pessoa participante.',
      maxItems: 6,
      items: {
        type: 'string',
        description: 'Uma associação atribuída explicitamente pela pessoa.',
      },
    },
    possibilidadesReflexivas: {
      type: 'array',
      description: 'Hipóteses abertas apresentadas apenas como possibilidades.',
      maxItems: 4,
      items: {
        type: 'string',
        description: 'Uma possibilidade reflexiva não determinista.',
      },
    },
    perguntasAbertas: {
      type: 'array',
      description: 'Questões que permanecem em aberto sem pressupor respostas.',
      maxItems: 4,
      items: {
        type: 'string',
        description: 'Uma questão aberta e não indutiva.',
      },
    },
    sintese: {
      type: 'string',
      description: 'Síntese breve da etapa, preservando limites e incertezas.',
    },
  },
}));

export const ANALYSIS_GENERATION_JSON_SCHEMA = {
  type: 'object',
  title: 'Análise reflexiva final do Método DHA',
  description: 'Contrato estruturado da análise final, sem diagnóstico ou significado fixo.',
  additionalProperties: false,
  propertyOrdering: [
    'resumoCircunstancia',
    'reflexoesEtapas',
    'sinteseSequencia',
    'conexoesPossiveis',
    'incertezas',
    'proximasReflexoes',
    'sinalizacaoSeguranca',
    'aviso',
  ],
  required: [
    'resumoCircunstancia',
    'reflexoesEtapas',
    'sinteseSequencia',
    'conexoesPossiveis',
    'incertezas',
    'proximasReflexoes',
    'sinalizacaoSeguranca',
    'aviso',
  ],
  properties: {
    resumoCircunstancia: {
      type: 'string',
      description: 'Resumo fiel da circunstância e das respostas fornecidas.',
    },
    reflexoesEtapas: {
      type: 'array',
      description: 'Cinco reflexões fixas e ordenadas, uma por etapa.',
      prefixItems: ANALYSIS_WIRE_STEP_SCHEMAS,
      minItems: 5,
      maxItems: 5,
    },
    sinteseSequencia: {
      type: 'string',
      description: 'Síntese integrada da sequência completa, sem conclusões absolutas.',
    },
    conexoesPossiveis: {
      type: 'array',
      description: 'Conexões possíveis sustentadas pelo contexto fornecido.',
      maxItems: 5,
      items: {
        type: 'string',
        description: 'Uma conexão apresentada explicitamente como possibilidade.',
      },
    },
    incertezas: {
      type: 'array',
      description: 'Limites, ambiguidades e aspectos não determinados pelos dados.',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'string',
        description: 'Uma incerteza que deve permanecer explícita.',
      },
    },
    proximasReflexoes: {
      type: 'array',
      description: 'Convites opcionais para reflexão posterior, sem prescrição.',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'string',
        description: 'Um convite aberto e não imperativo.',
      },
    },
    sinalizacaoSeguranca: {
      type: 'object',
      description: 'Sinalização produzida na mesma chamada, sem diagnóstico.',
      additionalProperties: false,
      propertyOrdering: [
        'requerPausa',
        'requerRevisaoProfissional',
        'motivo',
      ],
      required: ['requerPausa', 'requerRevisaoProfissional', 'motivo'],
      properties: {
        requerPausa: {
          type: 'boolean',
          description: 'Indica se a experiência reflexiva deve ser pausada.',
        },
        requerRevisaoProfissional: {
          type: 'boolean',
          description: 'Indica se é recomendada revisão humana profissional.',
        },
        motivo: {
          type: 'string',
          description: 'Justificativa breve, segura e não diagnóstica.',
        },
      },
    },
    aviso: {
      type: 'string',
      description: 'Aviso de limites da análise reflexiva gerada.',
    },
  },
} as const;

const ayaRoundSchema = z.object({
  reconhecimento: z.string().max(700),
  perguntas: z.array(z.string().max(500)).max(3),
  podeEncerrar: z.boolean(),
  sinalizacaoSeguranca: safetySignalSchema,
}).strict();

export type QuestionGenerationContext = z.infer<typeof questionGenerationContextSchema>;
export type PerguntasGeradas = z.infer<typeof questionGenerationSchema>;
export type AnalysisGenerationContext = z.infer<typeof analysisGenerationContextSchema>;
export type AnaliseGerada = z.infer<typeof analysisGenerationSchema>;
export type AnalysisGenerationResult = AnaliseGerada;
export type RodadaAyaGerada = z.infer<typeof ayaRoundSchema>;

export interface IaInput {
  context: Record<string, unknown>;
}

export interface IaUsage {
  promptTokens: number | null;
  outputTokens: number | null;
  thoughtTokens: number | null;
  totalTokens: number | null;
}

export interface IaProviderResult<T> {
  data: T;
  usage: IaUsage;
  providerRequestId: string | null;
  model: string;
}

export type IaProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'QUOTA_EXHAUSTED'
  | 'SAFETY_BLOCKED'
  | 'INVALID_OUTPUT'
  | 'INVALID_REQUEST'
  | 'TIMEOUT'
  | 'UNAVAILABLE';

export type IaProviderDiagnosticCode =
  | 'EMPTY_RESPONSE'
  | 'MALFORMED_JSON'
  | 'SCHEMA_VALIDATION'
  | 'PROMPT_BLOCKED'
  | 'FINISH_REASON_SAFETY'
  | 'FINISH_REASON_BLOCKLIST'
  | 'FINISH_REASON_PROHIBITED_CONTENT'
  | 'FINISH_REASON_SPII'
  | 'FINISH_REASON_IMAGE_SAFETY'
  | 'FINISH_REASON_IMAGE_PROHIBITED_CONTENT'
  | 'FINISH_REASON_MODEL_ARMOR'
  | 'FINISH_REASON_MAX_TOKENS'
  | 'FINISH_REASON_MALFORMED_FUNCTION_CALL'
  | 'FINISH_REASON_UNEXPECTED_TOOL_CALL'
  | 'FINISH_REASON_NO_IMAGE'
  | 'FINISH_REASON_RECITATION'
  | 'FINISH_REASON_UNSUPPORTED';

export class IaProviderError extends Error {
  constructor(
    public readonly code: IaProviderErrorCode,
    public readonly retryable: boolean,
    public readonly diagnosticCode?: IaProviderDiagnosticCode,
  ) {
    super(code);
    this.name = 'IaProviderError';
  }
}

export interface QuestionGenerationProvider {
  readonly name: 'gemini' | 'demo';
  readonly usesRemoteQuota: boolean;
  readonly model: string;
  gerarPerguntas(context: QuestionGenerationContext): Promise<IaProviderResult<PerguntasGeradas>>;
}

export interface ProvedorIa extends QuestionGenerationProvider {
  gerarAnalise(context: AnalysisGenerationContext): Promise<IaProviderResult<AnaliseGerada>>;
  executarRodadaAya(input: IaInput): Promise<IaProviderResult<RodadaAyaGerada>>;
}

export const INTERNAL_ANALYSIS_SCHEMA = analysisGenerationSchema;
export const INTERNAL_AYA_ROUND_SCHEMA = ayaRoundSchema;
export const PROVEDOR_IA = Symbol('PROVEDOR_IA');
