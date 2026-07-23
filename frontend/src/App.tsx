import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  Eye,
  HandTap,
  LockKey,
  SignOut,
  Sparkle,
  WarningCircle,
  X
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiClientError, apiUrl } from './api';
import { BrandLogo, BrandSymbol } from './components/BrandLogo';
import { FinalAnalysis } from './components/FinalAnalysis';
import { InitialInterpretationPage } from './components/InitialInterpretationPage';
import { LandingPage } from './components/LandingPage';
import { useMotionPreference } from './components/MotionPreference';
import type {
  Journey,
  QuestionResponseType,
  QuestionsSnapshot,
  ReflectiveQuestion,
  Theme
} from './types';

const labels = [
  'Circunstância percebida',
  'História',
  'Condicionamentos',
  'Consciência',
  'Escolha consciente'
];

const questionStatuses = new Set<Journey['status']>([
  'CARTAS_CONCLUIDAS',
  'PERGUNTAS_DISPONIVEIS',
  'RESPOSTAS_CONCLUIDAS'
]);

export function App() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState('');
  const journeyViewKey = journey
    ? `${journey.status}:${journey.currentStep}`
    : 'landing';

  useScrollToTopOnChange(journeyViewKey, !loading);

  const restore = useCallback(async () => {
    try {
      setJourney(await api<Journey>('/journeys/session/current'));
    } catch (caught) {
      if (
        !(caught instanceof ApiClientError) ||
        !['PUBLIC_SESSION_REQUIRED', 'PUBLIC_SESSION_EXPIRED'].includes(caught.code)
      ) {
        setError(errorMessage(caught));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void api<Theme[]>('/themes')
      .then(setThemes)
      .catch((caught) => setError(errorMessage(caught)));
    void restore();
  }, [restore]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAction('create');
    setError('');
    const data = new FormData(event.currentTarget);

    try {
      const created = await api<{ publicId: string }>('/journeys', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          themeKey: data.get('themeKey'),
          circumstanceText: data.get('circumstanceText'),
          consents: ['INFORMED', 'PRIVACY', 'SENSITIVE_DATA'].map((consentType) => ({
            consentType,
            consentVersion: '2026-07-v1',
            accepted: true
          }))
        })
      });
      setJourney(await api<Journey>(`/journeys/${created.publicId}`));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAction(null);
    }
  }

  async function mutate(path: string, key: string) {
    if (!journey || action) return;
    setAction(key);
    setError('');

    try {
      await api(path, { method: 'POST' });
      setJourney(await api<Journey>(`/journeys/${journey.publicId}/progress`));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAction(null);
    }
  }

  async function endJourney(): Promise<boolean> {
    if (!journey || action) return false;
    setAction('end');
    setError('');

    try {
      await api(`/journeys/${journey.publicId}/session`, { method: 'DELETE' });
      setJourney(null);
      window.scrollTo({ top: 0, behavior: 'auto' });
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!journey) {
    return (
      <LandingPage
        themes={themes}
        busy={action === 'create'}
        error={error}
        onSubmit={create}
      />
    );
  }

  let content: ReactNode;
  if (journey.status === 'EM_PREPARACAO') {
    content = (
      <Preparation
        busy={!!action}
        onContinue={() => void mutate(`/journeys/${journey.publicId}/advance`, 'advance')}
      />
    );
  } else if (journey.status === 'EM_TIRAGEM') {
    content = <Draw key={journey.currentStep} journey={journey} busy={action} onAction={mutate} />;
  } else if (questionStatuses.has(journey.status)) {
    content = <QuestionsFlow journey={journey} />;
  } else {
    content = (
      <div className="surface p-6 md:p-8" role="status">
        Esta etapa da jornada ainda não está disponível.
      </div>
    );
  }

  return (
    <JourneyShell ending={action === 'end'} onEndJourney={endJourney}>
      {error && <ErrorNotice message={error} />}
      {content}
    </JourneyShell>
  );
}

function LoadingScreen() {
  const { reducedMotion } = useMotionPreference();

  return (
    <main className="site-texture brand-grid grid min-h-[100dvh] place-items-center overflow-hidden bg-canvas px-5 text-ink">
      <div className="max-w-sm text-center" role="status" aria-live="polite">
        <div className="relative mx-auto h-28 w-28">
          <motion.span
            className="absolute inset-0 rounded-full border border-gold/35"
            animate={reducedMotion ? undefined : { rotate: 360 }}
            transition={reducedMotion ? undefined : { duration: 18, repeat: Infinity, ease: 'linear' }}
            aria-hidden="true"
          >
            <span className="absolute left-3 top-2 h-2 w-2 rounded-full bg-gold" />
          </motion.span>
          <BrandSymbol className="absolute inset-3" animated />
        </div>
        <div className="mx-auto mt-8 w-fit"><BrandLogo compact /></div>
        <h1 className="mt-7 font-display text-3xl font-light leading-tight">Retomando seu espaço de observação</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Verificando com segurança se há uma jornada em andamento neste navegador.
        </p>
      </div>
    </main>
  );
}

function JourneyShell({
  children,
  ending,
  onEndJourney
}: {
  children: ReactNode;
  ending: boolean;
  onEndJourney: () => Promise<boolean>;
}) {
  const { reducedMotion } = useMotionPreference();
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  return (
    <div className="site-texture brand-grid min-h-[100dvh] bg-canvas text-ink">
      <a
        href="#journey-content"
        className="fixed left-4 top-3 z-50 -translate-y-20 rounded-lg bg-night px-4 py-3 text-sm font-semibold text-gold-pale transition-transform focus:translate-y-0"
      >
        Ir para o conteúdo
      </a>
      <header className="sticky top-0 z-30 border-b border-bronze/15 bg-canvas/95 shadow-[0_10px_35px_-28px_rgba(67,43,17,0.6)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-4 md:px-8">
          <BrandLogo compact />
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 whitespace-nowrap text-[0.68rem] font-medium text-muted sm:text-xs">
              <motion.span
                className="h-2 w-2 rounded-full bg-gold"
                animate={reducedMotion ? undefined : { opacity: [0.45, 1, 0.45], scale: [1, 1.16, 1] }}
                transition={reducedMotion ? undefined : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden="true"
              />
              <span className="sm:hidden">Em andamento</span>
              <span className="hidden sm:inline">Jornada em andamento</span>
            </div>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-danger/35 bg-paper/60 px-3 text-xs font-semibold text-danger transition-[transform,border-color,background-color] duration-200 hover:border-danger/70 hover:bg-danger/5 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:px-4"
              onClick={() => setConfirmingEnd(true)}
              disabled={ending}
            >
              <SignOut size={17} weight="bold" aria-hidden="true" />
              <span className="sm:hidden">Encerrar</span>
              <span className="hidden sm:inline">Encerrar jornada</span>
            </button>
          </div>
        </div>
      </header>
      <main id="journey-content" className="relative z-10 mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-16">
        {children}
      </main>
      <footer className="relative z-10 mx-auto flex max-w-5xl flex-col gap-4 border-t border-bronze/15 px-5 py-8 text-xs leading-relaxed text-muted md:flex-row md:items-center md:justify-between md:px-8">
        <BrandLogo compact />
        <span>Uma experiência reflexiva — não é diagnóstico, previsão ou substituto de cuidado profissional.</span>
      </footer>
      <EndJourneyDialog
        open={confirmingEnd}
        busy={ending}
        onClose={() => setConfirmingEnd(false)}
        onConfirm={async () => {
          const ended = await onEndJourney();
          if (!ended) setConfirmingEnd(false);
        }}
      />
    </div>
  );
}

function EndJourneyDialog({
  open,
  busy,
  onClose,
  onConfirm
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const keepJourneyButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => keepJourneyButton.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [busy, onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-center bg-night/55 px-5 py-8 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-journey-title"
            aria-describedby="end-journey-description"
            className="relative w-full max-w-lg border border-bronze/25 bg-paper p-6 shadow-lift md:p-8"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 130, damping: 22 }}
          >
            <button
              type="button"
              aria-label="Fechar confirmação"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-lg text-muted transition-colors hover:bg-sand hover:text-ink disabled:opacity-50"
              onClick={onClose}
              disabled={busy}
            >
              <X size={20} aria-hidden="true" />
            </button>
            <span className="eyebrow">Antes de sair</span>
            <h2 id="end-journey-title" className="mt-3 max-w-sm font-display text-3xl font-medium leading-tight tracking-[-0.025em]">
              Deseja encerrar esta jornada?
            </h2>
            <p id="end-journey-description" className="mt-4 max-w-md text-sm leading-relaxed text-muted md:text-base">
              Você voltará ao início e não poderá retomar esta jornada neste navegador. Os dados já
              registrados não são apagados automaticamente.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                ref={keepJourneyButton}
                type="button"
                className="button-secondary w-full"
                onClick={onClose}
                disabled={busy}
              >
                Continuar jornada
              </button>
              <button
                type="button"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-danger px-5 py-3 text-sm font-semibold text-white transition-[transform,background-color] duration-200 hover:bg-[#7d3022] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                onClick={() => void onConfirm()}
                disabled={busy}
              >
                {busy ? <CircleNotch className="animate-spin" size={18} aria-hidden="true" /> : <SignOut size={18} weight="bold" aria-hidden="true" />}
                {busy ? 'Encerrando…' : 'Sim, encerrar'}
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="max-w-2xl">
      <span className="eyebrow">{eyebrow}</span>
      <h1 id={id} className="mt-3 text-balance font-display text-4xl font-light leading-[1.02] tracking-[-0.035em] md:text-6xl">
        {title}
      </h1>
      {description && <p className="mt-5 max-w-xl text-base leading-relaxed text-muted md:text-lg">{description}</p>}
    </header>
  );
}

function Preparation({ busy, onContinue }: { busy: boolean; onContinue: () => void }) {
  const { reducedMotion } = useMotionPreference();

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]"
    >
      <div>
        <SectionHeading
          eyebrow="Antes do primeiro movimento"
          title="Diminua o ritmo por um instante."
          description="Acomode-se. Respire lentamente algumas vezes e traga à mente a circunstância que você relatou. Não é necessário buscar respostas agora."
        />
        <div className="mt-8 flex items-start gap-3 border-l border-accent/50 pl-4 text-sm leading-relaxed text-muted">
          <Eye className="mt-0.5 shrink-0 text-accent" size={19} aria-hidden="true" />
          <p>Você não precisa interpretar ou concluir nada. Apenas observe o que surgir.</p>
        </div>
        <button disabled={busy} onClick={onContinue} className="button mt-9" type="button">
          {busy ? (
            <>
              <CircleNotch className="animate-spin" size={18} aria-hidden="true" />
              Preparando…
            </>
          ) : (
            <>
              Estou pronta(o)
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
      <div className="brand-grid brand-grid-dark relative mx-auto aspect-square w-full max-w-[25rem] overflow-hidden border border-gold/25 bg-night shadow-lift">
        <motion.div
          className="absolute inset-[10%] grid place-items-center rounded-full border border-gold-pale/15"
          animate={reducedMotion ? undefined : { scale: [1, 1.035, 1], opacity: [0.55, 0.9, 0.55] }}
          transition={reducedMotion ? undefined : { duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.div
            className="grid h-[66%] w-[66%] place-items-center rounded-full border border-gold/35"
            animate={reducedMotion ? undefined : { scale: [1, 1.045, 1] }}
            transition={reducedMotion ? undefined : { duration: 5.8, delay: 0.45, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="grid h-[54%] w-[54%] place-items-center rounded-full bg-paper/95">
              <BrandSymbol className="h-[86%] w-[86%]" animated />
            </div>
          </motion.div>
        </motion.div>
        <Sparkle className="absolute right-5 top-5 text-gold" size={20} weight="light" aria-hidden="true" />
        <span className="absolute bottom-5 left-5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-gold-pale/55">
          Presença antes da resposta
        </span>
      </div>
    </motion.section>
  );
}

function Draw({
  journey,
  busy,
  onAction
}: {
  journey: Journey;
  busy: string | null;
  onAction: (path: string, key: string) => Promise<void>;
}) {
  const { reducedMotion } = useMotionPreference();
  const position = journey.currentStep;
  const set = journey.sets.find((item) => item.position === position);
  const word = set?.wordCard;
  const image = set?.imageCard;
  const instruction = !word
    ? {
        step: '1',
        title: 'Primeiro, clique na carta de palavra',
        description: 'Toque diretamente na carta marrom para revelar a palavra deste movimento.'
      }
    : !image
      ? {
          step: '2',
          title: 'Agora, clique na carta de imagem',
          description: 'A carta verde está liberada. Toque nela para revelar a imagem.'
        }
      : {
          step: '✓',
          title: 'As duas cartas foram reveladas',
          description: 'Observe a combinação por alguns instantes antes de continuar.'
        };

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      aria-labelledby="draw-title"
    >
      <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <SectionHeading
          id="draw-title"
          eyebrow={`Movimento ${position} de 5`}
          title={labels[position - 1]}
          description="Revele uma carta de cada vez, clicando na própria carta. A combinação ficará registrada nesta jornada."
        />
        <div className="flex shrink-0 items-center gap-3 text-sm font-medium text-muted">
          <span className="font-display text-3xl text-ink">{Math.round((position / 5) * 100)}</span>
          <span className="max-w-16 leading-tight">por cento do percurso</span>
        </div>
      </div>
      <div
        className="relative mt-10 border-t border-bronze/20"
        role="progressbar"
        aria-label="Progresso dos movimentos"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={position}
      >
        <div className="-mt-4 flex items-center justify-between">
          {labels.map((label, index) => (
            <motion.span
              key={label}
              className={`grid h-8 w-8 place-items-center rounded-full border text-[0.62rem] font-semibold ${
                index < position
                  ? 'border-bronze bg-night text-gold-pale'
                  : 'border-line bg-canvas text-muted'
              }`}
              animate={!reducedMotion && index === position - 1 ? { scale: [1, 1.08, 1] } : undefined}
              transition={!reducedMotion && index === position - 1 ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
              aria-hidden="true"
            >
              {index + 1}
            </motion.span>
          ))}
        </div>
      </div>
      <motion.div
        key={instruction.title}
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 110, damping: 20 }}
        className="mt-9 grid gap-4 border-y border-bronze/25 bg-paper/55 px-4 py-5 sm:grid-cols-[3.25rem_1fr] sm:items-center sm:px-6"
        role="status"
        aria-live="polite"
      >
        <span className="grid h-12 w-12 place-items-center rounded-full border border-gold/45 bg-night font-display text-xl font-semibold text-gold-pale" aria-hidden="true">
          {instruction.step}
        </span>
        <div>
          <p className="font-display text-xl font-medium text-ink md:text-2xl">{instruction.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{instruction.description}</p>
        </div>
      </motion.div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Card
          kind="word"
          title="Palavra"
          revealed={!!word}
          active={!word}
          busy={busy === 'word'}
          locked={!!busy}
          onReveal={() => void onAction(`/journeys/${journey.publicId}/sets/${position}/draw-word`, 'word')}
        >
          {word?.word}
        </Card>
        <Card
          kind="image"
          title="Imagem"
          revealed={!!image}
          active={!!word && !image}
          busy={busy === 'image'}
          locked={!!busy}
          onReveal={() => void onAction(`/journeys/${journey.publicId}/sets/${position}/draw-image`, 'image')}
        >
          {image && (
            <>
              <img
                className="mb-5 h-64 w-full bg-canvas object-contain p-3"
                src={apiUrl(image.url)}
                alt={image.alternativeText}
              />
              <p className="text-sm leading-relaxed text-muted">
                {image.objectiveDescription ??
                  'Observe a imagem sem buscar uma explicação imediata.'}
              </p>
            </>
          )}
        </Card>
      </div>
      {(word || image) && (
        <p className="mt-5 flex items-center justify-center gap-2 text-center text-sm text-muted">
          <LockKey size={16} aria-hidden="true" />
          Escolha registrada. Ela permanecerá igual se você atualizar a página.
        </p>
      )}
      {word && image && (
        <motion.div
          className="mt-8 flex justify-center"
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 105, damping: 20 }}
        >
          <button
            disabled={!!busy}
            className="button"
            type="button"
            onClick={() => void onAction(`/journeys/${journey.publicId}/advance`, 'advance')}
          >
            {busy === 'advance' ? (
              <>
                <CircleNotch className="animate-spin" size={18} aria-hidden="true" />
                Registrando…
              </>
            ) : (
              <>
                {position === 5 ? 'Ver sequência completa' : 'Seguir para o próximo movimento'}
                <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </button>
        </motion.div>
      )}
    </motion.section>
  );
}

function QuestionsFlow({ journey }: { journey: Journey }) {
  const generatedJourney = journey.status !== 'CARTAS_CONCLUIDAS';
  const [snapshot, setSnapshot] = useState<QuestionsSnapshot | null>(null);
  const [loading, setLoading] = useState(generatedJourney);
  const [action, setAction] = useState<'generate' | 'answer' | 'reload' | null>(null);
  const [error, setError] = useState('');

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setAction('reload');
    setError('');
    try {
      setSnapshot(await api<QuestionsSnapshot>(`/journeys/${journey.publicId}/questions`));
    } catch (caught) {
      setError(questionErrorMessage(caught));
    } finally {
      setLoading(false);
      setAction(null);
    }
  }, [journey.publicId]);

  useEffect(() => {
    if (generatedJourney) void loadQuestions();
  }, [generatedJourney, loadQuestions]);

  async function generateQuestions() {
    if (action) return;
    setAction('generate');
    setError('');
    try {
      setSnapshot(
        await api<QuestionsSnapshot>(`/journeys/${journey.publicId}/questions/generate`, {
          method: 'POST'
        })
      );
    } catch (caught) {
      setError(questionErrorMessage(caught));
    } finally {
      setAction(null);
    }
  }

  async function saveAnswer(
    question: ReflectiveQuestion,
    responseType: QuestionResponseType,
    text?: string
  ) {
    if (action) return false;
    setAction('answer');
    setError('');
    try {
      const answer = responseType === 'TEXT'
        ? { questionId: question.id, responseType, text: text?.trim() }
        : { questionId: question.id, responseType };
      setSnapshot(
        await api<QuestionsSnapshot>(`/journeys/${journey.publicId}/answers`, {
          method: 'PUT',
          body: JSON.stringify({ answers: [answer] })
        })
      );
      return true;
    } catch (caught) {
      if (
        caught instanceof ApiClientError &&
        ['ANSWERS_ALREADY_COMPLETED', 'QUESTION_NOT_FOUND', 'QUESTIONS_NOT_AVAILABLE'].includes(
          caught.code
        )
      ) {
        await loadQuestions();
        return false;
      }
      setError(questionErrorMessage(caught));
      return false;
    } finally {
      setAction(null);
    }
  }

  if (!generatedJourney && !snapshot) {
    return (
      <CompletedSequence
        journey={journey}
        busy={action === 'generate'}
        error={error}
        onGenerate={() => void generateQuestions()}
      />
    );
  }

  if (loading) {
    return (
      <section className="surface grid gap-8 p-7 md:grid-cols-[auto_1fr] md:p-10" aria-busy="true">
        <div className="grid h-14 w-14 place-items-center border border-accent/40 bg-canvas text-accent">
          <CircleNotch className="animate-spin" size={24} aria-hidden="true" />
        </div>
        <div>
          <p className="font-display text-3xl leading-tight" role="status" aria-live="polite">
            Retomando sua interpretação inicial…
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            A leitura e as respostas já registradas serão preservadas.
          </p>
          <div className="mt-7 space-y-3" aria-hidden="true">
            <span className="block h-2 w-full animate-pulse bg-ink/10" />
            <span className="block h-2 w-4/5 animate-pulse bg-ink/10" />
            <span className="block h-2 w-2/3 animate-pulse bg-ink/10" />
          </div>
        </div>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section>
        <SectionHeading
          eyebrow="Perguntas reflexivas"
          title="Não conseguimos abrir sua interpretação."
          description="Sua sequência continua salva. Você pode tentar retomar esta etapa sem refazer o percurso."
        />
        <div className="mt-7">
          <ErrorNotice message={error || 'Não foi possível carregar esta etapa.'} />
        </div>
        <button
          type="button"
          className="button"
          disabled={action === 'reload'}
          onClick={() => void loadQuestions()}
        >
          {action === 'reload' ? (
            <>
              <CircleNotch className="animate-spin" size={18} aria-hidden="true" />
              Carregando…
            </>
          ) : (
            <>Tentar carregar novamente</>
          )}
        </button>
        <SequenceDetails journey={journey} />
      </section>
    );
  }

  return (
    <Questionnaire
      journey={journey}
      snapshot={snapshot}
      busy={action === 'answer'}
      error={error}
      onSave={saveAnswer}
    />
  );
}

function CompletedSequence({
  journey,
  busy,
  error,
  onGenerate
}: {
  journey: Journey;
  busy: boolean;
  error: string;
  onGenerate: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      aria-labelledby="sequence-title"
    >
      <span className="eyebrow">Cinco movimentos concluídos</span>
      <h1 id="sequence-title" className="mt-3 max-w-2xl font-display text-5xl leading-none tracking-[-0.025em] md:text-7xl">
        Observe sua sequência por inteiro.
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
        Não é preciso fazer todas as combinações se encaixarem. Quando estiver pronta(o), continue
        para receber a primeira leitura do seu percurso.
      </p>
      <div className="mt-10 grid border-y border-ink/15 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex gap-4 py-7 md:pr-8">
          <div className="grid h-11 w-11 shrink-0 place-items-center border border-accent/35 text-accent">
            <Sparkle size={21} aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-2xl">Receber minha interpretação inicial</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              AYA observará sua circunstância e os cinco conjuntos como um percurso completo. O
              resultado ficará salvo para retomada neste navegador.
            </p>
          </div>
        </div>
        <div className="border-t border-ink/15 py-6 md:border-l md:border-t-0 md:pl-8">
          <button
            type="button"
            className="button w-full shrink-0 md:w-auto"
            disabled={busy}
            onClick={onGenerate}
            aria-describedby="questions-privacy-note"
          >
            {busy ? (
              <>
                <CircleNotch className="animate-spin" size={18} aria-hidden="true" />
                AYA está observando seu percurso…
              </>
            ) : (
              <>
                Continuar para a interpretação
                <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
      <p id="questions-privacy-note" className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <LockKey className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
        Cada combinação será considerada dentro do contexto completo do seu percurso. Não feche esta
        página durante o processamento.
      </p>
      {error && <ErrorNotice message={error} className="mt-5" />}
      <SetGrid sets={journey.sets} />
    </motion.section>
  );
}

function Questionnaire({
  journey,
  snapshot,
  busy,
  error,
  onSave
}: {
  journey: Journey;
  snapshot: QuestionsSnapshot;
  busy: boolean;
  error: string;
  onSave: (
    question: ReflectiveQuestion,
    responseType: QuestionResponseType,
    text?: string
  ) => Promise<boolean>;
}) {
  const complete =
    snapshot.answersComplete ||
    snapshot.generationStatus === 'ANSWERS_COMPLETED' ||
    snapshot.questions.every((question) => question.answer);

  if (snapshot.safety.requiresPause) {
    return <SafetyPause journey={journey} snapshot={snapshot} />;
  }

  if (complete) {
    return (
      <>
        <InitialInterpretationPage
          journey={journey}
          snapshot={snapshot}
          busy={false}
          error=""
          readOnly
          onSave={onSave}
        />
        <QuestionsComplete journey={journey} snapshot={snapshot} />
      </>
    );
  }

  return (
    <InitialInterpretationPage
      journey={journey}
      snapshot={snapshot}
      busy={busy}
      error={error}
      onSave={onSave}
    />
  );
}

/**
 * Reinicia a posição da página quando o conteúdo principal avança para outra
 * tela lógica. O requestAnimationFrame garante que o novo conteúdo já tenha
 * sido renderizado antes da rolagem, inclusive no Safari móvel.
 */
function useScrollToTopOnChange(value: string | undefined, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [enabled, value]);
}

function QuestionsComplete({
  journey,
  snapshot
}: {
  journey: Journey;
  snapshot: QuestionsSnapshot;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      aria-labelledby="answers-complete-title"
    >
      <div className="surface relative overflow-hidden p-7 md:p-12">
        <div className="relative z-10 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="eyebrow">Etapa concluída</span>
            <GenerationMode mode={snapshot.generationMode} />
          </div>
          {snapshot.generationMode === 'DEMO' && <DemoNotice />}
          <div className="mt-10 grid h-16 w-16 place-items-center border border-success/30 bg-success/10 text-success">
            <CheckCircle size={31} weight="light" aria-hidden="true" />
          </div>
          <h1 id="answers-complete-title" className="mt-7 max-w-2xl font-display text-5xl leading-none tracking-[-0.025em] md:text-7xl">
            Suas respostas foram registradas.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
            Você respondeu ou escolheu não responder às {snapshot.totalCount} perguntas desta etapa.
            A jornada permanece vinculada a este navegador enquanto sua sessão estiver válida.
          </p>
          {snapshot.safety.requiresProfessionalReview && (
            <div className="mt-7 flex items-start gap-3 border border-danger/30 bg-danger/5 p-4 text-sm leading-relaxed">
              <WarningCircle className="mt-0.5 shrink-0 text-danger" size={20} aria-hidden="true" />
              <p>
                <strong>Revisão profissional recomendada.</strong> Nenhuma revisão humana foi solicitada
                automaticamente. {snapshot.safety.reason}
              </p>
            </div>
          )}
          {snapshot.notice && <p className="mt-5 text-sm leading-relaxed text-muted">{snapshot.notice}</p>}
        </div>
        <div className="pointer-events-none absolute -bottom-28 -right-28 h-80 w-80 rounded-full border border-ink/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-12 -right-12 h-44 w-44 rounded-full border border-accent/25" aria-hidden="true" />
      </div>
      <FinalAnalysis journeyId={journey.publicId} />
      <SequenceDetails journey={journey} />
    </motion.section>
  );
}

function SafetyPause({ journey, snapshot }: { journey: Journey; snapshot: QuestionsSnapshot }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      aria-labelledby="safety-pause-title"
    >
      <div className="flex justify-end">
        <GenerationMode mode={snapshot.generationMode} />
      </div>
      {snapshot.generationMode === 'DEMO' && <DemoNotice />}
      <div className="mt-6 grid border border-danger/35 bg-paper md:grid-cols-[6rem_1fr]">
        <div className="grid place-items-center border-b border-danger/25 bg-danger/5 p-6 text-danger md:border-b-0 md:border-r">
          <WarningCircle size={34} weight="light" aria-hidden="true" />
        </div>
        <div className="p-7 md:p-10">
          <span className="eyebrow text-danger">Pausa recomendada</span>
          <h1 id="safety-pause-title" className="mt-4 max-w-xl font-display text-4xl leading-tight tracking-[-0.02em] md:text-6xl">
            Cuide de você antes de continuar.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
            {snapshot.safety.reason ||
              'Este é um bom momento para pausar a jornada e buscar apoio humano de sua confiança.'}
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
            Estas perguntas não substituem atendimento profissional ou suporte de emergência.
          </p>
        </div>
      </div>
      <SequenceDetails journey={journey} />
    </motion.section>
  );
}

function GenerationMode({ mode }: { mode: QuestionsSnapshot['generationMode'] }) {
  if (mode === 'DEMO') {
    return (
      <span className="inline-flex w-fit items-center gap-2 border border-accent/30 bg-accent/5 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-accent">
        <span className="h-1.5 w-1.5 bg-accent" aria-hidden="true" />
        Modo demonstração
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center gap-2 border border-sage/25 bg-sage/10 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-sage">
      <span className="h-1.5 w-1.5 bg-sage" aria-hidden="true" />
      Perguntas personalizadas
    </span>
  );
}

function DemoNotice() {
  return (
    <div className="mt-6 flex items-start gap-3 border border-accent/30 bg-accent/5 p-4 text-sm leading-relaxed" role="status">
      <Sparkle className="mt-0.5 shrink-0 text-accent" size={19} aria-hidden="true" />
      <p>
        <strong>Demonstração:</strong> estas perguntas foram preparadas localmente pelo sistema, sem
        consulta à inteligência artificial. Elas servem apenas para testar o percurso.
      </p>
    </div>
  );
}

function SequenceDetails({ journey }: { journey: Journey }) {
  return (
    <details className="mt-10 border-y border-ink/15 py-1">
      <summary className="min-h-14 cursor-pointer py-4 font-display text-xl font-semibold transition-colors hover:text-accent">
        Rever minha sequência
      </summary>
      <SetGrid sets={journey.sets} />
    </details>
  );
}

function Card({
  kind,
  title,
  revealed,
  active,
  busy,
  locked,
  onReveal,
  children
}: {
  kind: 'word' | 'image';
  title: string;
  revealed: boolean;
  active: boolean;
  busy: boolean;
  locked: boolean;
  onReveal: () => void;
  children?: ReactNode;
}) {
  const { reducedMotion } = useMotionPreference();
  const isWaitingForWord = kind === 'image' && !active && !revealed;
  const closedInstruction = isWaitingForWord
    ? 'Primeiro revele a palavra'
    : busy
      ? `Revelando ${kind === 'word' ? 'a palavra' : 'a imagem'}…`
      : `Clique para virar ${kind === 'word' ? 'a palavra' : 'a imagem'}`;
  const deckLabel = kind === 'word' ? 'Baralho de palavras' : 'Baralho de imagens';

  return (
    <motion.article
      layout
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      className={`min-h-[27rem] overflow-hidden border p-5 [perspective:1200px] transition-[border-color,background-color,box-shadow] duration-300 md:p-6 ${
        revealed
          ? 'border-bronze/35 bg-paper shadow-card'
          : active
            ? 'border-bronze/55 bg-paper shadow-[0_24px_70px_-42px_rgba(67,43,17,0.55)]'
            : 'border-bronze/15 bg-sand/65'
      }`}
    >
      <div className="flex items-center justify-between border-b border-ink/10 pb-4">
        <span className="eyebrow">{title}</span>
        <span className={`text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${active ? 'text-accent' : 'text-muted'}`}>
          {revealed ? 'Revelada' : active ? 'Clique agora' : 'Depois'}
        </span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {revealed ? (
          <motion.div
            key="revealed"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0.35, rotateY: 88, scale: 0.97 }}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            transition={reducedMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 115, damping: 19 }}
            className={`min-h-[22rem] [backface-visibility:hidden] ${kind === 'image' ? 'pt-5' : 'grid place-items-center text-center font-display text-4xl font-light md:text-5xl'}`}
          >
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="closed"
            className="grid min-h-[22rem] place-items-center py-5 [backface-visibility:hidden]"
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0.3, rotateY: -88, scale: 0.97 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="flex flex-col items-center text-center">
              <motion.button
                type="button"
                disabled={!active || locked}
                onClick={onReveal}
                aria-label={active ? closedInstruction : `${title}: indisponível. ${closedInstruction}`}
                className={`brand-grid brand-grid-dark relative grid h-60 w-44 place-items-center overflow-hidden border shadow-gold transition-[filter,box-shadow] duration-300 [transform-style:preserve-3d] focus-visible:ring-offset-paper ${
                  kind === 'word'
                    ? 'border-gold/35 bg-night'
                    : 'border-gold-pale/40 bg-[#46513b]'
                } ${active ? 'cursor-pointer' : 'cursor-not-allowed grayscale-[0.18] brightness-90'}`}
                animate={!reducedMotion && active && !busy ? { y: [0, -6, 0] } : { y: 0 }}
                transition={!reducedMotion && active && !busy
                  ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
                  : { type: 'spring', stiffness: 120, damping: 20 }}
                whileHover={!reducedMotion && active && !busy ? { scale: 1.025, rotateY: 3, rotateX: -2 } : undefined}
                whileTap={!reducedMotion && active && !busy ? { scale: 0.97 } : undefined}
              >
                <span className="absolute inset-2 border border-gold-pale/15" aria-hidden="true" />
                <span className="grid h-28 w-28 place-items-center rounded-full border border-gold-pale/25 bg-paper/95">
                  <BrandSymbol className="h-24 w-24" />
                </span>
                <span className="absolute bottom-4 text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-gold-pale/75">
                  {deckLabel}
                </span>
                {busy && (
                  <span className="absolute inset-0 grid place-items-center bg-night/55 text-gold-pale" role="status">
                    <CircleNotch className="animate-spin" size={30} aria-hidden="true" />
                    <span className="sr-only">{closedInstruction}</span>
                  </span>
                )}
              </motion.button>
              <div className={`mt-5 flex min-h-11 items-center justify-center gap-2 text-sm font-semibold ${active ? 'text-accent' : 'text-muted'}`}>
                {isWaitingForWord ? <LockKey size={18} aria-hidden="true" /> : busy ? <CircleNotch className="animate-spin" size={18} aria-hidden="true" /> : <HandTap size={20} weight="bold" aria-hidden="true" />}
                <span>{closedInstruction}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function SetGrid({ sets }: { sets: Journey['sets'] }) {
  return (
    <div className="mt-8 border-t border-ink/15">
      {sets.map((set, index) => (
        <motion.article
          key={set.position}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ type: 'spring', stiffness: 90, damping: 20, delay: index * 0.055 }}
          className="grid gap-5 border-b border-ink/15 py-6 sm:grid-cols-[3rem_9rem_1fr] sm:items-center md:gap-7"
        >
          <span className="font-display text-2xl text-accent" aria-hidden="true">
            {String(set.position).padStart(2, '0')}
          </span>
          <div className="bg-sand">
            {set.imageCard && (
              <img
                className="h-36 w-full object-contain p-2"
                src={apiUrl(set.imageCard.url)}
                alt={set.imageCard.alternativeText}
              />
            )}
          </div>
          <div>
            <span className="eyebrow">{labels[set.position - 1]}</span>
            <strong className="mt-2 block font-display text-3xl font-medium">{set.wordCard?.word}</strong>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {set.imageCard?.objectiveDescription ??
                'Observe a combinação sem buscar uma explicação imediata.'}
            </p>
          </div>
        </motion.article>
      ))}
    </div>
  );
}

function ErrorNotice({ message, className = '' }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={`${className} mb-6 flex items-start gap-3 border border-danger/35 bg-danger/5 p-4 text-sm leading-relaxed text-danger`}
    >
      <WarningCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Não foi possível concluir a solicitação.';
}

function questionErrorMessage(caught: unknown): string {
  if (!(caught instanceof ApiClientError)) return 'Não foi possível conectar ao sistema. Tente novamente.';

  const messages: Record<string, string> = {
    AI_NOT_CONFIGURED:
      'As perguntas ainda não estão disponíveis neste ambiente. Sua sequência permanece salva.',
    AI_DAILY_LIMIT_REACHED:
      'O limite disponível para gerar perguntas foi atingido. Sua jornada está salva; tente novamente mais tarde.',
    AI_QUOTA_BLOCKED:
      'O limite disponível para gerar perguntas foi atingido. Sua jornada está salva; tente novamente mais tarde.',
    AI_TEMPORARILY_UNAVAILABLE:
      'Não foi possível preparar as perguntas agora. Sua sequência permanece salva para uma nova tentativa.',
    AI_OUTPUT_INVALID:
      'As perguntas recebidas não puderam ser validadas. Sua sequência permanece salva.',
    AI_CONTENT_BLOCKED:
      'A preparação automática foi interrompida com segurança e não será repetida nesta jornada.',
    AI_OPERATION_IN_PROGRESS:
      'As perguntas já estão sendo preparadas. Aguarde um momento antes de verificar novamente.',
    SAFETY_PAUSE_REQUIRED:
      'Esta jornada recomenda uma pausa antes de registrar novas respostas.',
    CARDS_NOT_COMPLETED: 'Conclua os cinco movimentos antes de gerar as perguntas.',
    QUESTIONS_REQUIRE_COMPLETED_CARDS: 'Conclua os cinco movimentos antes de gerar as perguntas.',
    PUBLIC_SESSION_REQUIRED:
      'Sua sessão não está disponível neste navegador. Nenhuma nova resposta foi registrada.',
    PUBLIC_SESSION_EXPIRED:
      'Sua sessão expirou. Por segurança, esta jornada não pode ser aberta apenas com nome ou e-mail.'
  };

  return messages[caught.code] ?? caught.message;
}
