import { parseInitialInterpretation } from '../src/ia/initial-interpretation';
import {
  DHA_STEP_NAMES,
  questionGenerationSchema,
} from '../src/ia/provedor-ia';

function generatedWith(content: (index: number) => string, sequence: string) {
  return questionGenerationSchema.parse({
    reflexaoSequencia: sequence,
    etapas: DHA_STEP_NAMES.map((nomeEtapa, index) => ({
      numeroEtapa: index + 1,
      nomeEtapa,
      perguntas: [content(index)],
    })),
    perguntasIntegradoras: [],
    sinalizacaoSeguranca: {
      requerPausa: false,
      requerRevisaoProfissional: false,
      motivo: '',
    },
    aviso: 'Leitura simbólica e não diagnóstica.',
  });
}

describe('parseInitialInterpretation', () => {
  it('separa sequência, síntese e os três blocos de cada movimento', () => {
    const generated = generatedWith(
      (index) => [
        'O que o conjunto revela:',
        `Leitura possível ${index + 1}.`,
        '',
        'Pergunta de reflexão:',
        `Pergunta ${index + 1}?`,
        '',
        'Convite à consciência:',
        `Convite ${index + 1}.`,
      ].join('\n'),
      [
        'Visão da sequência:',
        'Visão inicial.',
        '',
        'Síntese da leitura:',
        'Síntese inicial.',
      ].join('\n'),
    );

    const parsed = parseInitialInterpretation(generated);

    expect(parsed.sequenceView).toBe('Visão inicial.');
    expect(parsed.initialSynthesis).toBe('Síntese inicial.');
    expect(parsed.movements).toHaveLength(5);
    expect(parsed.movements[0]).toMatchObject({
      whatTheSetReveals: 'Leitura possível 1.',
      reflectionQuestion: 'Pergunta 1?',
      consciousnessInvitation: 'Convite 1.',
    });
  });

  it('preserva perguntas antigas sem criar interpretação ausente', () => {
    const generated = generatedWith(
      (index) => `Pergunta legada ${index + 1}?`,
      'Reflexão legada da sequência.',
    );

    const parsed = parseInitialInterpretation(generated);

    expect(parsed.sequenceView).toBe('Reflexão legada da sequência.');
    expect(parsed.initialSynthesis).toBe('');
    expect(parsed.movements[0]).toMatchObject({
      whatTheSetReveals: '',
      reflectionQuestion: 'Pergunta legada 1?',
      consciousnessInvitation: '',
    });
  });
});
