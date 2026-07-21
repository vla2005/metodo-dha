import { DemoIaProvider } from '../src/ia/demo.provider';
import {
  DHA_STEP_NAMES,
  questionGenerationSchema,
  type QuestionGenerationContext,
} from '../src/ia/provedor-ia';
import { pacificQuotaDate } from '../src/perguntas/quota.service';

const context: QuestionGenerationContext = {
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

describe('contrato da geraÃ§Ã£o de perguntas', () => {
  it('gera no modo demonstrativo uma sequÃªncia vÃ¡lida, local e nÃ£o diagnÃ³stica', async () => {
    const provider = new DemoIaProvider();
    const result = await provider.gerarPerguntas(context);

    expect(questionGenerationSchema.parse(result.data)).toEqual(result.data);
    expect(result.model).toBe('demo-dha-local-v1');
    expect(provider.usesRemoteQuota).toBe(false);
    expect(result.data.etapas).toHaveLength(5);
    expect(result.data.etapas.flatMap((stage) => stage.perguntas)).toHaveLength(5);
    expect(result.data.etapas.every((stage) => stage.perguntas.length === 1)).toBe(true);
    expect(result.data.perguntasIntegradoras).toEqual([]);
    expect(result.data.sinalizacaoSeguranca.requerRevisaoProfissional).toBe(true);
    expect(result.data.aviso.toLocaleLowerCase('pt-BR')).toContain('demonstrativo');
  });

  it('rejeita qualquer sexta pergunta no contrato de novas geraÃ§Ãµes', async () => {
    const provider = new DemoIaProvider();
    const result = await provider.gerarPerguntas(context);
    const extraNaEtapa = structuredClone(result.data);
    extraNaEtapa.etapas[0].perguntas.push('Uma sexta pergunta nÃ£o Ã© permitida?');
    const integrativa = structuredClone(result.data);
    integrativa.perguntasIntegradoras.push('Uma pergunta integradora extra?');

    expect(questionGenerationSchema.safeParse(extraNaEtapa).success).toBe(false);
    expect(questionGenerationSchema.safeParse(integrativa).success).toBe(false);
  });

  it('mantÃ©m a data de cota no fuso do PacÃ­fico, inclusive na virada UTC', () => {
    expect(pacificQuotaDate(new Date('2026-07-18T06:59:59.000Z')).toISOString())
      .toBe('2026-07-17T00:00:00.000Z');
    expect(pacificQuotaDate(new Date('2026-07-18T07:00:00.000Z')).toISOString())
      .toBe('2026-07-18T00:00:00.000Z');
  });
});


