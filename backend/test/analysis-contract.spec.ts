import { DemoIaProvider } from '../src/ia/demo.provider';
import {
  DHA_STEP_NAMES,
  analysisGenerationContextSchema,
  analysisGenerationSchema,
  type AnalysisGenerationContext,
} from '../src/ia/provedor-ia';

const context: AnalysisGenerationContext = analysisGenerationContextSchema.parse({
  theme: 'Relacionamentos',
  initialNarrative: 'Quero observar uma situaÃ§Ã£o importante com mais calma.',
  catalogVersion: 'dha-2026-v1',
  steps: DHA_STEP_NAMES.map((name, index) => ({
    number: index + 1,
    name,
    purpose: `FunÃ§Ã£o reflexiva da etapa ${index + 1}.`,
    word: `Palavra ${index + 1}`,
    imageDescription: `DescriÃ§Ã£o objetiva suficientemente detalhada da imagem ${index + 1}.`,
    initialImpression: index === 0 ? 'Uma associaÃ§Ã£o feita pela prÃ³pria pessoa.' : null,
    questions: [{
      displayOrder: index + 1,
      text: `Pergunta reflexiva da etapa ${index + 1}?`,
      responseType: 'TEXT',
      answer: `Resposta explÃ­cita da etapa ${index + 1}.`,
    }],
  })),
  integrativeQuestions: [],
});

describe('contrato da anÃ¡lise final', () => {
  it('produz no modo demonstrativo a estrutura completa das cinco etapas', async () => {
    const provider = new DemoIaProvider();
    const result = await provider.gerarAnalise(context);

    expect(analysisGenerationSchema.parse(result.data)).toEqual(result.data);
    expect(result.data.reflexoesEtapas).toHaveLength(5);
    expect(result.data.reflexoesEtapas.map((stage) => stage.nomeEtapa))
      .toEqual(DHA_STEP_NAMES);
    expect(result.data.incertezas.length).toBeGreaterThan(0);
    expect(result.data.proximasReflexoes.length).toBeGreaterThan(0);
    expect(result.data).toHaveProperty('conexoesPossiveis');
  });

  it('rejeita etapas fora de ordem e anÃ¡lises sem incerteza explÃ­cita', async () => {
    const provider = new DemoIaProvider();
    const result = await provider.gerarAnalise(context);
    const wrongOrder = structuredClone(result.data);
    const firstStage = wrongOrder.reflexoesEtapas[0];
    wrongOrder.reflexoesEtapas[0] = wrongOrder.reflexoesEtapas[1];
    wrongOrder.reflexoesEtapas[1] = firstStage;
    const withoutUncertainty = structuredClone(result.data);
    withoutUncertainty.incertezas = [];

    expect(analysisGenerationSchema.safeParse(wrongOrder).success).toBe(false);
    expect(analysisGenerationSchema.safeParse(withoutUncertainty).success).toBe(false);
  });

  it('nÃ£o aceita texto adicional em respostas marcadas como ausÃªncia de relaÃ§Ã£o', () => {
    const invalidContext = structuredClone(context);
    invalidContext.steps[0].questions[0] = {
      ...invalidContext.steps[0].questions[0],
      responseType: 'NO_RELATION',
      answer: 'Texto que nÃ£o deveria acompanhar esta opÃ§Ã£o.',
    };

    expect(analysisGenerationContextSchema.safeParse(invalidContext).success).toBe(false);
  });
});


