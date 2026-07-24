import type { PerguntasGeradas } from './provedor-ia';

export interface InitialInterpretationMovement {
  stepNumber: number;
  stepName: string;
  whatTheSetReveals: string;
  reflectionQuestion: string;
  consciousnessInvitation: string;
}

export interface InitialInterpretation {
  sequenceView: string;
  movements: InitialInterpretationMovement[];
  initialSynthesis: string;
  disclaimer: string;
}

const MOVEMENT_TITLES = {
  reveal: 'O que o conjunto revela:',
  question: 'Pergunta de reflexão:',
  invitation: 'Convite à consciência:',
} as const;

const SEQUENCE_TITLES = {
  view: 'Visão da sequência:',
  synthesis: 'Síntese da leitura:',
} as const;

/**
 * Normaliza o contrato de compatibilidade usado pela primeira geração.
 * Jornadas antigas, que possuíam somente perguntas, continuam legíveis sem
 * receber conteúdo interpretativo inventado.
 */
export function parseInitialInterpretation(
  generated: PerguntasGeradas,
): InitialInterpretation {
  const sequence = splitSequence(generated.reflexaoSequencia);

  return {
    sequenceView: sequence.sequenceView,
    initialSynthesis: sequence.initialSynthesis,
    movements: generated.etapas.map((stage) => ({
      stepNumber: stage.numeroEtapa,
      stepName: stage.nomeEtapa,
      ...splitMovement(stage.perguntas[0] ?? ''),
    })),
    disclaimer: generated.aviso,
  };
}

function splitSequence(text: string): {
  sequenceView: string;
  initialSynthesis: string;
} {
  const viewIndex = text.indexOf(SEQUENCE_TITLES.view);
  const synthesisIndex = text.indexOf(SEQUENCE_TITLES.synthesis);

  if (viewIndex < 0 || synthesisIndex <= viewIndex) {
    return {
      sequenceView: text.trim(),
      initialSynthesis: '',
    };
  }

  return {
    sequenceView: text
      .slice(viewIndex + SEQUENCE_TITLES.view.length, synthesisIndex)
      .trim(),
    initialSynthesis: text
      .slice(synthesisIndex + SEQUENCE_TITLES.synthesis.length)
      .trim(),
  };
}

function splitMovement(text: string): {
  whatTheSetReveals: string;
  reflectionQuestion: string;
  consciousnessInvitation: string;
} {
  const revealIndex = text.indexOf(MOVEMENT_TITLES.reveal);
  const questionIndex = text.indexOf(MOVEMENT_TITLES.question);
  const invitationIndex = text.indexOf(MOVEMENT_TITLES.invitation);

  if (
    revealIndex < 0 ||
    questionIndex <= revealIndex ||
    invitationIndex <= questionIndex
  ) {
    return {
      whatTheSetReveals: '',
      reflectionQuestion: text.trim(),
      consciousnessInvitation: '',
    };
  }

  return {
    whatTheSetReveals: text
      .slice(revealIndex + MOVEMENT_TITLES.reveal.length, questionIndex)
      .trim(),
    reflectionQuestion: text
      .slice(questionIndex + MOVEMENT_TITLES.question.length, invitationIndex)
      .trim(),
    consciousnessInvitation: text
      .slice(invitationIndex + MOVEMENT_TITLES.invitation.length)
      .trim(),
  };
}
