import type { QuestionsSnapshot } from '../types';

export interface InitialMovementInterpretation {
  stepNumber: number;
  stepName: string;
  reveals: string;
  reflectionQuestion: string;
  consciousnessInvitation: string;
  questionId: string;
}

export interface InitialInterpretation {
  sequenceView: string;
  movements: InitialMovementInterpretation[];
  initialSynthesis: string;
  hasExpandedContent: boolean;
}

type UnknownRecord = Record<string, unknown>;

const sectionPattern =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(O que o conjunto revela|Pergunta de reflex[aã]o|Convite [àa] consci[eê]ncia)\s*:?\s*(?:\n|$)/giu;

export function adaptInitialInterpretation(snapshot: QuestionsSnapshot): InitialInterpretation {
  const raw = snapshot as QuestionsSnapshot & UnknownRecord;
  const nested = asRecord(raw.initialInterpretation);
  const portugueseMovements = asArray(raw.etapas);
  const nestedMovements = asArray(nested?.movements);

  const movements = snapshot.questions
    .filter((question) => question.stepNumber !== null)
    .sort((first, second) => first.displayOrder - second.displayOrder)
    .map((question) => {
      const stepNumber = question.stepNumber ?? question.displayOrder;
      const enriched =
        findMovement(nestedMovements, stepNumber) ??
        findMovement(portugueseMovements, stepNumber);
      const parsed = splitLegacyInterpretation(question.text);

      return {
        stepNumber,
        stepName:
          readString(enriched, ['stepName', 'nomeEtapa']) ??
          question.stageName ??
          `Movimento ${stepNumber}`,
        reveals:
          readString(enriched, ['reveals', 'oQueOConjuntoRevela']) ??
          parsed.reveals,
        reflectionQuestion:
          readString(enriched, ['reflectionQuestion', 'perguntaDeReflexao', 'pergunta']) ??
          parsed.reflectionQuestion ??
          question.text,
        consciousnessInvitation:
          readString(enriched, ['consciousnessInvitation', 'conviteAConsciencia']) ??
          parsed.consciousnessInvitation,
        questionId: question.id
      };
    });

  const initialSynthesis =
    readString(nested, ['initialSynthesis']) ??
    readString(raw, ['sinteseInicial']) ??
    '';

  return {
    sequenceView:
      readString(nested, ['sequenceView']) ??
      readString(raw, ['visaoSequencia']) ??
      snapshot.reflectionSequence,
    movements,
    initialSynthesis,
    hasExpandedContent: movements.every(
      (movement) => movement.reveals && movement.consciousnessInvitation
    )
  };
}

function splitLegacyInterpretation(text: string): {
  reveals: string;
  reflectionQuestion: string;
  consciousnessInvitation: string;
} {
  const matches = Array.from(text.matchAll(sectionPattern));
  if (matches.length < 2) {
    return {
      reveals: '',
      reflectionQuestion: text,
      consciousnessInvitation: ''
    };
  }

  const sections: Record<string, string> = {};
  matches.forEach((match, index) => {
    const title = normalizeSectionTitle(match[1] ?? '');
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    sections[title] = text.slice(start, end).trim();
  });

  return {
    reveals: sections.reveals ?? '',
    reflectionQuestion: sections.reflectionQuestion ?? '',
    consciousnessInvitation: sections.consciousnessInvitation ?? ''
  };
}

function normalizeSectionTitle(title: string): string {
  const normalized = title.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (normalized.startsWith('o que')) return 'reveals';
  if (normalized.startsWith('pergunta')) return 'reflectionQuestion';
  return 'consciousnessInvitation';
}

function findMovement(items: unknown[], stepNumber: number): UnknownRecord | null {
  for (const item of items) {
    const movement = asRecord(item);
    if (!movement) continue;
    const candidate = movement.stepNumber ?? movement.numeroEtapa;
    if (Number(candidate) === stepNumber) return movement;
  }
  return null;
}

function readString(record: UnknownRecord | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
