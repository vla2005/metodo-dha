import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleNotch,
  Eye,
  Quotes,
  Sparkle
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { adaptInitialInterpretation } from '../adapters/initial-interpretation.adapter';
import { apiUrl } from '../api';
import type {
  Journey,
  QuestionResponseType,
  QuestionsSnapshot,
  ReflectiveQuestion
} from '../types';
import { useMotionPreference } from './MotionPreference';

interface InitialInterpretationPageProps {
  journey: Journey;
  snapshot: QuestionsSnapshot;
  busy: boolean;
  error: string;
  onSave: (
    question: ReflectiveQuestion,
    responseType: QuestionResponseType,
    text?: string
  ) => Promise<boolean>;
}

export function InitialInterpretationPage({
  journey,
  snapshot,
  busy,
  error,
  onSave
}: InitialInterpretationPageProps) {
  const { reducedMotion } = useMotionPreference();
  const interpretation = useMemo(() => adaptInitialInterpretation(snapshot), [snapshot]);
  const orderedQuestions = useMemo(
    () => snapshot.questions.slice().sort((first, second) => first.displayOrder - second.displayOrder),
    [snapshot.questions]
  );
  const firstPending = Math.max(
    0,
    orderedQuestions.findIndex((question) => !question.answer)
  );
  const [activeIndex, setActiveIndex] = useState(firstPending);
  const movementRef = useRef<HTMLDivElement>(null);
  const previousIndex = useRef(activeIndex);

  useEffect(() => {
    setActiveIndex(firstPending);
  }, [firstPending, snapshot.answeredCount]);

  useEffect(() => {
    if (previousIndex.current === activeIndex) return;
    previousIndex.current = activeIndex;

    const frame = window.requestAnimationFrame(() => {
      movementRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, reducedMotion]);

  const activeMovement = interpretation.movements[activeIndex] ?? interpretation.movements[0];
  const activeQuestion = activeMovement
    ? orderedQuestions.find((question) => question.id === activeMovement.questionId)
    : undefined;

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      aria-labelledby="initial-interpretation-title"
    >
      <header className="max-w-4xl">
        <span className="eyebrow">Interpretação inicial</span>
        <h1
          id="initial-interpretation-title"
          className="mt-3 font-display text-5xl leading-[0.98] tracking-[-0.035em] md:text-7xl"
        >
          Uma primeira leitura do seu percurso.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-muted md:text-lg">
          Esta leitura considera a circunstância relatada, a relação entre palavra e imagem e a
          sequência completa dos cinco movimentos.
        </p>
      </header>

      <div className="mt-8 flex items-start gap-3 border-l-2 border-accent bg-accent/5 px-5 py-4 text-sm leading-6 text-muted">
        <Eye className="mt-0.5 shrink-0 text-accent" size={20} aria-hidden="true" />
        <p>
          {interpretation.disclaimer ||
            'Esta leitura é simbólica e reflexiva. As combinações não possuem significados fixos. Considere apenas o que fizer sentido para sua experiência.'}
        </p>
      </div>

      <section className="surface mt-10 grid gap-6 p-7 md:grid-cols-[auto_1fr] md:p-10" aria-labelledby="sequence-view-title">
        <Quotes className="text-accent" size={31} weight="light" aria-hidden="true" />
        <div>
          <p className="eyebrow">Visão da sequência</p>
          <h2 id="sequence-view-title" className="mt-3 font-display text-3xl leading-tight md:text-4xl">
            Os cinco movimentos em conjunto
          </h2>
          <p className="mt-5 max-w-4xl whitespace-pre-line font-serif text-xl leading-8 text-ink/85">
            {interpretation.sequenceView}
          </p>
        </div>
      </section>

      {!interpretation.hasExpandedContent && (
        <p className="mt-4 text-xs leading-5 text-muted">
          A versão atual desta jornada disponibilizou a visão da sequência e a pergunta de cada
          movimento. Blocos adicionais aparecem automaticamente quando fornecidos pela interpretação.
        </p>
      )}

      <div ref={movementRef} className="mt-10 scroll-mt-24">
        <div className="flex items-center justify-between gap-4 text-sm font-medium text-muted">
          <span>Movimento {activeIndex + 1} de {interpretation.movements.length}</span>
          <span>{snapshot.answeredCount} de {snapshot.totalCount} respondidos</span>
        </div>
        <Progress answered={snapshot.answeredCount} total={snapshot.totalCount} />

        {activeMovement && activeQuestion && (
          <MovementCard
            key={activeQuestion.id}
            journey={journey}
            movement={activeMovement}
            question={activeQuestion}
            busy={busy}
            error={error}
            onSave={onSave}
          />
        )}

        <nav className="mt-5 grid grid-cols-2 gap-3" aria-label="Navegação entre os movimentos">
          <button
            type="button"
            className="button-secondary"
            disabled={activeIndex === 0}
            onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Anterior
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={activeIndex >= interpretation.movements.length - 1}
            onClick={() =>
              setActiveIndex((current) => Math.min(interpretation.movements.length - 1, current + 1))
            }
          >
            Próximo
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </nav>
      </div>

      {interpretation.initialSynthesis && activeIndex === interpretation.movements.length - 1 && (
        <section className="brand-grid brand-grid-dark mt-12 border border-gold/25 bg-night p-7 text-paper md:p-11" aria-labelledby="initial-synthesis-title">
          <Sparkle className="text-gold-pale" size={26} weight="light" aria-hidden="true" />
          <p className="mt-6 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold-pale/65">
            Síntese da leitura
          </p>
          <h2 id="initial-synthesis-title" className="mt-3 font-display text-4xl font-light leading-tight md:text-5xl">
            Uma integração inicial do percurso
          </h2>
          <p className="mt-6 max-w-4xl whitespace-pre-line font-serif text-xl leading-8 text-paper/82">
            {interpretation.initialSynthesis}
          </p>
          <p className="mt-7 border-t border-gold-pale/15 pt-5 text-sm leading-6 text-paper/60">
            Esta é uma leitura inicial. Suas respostas serão consideradas na próxima etapa para
            aprofundar a reflexão.
          </p>
        </section>
      )}
    </motion.section>
  );
}

function MovementCard({
  journey,
  movement,
  question,
  busy,
  error,
  onSave
}: {
  journey: Journey;
  movement: ReturnType<typeof adaptInitialInterpretation>['movements'][number];
  question: ReflectiveQuestion;
  busy: boolean;
  error: string;
  onSave: InitialInterpretationPageProps['onSave'];
}) {
  const set = journey.sets.find((item) => item.position === movement.stepNumber);
  const [draft, setDraft] = useState(question.answer?.text ?? '');

  useEffect(() => {
    setDraft(question.answer?.text ?? '');
  }, [question.answer?.text, question.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = draft.trim();
    if (!answer || question.answer) return;
    await onSave(question, 'TEXT', answer);
  }

  async function choose(responseType: Exclude<QuestionResponseType, 'TEXT'>) {
    if (question.answer) return;
    await onSave(question, responseType);
  }

  return (
    <article className="mt-6 border border-ink/15 bg-paper shadow-card lg:mt-0" aria-labelledby={`movement-${movement.stepNumber}-title`}>
      <header className="grid border-b border-ink/15 md:grid-cols-[16rem_1fr]">
        <div className="border-b border-ink/15 bg-sand/50 p-5 md:border-b-0 md:border-r md:p-7">
          <p className="eyebrow">Movimento {movement.stepNumber}</p>
          <h2 id={`movement-${movement.stepNumber}-title`} className="mt-3 font-display text-3xl leading-tight">
            {movement.stepName}
          </h2>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Palavra</p>
          <p className="mt-2 font-display text-3xl text-ink">{set?.wordCard?.word}</p>
          {set?.imageCard && (
            <>
              <img
                className="mt-6 aspect-square w-full bg-canvas object-contain p-2"
                src={apiUrl(set.imageCard.url)}
                alt={set.imageCard.alternativeText}
              />
              <p className="mt-3 text-xs leading-5 text-muted">{set.imageCard.objectiveDescription}</p>
            </>
          )}
          {set?.initialImpression && (
            <div className="mt-5 border-t border-ink/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Sua impressão inicial</p>
              <p className="mt-2 text-sm leading-6 text-ink/80">{set.initialImpression}</p>
            </div>
          )}
        </div>

        <div className="p-6 md:p-9">
          {movement.reveals && (
            <section>
              <p className="eyebrow">Leitura simbólica</p>
              <h3 className="mt-3 font-display text-2xl md:text-3xl">O que o conjunto revela</h3>
              <p className="mt-4 whitespace-pre-line font-serif text-xl leading-8 text-ink/85">
                {movement.reveals}
              </p>
            </section>
          )}

          <section className={movement.reveals ? 'mt-8 border-t border-ink/10 pt-7' : ''}>
            <p className="eyebrow">Pergunta de reflexão</p>
            <h3 className="mt-3 max-w-3xl font-display text-2xl leading-snug md:text-3xl">
              {movement.reflectionQuestion}
            </h3>

            {question.answer ? (
              <SavedAnswer question={question} />
            ) : (
              <form className="mt-7" onSubmit={(event) => void submit(event)} aria-busy={busy}>
                <label className="block text-sm font-semibold" htmlFor={`answer-${question.id}`}>
                  Sua resposta
                </label>
                <textarea
                  id={`answer-${question.id}`}
                  className="mt-2"
                  rows={5}
                  maxLength={5000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={busy}
                  placeholder="Escreva o que surge para você. Não existe uma resposta certa."
                />
                <div className="mt-2 flex justify-end text-xs text-muted">{draft.length}/5000</div>
                {error && <p className="mt-4 text-sm leading-6 text-danger" role="alert">{error}</p>}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button className="button" disabled={busy || !draft.trim()}>
                    {busy ? (
                      <>
                        <CircleNotch className="animate-spin" size={18} aria-hidden="true" />
                        Salvando…
                      </>
                    ) : (
                      <>
                        Salvar resposta
                        <Check size={18} aria-hidden="true" />
                      </>
                    )}
                  </button>
                  <button type="button" className="choice-button" disabled={busy} onClick={() => void choose('DONT_KNOW')}>
                    Não sei responder agora
                  </button>
                  <button type="button" className="choice-button" disabled={busy} onClick={() => void choose('NO_RELATION')}>
                    Não percebo relação
                  </button>
                  <button type="button" className="choice-button" disabled={busy} onClick={() => void choose('PREFER_NOT_TO_ANSWER')}>
                    Prefiro não responder
                  </button>
                </div>
              </form>
            )}
          </section>

          {movement.consciousnessInvitation && (
            <section className="mt-8 border-l-2 border-gold bg-gold/5 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bronze">Convite à consciência</p>
              <p className="mt-3 font-serif text-lg italic leading-7 text-ink/80">
                {movement.consciousnessInvitation}
              </p>
            </section>
          )}
        </div>
      </header>
    </article>
  );
}

function SavedAnswer({ question }: { question: ReflectiveQuestion }) {
  const answerLabels: Record<QuestionResponseType, string> = {
    TEXT: question.answer?.text ?? '',
    DONT_KNOW: 'Não sei responder agora',
    NO_RELATION: 'Não percebo relação',
    PREFER_NOT_TO_ANSWER: 'Prefiro não responder',
    SKIPPED: 'Pergunta pulada'
  };
  const label = question.answer ? answerLabels[question.answer.responseType] : '';

  return (
    <div className="mt-6 flex items-start gap-3 border border-success/25 bg-success/5 p-4 text-sm leading-6">
      <Check className="mt-0.5 shrink-0 text-success" size={19} weight="bold" aria-hidden="true" />
      <div>
        <p className="font-semibold text-success">Resposta registrada</p>
        <p className="mt-1 whitespace-pre-line text-muted">{label}</p>
      </div>
    </div>
  );
}

function Progress({ answered, total }: { answered: number; total: number }) {
  const percentage = total ? Math.round((answered / total) * 100) : 0;
  return (
    <div
      className="mt-3 h-1.5 overflow-hidden bg-ink/10"
      role="progressbar"
      aria-label="Progresso das respostas"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={answered}
    >
      <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${percentage}%` }} />
    </div>
  );
}
