import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  QuotesIcon,
  ShieldCheckIcon,
  SparkleIcon,
  WarningCircleIcon
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import { api, ApiClientError } from '../api';
import type { AnalysisSnapshot, AnalysisStage } from '../types';
import { useMotionPreference } from './MotionPreference';

interface FinalAnalysisProps {
  journeyId: string;
}

const missingAnalysisCodes = new Set([
  'ANALYSIS_NOT_FOUND',
  'ANALYSIS_NOT_AVAILABLE',
  'ANALYSIS_NOT_GENERATED'
]);

const generationRetryBlockedCodes = new Set([
  'AI_CONTENT_BLOCKED',
  'AI_NOT_CONFIGURED',
  'AI_OUTPUT_INVALID',
  'ANALYSIS_CONTEXT_CHANGED',
  'ANALYSIS_DATA_INVALID',
  'SAFETY_PAUSE_REQUIRED',
  'ANALYSIS_REQUIRES_COMPLETED_ANSWERS',
  'ANSWERS_NOT_COMPLETED',
  'PUBLIC_SESSION_REQUIRED',
  'PUBLIC_SESSION_EXPIRED',
  'FORBIDDEN_RESOURCE'
]);

export function FinalAnalysis({ journeyId }: FinalAnalysisProps) {
  const { reducedMotion } = useMotionPreference();
  const resultRef = useRef<HTMLElement>(null);
  const focusResultRef = useRef(false);
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [checking, setChecking] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');

  const loadAnalysis = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    setLoadFailed(false);
    setError('');
    setErrorCode('');

    try {
      const loaded = await api<AnalysisSnapshot>(`/journeys/${journeyId}/analysis`, { signal });
      if (signal?.aborted) return;
      setSnapshot(loaded);
    } catch (caught) {
      if (signal?.aborted || isAbortError(caught)) return;

      if (isAnalysisMissing(caught)) {
        setSnapshot(null);
      } else {
        setLoadFailed(true);
        setError(analysisErrorMessage(caught));
        setErrorCode(caught instanceof ApiClientError ? caught.code : 'CONNECTION_FAILED');
      }
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }, [journeyId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAnalysis(controller.signal);
    return () => controller.abort();
  }, [loadAnalysis]);

  useEffect(() => {
    if (!snapshot || !focusResultRef.current) return undefined;

    focusResultRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
      resultRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, snapshot]);

  async function generateAnalysis() {
    if (generating || checking) return;

    setGenerating(true);
    setLoadFailed(false);
    setError('');
    setErrorCode('');

    try {
      const generated = await api<AnalysisSnapshot>(`/journeys/${journeyId}/analysis`, {
        method: 'POST'
      });
      focusResultRef.current = true;
      setSnapshot(generated);
    } catch (caught) {
      setError(analysisErrorMessage(caught));
      setErrorCode(caught instanceof ApiClientError ? caught.code : 'CONNECTION_FAILED');
    } finally {
      setGenerating(false);
    }
  }

  if (checking && !snapshot) {
    return <AnalysisLoading reducedMotion={reducedMotion} />;
  }

  if (snapshot?.safety.requiresPause) {
    return <AnalysisSafetyPause snapshot={snapshot} reducedMotion={reducedMotion} />;
  }

  if (snapshot) {
    return <AnalysisResult resultRef={resultRef} snapshot={snapshot} reducedMotion={reducedMotion} />;
  }

  if (loadFailed) {
    return (
      <motion.section
        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mt-10 border border-danger/30 bg-paper p-6 shadow-card md:p-9"
        aria-labelledby="analysis-load-error-title"
      >
        <span className="eyebrow text-danger">Análise expandida</span>
        <h2 id="analysis-load-error-title" className="mt-3 font-display text-3xl leading-tight md:text-4xl">
          Não foi possível verificar sua análise.
        </h2>
        <AnalysisError message={error} />
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
          Suas respostas continuam salvas. Tente carregar novamente sem refazer o percurso.
        </p>
        <button
          type="button"
          className="button mt-7"
          disabled={checking}
          onClick={() => void loadAnalysis()}
        >
          {checking ? (
            <>
              <CircleNotchIcon className={reducedMotion ? '' : 'animate-spin'} size={18} aria-hidden="true" />
              Verificando…
            </>
          ) : (
            'Tentar carregar novamente'
          )}
        </button>
      </motion.section>
    );
  }

  const operationInProgress = errorCode === 'AI_OPERATION_IN_PROGRESS';
  const canRetryGeneration = !generationRetryBlockedCodes.has(errorCode) && !operationInProgress;

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 84, damping: 20 }}
      className="brand-grid brand-grid-dark relative mt-10 overflow-hidden border border-gold/25 bg-night p-7 text-paper shadow-gold md:p-11"
      aria-labelledby="generate-analysis-title"
    >
      <div className="relative z-10 grid gap-9 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <div className="grid h-14 w-14 place-items-center rounded-full border border-gold-pale/25 bg-gold/10 text-gold-pale">
            <SparkleIcon size={25} weight="light" aria-hidden="true" />
          </div>
          <p className="mt-7 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold-pale/65">
            Análise expandida
          </p>
          <h2 id="generate-analysis-title" className="mt-4 max-w-3xl font-display text-4xl font-light leading-[1.03] tracking-[-0.035em] md:text-6xl">
            Aprofunde sua reflexão em uma visão de conjunto.
          </h2>
          <p id="analysis-generation-description" className="mt-6 max-w-2xl text-base leading-7 text-paper/68 md:text-lg">
            Esta análise reúne sua circunstância inicial, as cinco combinações, as perguntas do
            percurso e as respostas que você compartilhou. O resultado apresenta possibilidades de
            reflexão, não conclusões sobre você.
          </p>
        </div>

        <div className="lg:max-w-xs">
          {error && <AnalysisError message={error} inverse />}
          <div className="flex flex-col gap-3">
            {canRetryGeneration && (
              <button
                type="button"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-gold-pale px-6 text-sm font-semibold text-night shadow-card transition-[transform,background-color] duration-300 hover:-translate-y-0.5 hover:bg-paper active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                disabled={generating || checking}
                onClick={() => void generateAnalysis()}
                aria-describedby="analysis-generation-description"
              >
                {generating ? (
                  <>
                    <CircleNotchIcon className={reducedMotion ? '' : 'animate-spin'} size={18} aria-hidden="true" />
                    AYA está integrando suas respostas…
                  </>
                ) : (
                  <>
                    {error ? 'Tentar gerar novamente' : 'Aprofundar minha reflexão'}
                    <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
                  </>
                )}
              </button>
            )}
            {error && (
              <button
                type="button"
                className="inline-flex min-h-12 items-center justify-center border border-gold-pale/35 px-5 text-sm font-semibold text-gold-pale transition-[transform,background-color] duration-300 hover:-translate-y-0.5 hover:bg-gold/10 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                disabled={checking || generating}
                onClick={() => void loadAnalysis()}
              >
                {checking ? 'Verificando…' : 'Verificar análise salva'}
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="relative z-10 mt-8 flex max-w-3xl items-start gap-2 border-t border-gold-pale/15 pt-5 text-xs leading-5 text-paper/55">
        <ShieldCheckIcon className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
        A análise usa somente o contexto desta jornada e permanece vinculada à sua sessão neste navegador.
      </p>
      <span className="pointer-events-none absolute -bottom-32 -right-24 h-72 w-72 rounded-full border border-gold-pale/15" aria-hidden="true" />
    </motion.section>
  );
}

function AnalysisLoading({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="surface mt-10 grid gap-6 p-7 md:grid-cols-[auto_1fr] md:p-9"
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <div className="grid h-14 w-14 place-items-center border border-accent/35 bg-canvas text-accent">
        <CircleNotchIcon className={reducedMotion ? '' : 'animate-spin'} size={24} aria-hidden="true" />
      </div>
      <div>
        <p className="font-display text-3xl leading-tight">Verificando sua análise expandida…</p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Se ela já tiver sido preparada, será retomada sem uma nova geração.
        </p>
      </div>
    </motion.section>
  );
}

function AnalysisSafetyPause({
  snapshot,
  reducedMotion
}: {
  snapshot: AnalysisSnapshot;
  reducedMotion: boolean;
}) {
  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="mt-10 border border-danger/35 bg-paper"
      aria-labelledby="analysis-safety-title"
      role="alert"
    >
      <div className="grid md:grid-cols-[6rem_1fr]">
        <div className="grid place-items-center border-b border-danger/25 bg-danger/5 p-6 text-danger md:border-b-0 md:border-r">
          <WarningCircleIcon size={36} weight="light" aria-hidden="true" />
        </div>
        <div className="p-7 md:p-10">
          <span className="eyebrow text-danger">Pausa recomendada</span>
          <h2 id="analysis-safety-title" className="mt-4 max-w-2xl font-display text-4xl leading-tight tracking-[-0.025em] md:text-6xl">
            Cuide de você antes de seguir com interpretações.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted">
            {snapshot.safety.reason || 'Este é um bom momento para pausar e buscar apoio humano de sua confiança.'}
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            A experiência não substitui atendimento profissional ou suporte de emergência.
          </p>
          {snapshot.notice && <p className="mt-5 max-w-2xl text-xs leading-5 text-muted">{snapshot.notice}</p>}
        </div>
      </div>
    </motion.section>
  );
}

const AnalysisResult = function AnalysisResult({
  resultRef,
  snapshot,
  reducedMotion
}: {
  resultRef: Ref<HTMLElement>;
  snapshot: AnalysisSnapshot;
  reducedMotion: boolean;
}) {
  const orderedStages = snapshot.stages.slice().sort((first, second) => first.stepNumber - second.stepNumber);

  return (
    <motion.section
      ref={resultRef}
      id="analise-final"
      tabIndex={-1}
      initial={reducedMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 78, damping: 20 }}
      className="mt-10 scroll-mt-24 focus:outline-none"
      aria-labelledby="analysis-result-title"
    >
      <header className="brand-grid brand-grid-dark relative overflow-hidden border border-gold/25 bg-night p-7 text-paper shadow-gold md:p-12">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold-pale/65">Análise expandida</span>
            <AnalysisMode mode={snapshot.generationMode} />
          </div>
          <div className="mt-10 grid gap-7 lg:grid-cols-[auto_1fr] lg:gap-10">
            <QuotesIcon className="text-gold" size={37} weight="light" aria-hidden="true" />
            <div>
              <h2 id="analysis-result-title" className="font-display text-4xl font-light leading-[1.03] tracking-[-0.035em] md:text-6xl">
                Reflexão expandida do seu percurso.
              </h2>
              <p className="mt-7 max-w-4xl font-serif text-xl leading-relaxed text-paper/82 md:text-2xl">
                {snapshot.summary}
              </p>
            </div>
          </div>
        </div>
        <span className="pointer-events-none absolute -bottom-28 -right-16 h-64 w-64 rounded-full border border-gold-pale/15" aria-hidden="true" />
      </header>

      {snapshot.generationMode === 'DEMO' && (
        <div className="mt-5 flex items-start gap-3 border border-accent/30 bg-accent/5 p-4 text-sm leading-6" role="status">
          <SparkleIcon className="mt-0.5 shrink-0 text-accent" size={19} aria-hidden="true" />
          <p><strong>Demonstração:</strong> esta análise foi preparada localmente para testar o percurso, sem consulta à inteligência artificial.</p>
        </div>
      )}

      {snapshot.safety.requiresProfessionalReview && (
        <div className="mt-5 flex items-start gap-3 border border-danger/30 bg-danger/5 p-4 text-sm leading-6">
          <WarningCircleIcon className="mt-0.5 shrink-0 text-danger" size={20} aria-hidden="true" />
          <p>
            <strong>Revisão profissional recomendada.</strong> Nenhuma revisão humana foi solicitada automaticamente.
            {snapshot.safety.reason ? ` ${snapshot.safety.reason}` : ''}
          </p>
        </div>
      )}

      <section className="mt-12 border-y border-ink/15 py-8 md:py-10" aria-labelledby="sequence-synthesis-title">
        <div className="grid gap-5 md:grid-cols-[4rem_1fr] md:gap-8">
          <span className="font-serif text-4xl italic text-accent" aria-hidden="true">∞</span>
          <div>
            <p className="eyebrow">Visão da sequência</p>
            <h3 id="sequence-synthesis-title" className="mt-3 font-display text-3xl leading-tight md:text-4xl">O conjunto dos cinco movimentos</h3>
            <p className="mt-5 max-w-4xl text-base leading-8 text-muted md:text-lg">{snapshot.sequenceSynthesis}</p>
          </div>
        </div>
      </section>

      <div className="mt-12" aria-label="Reflexões por etapa">
        <div className="max-w-3xl">
          <p className="eyebrow">Etapa por etapa</p>
          <h3 className="mt-3 font-display text-4xl leading-tight tracking-[-0.025em] md:text-5xl">O que apareceu em cada movimento</h3>
          <p className="mt-4 text-base leading-7 text-muted">Fatos e associações são separados das possibilidades reflexivas para manter claro o que veio de você e o que permanece como hipótese.</p>
        </div>

        <div className="mt-9 border-t border-ink/15">
          {orderedStages.map((stage, index) => (
            <AnalysisStageSection key={`${stage.stepNumber}-${stage.stageName}`} stage={stage} index={index} reducedMotion={reducedMotion} />
          ))}
        </div>
      </div>

      <div className="mt-12 grid border border-ink/15 bg-paper lg:grid-cols-3">
        <AnalysisCollection title="Conexões possíveis" items={snapshot.possibleConnections} eyebrow="Para observar" />
        <AnalysisCollection title="O que permanece em aberto" items={snapshot.uncertainties} eyebrow="Incertezas" />
        <AnalysisCollection title="Próximas reflexões" items={snapshot.nextReflections} eyebrow="Daqui em diante" />
      </div>

      {snapshot.notice && (
        <div className="mt-8 flex items-start gap-3 border-l-2 border-accent bg-accent/5 px-5 py-4 text-sm leading-6 text-muted">
          <CheckCircleIcon className="mt-0.5 shrink-0 text-accent" size={20} aria-hidden="true" />
          <p>{snapshot.notice}</p>
        </div>
      )}

      <p className="mt-8 border-t border-ink/15 pt-5 text-xs leading-5 text-muted">
        Este conteúdo não constitui diagnóstico, avaliação psicológica ou substituição de
        acompanhamento profissional.
      </p>
    </motion.section>
  );
};

function AnalysisStageSection({
  stage,
  index,
  reducedMotion
}: {
  stage: AnalysisStage;
  index: number;
  reducedMotion: boolean;
}) {
  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 22 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ type: 'spring', stiffness: 82, damping: 20, delay: Math.min(index * 0.04, 0.16) }}
      className="grid gap-7 border-b border-ink/15 py-9 md:grid-cols-[4.5rem_1fr] md:gap-9 md:py-12"
    >
      <div className="font-serif text-4xl italic text-accent" aria-hidden="true">
        {String(stage.stepNumber).padStart(2, '0')}
      </div>
      <div>
        <p className="eyebrow">Movimento {stage.stepNumber}</p>
        <h4 className="mt-3 font-display text-3xl leading-tight tracking-[-0.02em] md:text-4xl">{stage.stageName}</h4>
        <p className="mt-5 max-w-4xl font-serif text-xl leading-8 text-ink/85">{stage.synthesis}</p>
        <div className="mt-8 grid border-t border-ink/10 md:grid-cols-2">
          <AnalysisList title="Elementos do seu relato" items={stage.groundedFacts} />
          <AnalysisList title="Associações registradas" items={stage.participantAssociations} />
          <AnalysisList title="Possibilidades para observar" items={stage.reflectivePossibilities} possibility />
          <AnalysisList title="Perguntas que permanecem" items={stage.openQuestions} possibility />
        </div>
      </div>
    </motion.article>
  );
}

function AnalysisList({
  title,
  items,
  possibility = false
}: {
  title: string;
  items: string[];
  possibility?: boolean;
}) {
  if (!items.length) return null;

  return (
    <section className="border-b border-ink/10 py-6 last:border-b-0 md:border-r md:px-6 md:first:pl-0 md:[&:nth-child(2n)]:border-r-0">
      <h5 className={`text-xs font-semibold uppercase tracking-[0.13em] ${possibility ? 'text-accent' : 'text-muted'}`}>{title}</h5>
      <ul className="mt-4 space-y-3">
        {items.map((item, itemIndex) => (
          <li key={`${itemIndex}-${item}`} className="flex items-start gap-3 text-sm leading-6 text-muted">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rotate-45 ${possibility ? 'bg-accent' : 'bg-ink/35'}`} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnalysisCollection({ title, items, eyebrow }: { title: string; items: string[]; eyebrow: string }) {
  return (
    <section className="border-b border-ink/15 p-7 last:border-b-0 lg:border-b-0 lg:border-r lg:p-9 lg:last:border-r-0">
      <p className="eyebrow">{eyebrow}</p>
      <h3 className="mt-3 font-display text-2xl leading-tight md:text-3xl">{title}</h3>
      {items.length ? (
        <ul className="mt-6 space-y-4">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="flex items-start gap-3 text-sm leading-6 text-muted">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 border border-accent" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm leading-6 text-muted">Nenhum ponto adicional foi registrado nesta parte.</p>
      )}
    </section>
  );
}

function AnalysisMode({ mode }: { mode: AnalysisSnapshot['generationMode'] }) {
  const demo = mode === 'DEMO';
  return (
    <span className={`inline-flex w-fit items-center gap-2 border px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${
      demo
        ? 'border-gold-pale/30 bg-gold/10 text-gold-pale'
        : 'border-gold/30 bg-gold/10 text-gold-pale'
    }`}>
      <span className="h-1.5 w-1.5 bg-gold" aria-hidden="true" />
      {demo ? 'Modo demonstração' : 'Análise personalizada'}
    </span>
  );
}

function AnalysisError({ message, inverse = false }: { message: string; inverse?: boolean }) {
  return (
    <div
      role="alert"
      className={`mt-5 flex items-start gap-3 border p-4 text-sm leading-6 ${
        inverse
          ? 'border-gold-pale/30 bg-gold/10 text-gold-pale'
          : 'border-danger/35 bg-danger/5 text-danger'
      }`}
    >
      <WarningCircleIcon className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function isAbortError(caught: unknown): boolean {
  return caught instanceof DOMException && caught.name === 'AbortError';
}

function isAnalysisMissing(caught: unknown): boolean {
  return caught instanceof ApiClientError &&
    (caught.status === 404 || missingAnalysisCodes.has(caught.code));
}

function analysisErrorMessage(caught: unknown): string {
  if (!(caught instanceof ApiClientError)) {
    return 'Não foi possível conectar ao sistema. Suas respostas continuam salvas; tente novamente.';
  }

  const messages: Record<string, string> = {
    AI_NOT_CONFIGURED: 'A análise ainda não está disponível neste ambiente. Suas respostas continuam salvas.',
    AI_DAILY_LIMIT_REACHED: 'O limite disponível para gerar análises foi atingido. Sua jornada está salva; tente novamente mais tarde.',
    AI_QUOTA_BLOCKED: 'O limite disponível para gerar análises foi atingido. Sua jornada está salva; tente novamente mais tarde.',
    AI_TEMPORARILY_UNAVAILABLE: 'Não foi possível preparar a análise agora. Sua jornada permanece salva para uma nova tentativa.',
    AI_OUTPUT_INVALID: 'A análise recebida não pôde ser validada e não foi exibida. Suas respostas permanecem salvas.',
    AI_CONTENT_BLOCKED: 'A geração automática foi interrompida com segurança e não será repetida nesta jornada.',
    AI_OPERATION_IN_PROGRESS: 'Sua análise já está sendo preparada. Aguarde um momento e verifique novamente.',
    SAFETY_PAUSE_REQUIRED: 'Esta jornada recomenda uma pausa antes de continuar com interpretações.',
    ANALYSIS_REQUIRES_COMPLETED_ANSWERS: 'Conclua todas as perguntas antes de gerar a análise final.',
    ANSWERS_NOT_COMPLETED: 'Conclua todas as perguntas antes de gerar a análise final.',
    PUBLIC_SESSION_REQUIRED: 'Sua sessão não está disponível neste navegador. Nenhuma nova análise foi gerada.',
    PUBLIC_SESSION_EXPIRED: 'Sua sessão expirou. Por segurança, esta jornada não pode ser aberta apenas com nome ou e-mail.'
  };

  return messages[caught.code] ?? 'Não foi possível concluir esta etapa agora. Sua jornada continua salva para uma nova tentativa.';
}
