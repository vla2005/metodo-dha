import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ChatCircleDotsIcon,
  CirclesThreePlusIcon,
  EyeIcon,
  FingerprintSimpleIcon,
  LockKeyOpenIcon,
  NotePencilIcon,
  ShieldCheckIcon,
  SparkleIcon
} from '@phosphor-icons/react';
import { motion, useInView, useScroll, useSpring } from 'framer-motion';
import { memo, useRef } from 'react';
import type { FormEvent, MouseEvent, ReactNode } from 'react';
import type { Theme } from '../types';
import { BrandLogo, BrandSymbol } from './BrandLogo';
import {
  ActiveNavigation,
  ScrollProgress,
  TypewriterText,
  useActiveSection
} from './LandingMotion';
import { useMotionPreference } from './MotionPreference';

interface LandingPageProps {
  themes: Theme[];
  busy: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const journeySteps = [
  {
    number: '01',
    title: 'Dê contexto',
    description: 'Escolha um tema e descreva, do seu jeito, o que está acontecendo agora.',
    Icon: NotePencilIcon
  },
  {
    number: '02',
    title: 'Revele a sequência',
    description: 'Uma palavra e uma imagem surgem em cada etapa e permanecem na sua jornada.',
    Icon: CirclesThreePlusIcon
  },
  {
    number: '03',
    title: 'Observe sem forçar',
    description: 'Note o que encontra relação e também o que ainda não encontra.',
    Icon: EyeIcon
  },
  {
    number: '04',
    title: 'Encontre novas perguntas',
    description: 'Perguntas abertas conectam o contexto à sequência completa.',
    Icon: ChatCircleDotsIcon
  }
];

const methodStages = [
  {
    number: '01',
    title: 'Circunstância percebida',
    description: 'Como a situação aparece e é vivida por você neste momento.'
  },
  {
    number: '02',
    title: 'História',
    description: 'As narrativas, explicações e conclusões construídas ao redor dela.'
  },
  {
    number: '03',
    title: 'Condicionamentos',
    description: 'Crenças, experiências, expectativas e padrões que podem influenciar o olhar.'
  },
  {
    number: '04',
    title: 'Consciência',
    description: 'Outros ângulos que surgem quando a história é observada com mais distância.'
  },
  {
    number: '05',
    title: 'Escolha consciente',
    description: 'Uma compreensão, postura ou ação possível, nunca uma ordem ou resposta pronta.'
  }
];

const expectations = [
  'Não existem respostas certas.',
  'Você não precisa forçar associações.',
  'Uma combinação revelada não é trocada.',
  'Você pode deixar perguntas sem resposta.'
];

const motionWords = [
  'circunstância',
  'história',
  'condicionamentos',
  'consciência',
  'escolha consciente'
];

const typewriterPhrases = [
  'observar sem apressar',
  'reconhecer histórias',
  'ampliar perspectivas',
  'escolher com presença'
] as const;

const landingNavigation = [
  { id: 'metodo', label: 'O método' },
  { id: 'como-funciona', label: 'Como funciona' },
  { id: 'etapas', label: 'As 5 etapas' },
  { id: 'privacidade', label: 'Privacidade' }
] as const;

const observedSectionIds = [
  'inicio',
  'metodo',
  'como-funciona',
  'etapas',
  'privacidade',
  'iniciar'
] as const;

const formItemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
  }
} as const;

function Reveal({
  children,
  className = '',
  direction = 'up'
}: {
  children: ReactNode;
  className?: string;
  direction?: 'up' | 'left' | 'right';
}) {
  const { reducedMotion } = useMotionPreference();
  const offset = direction === 'left' ? { x: -44 } : direction === 'right' ? { x: 44 } : { y: 44 };

  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.985, ...offset }}
      whileInView={reducedMotion ? undefined : { opacity: 1, scale: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.24, margin: '0px 0px -8% 0px' }}
      transition={{ type: 'spring', stiffness: 72, damping: 18, mass: 0.72 }}
    >
      {children}
    </motion.div>
  );
}

const HeroBrandScene = memo(function HeroBrandScene() {
  const { reducedMotion } = useMotionPreference();
  const sceneRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sceneRef, { margin: '120px' });
  const animateScene = !reducedMotion && inView;

  return (
    <motion.div
      aria-hidden="true"
      ref={sceneRef}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.94, rotate: -2 }}
      animate={reducedMotion ? undefined : { opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 78, damping: 18, delay: 0.14 }}
      className="relative mx-auto aspect-square w-full max-w-[38rem]"
    >
      <motion.div
        className="absolute inset-[5%] rounded-full border border-gold/30"
        animate={animateScene ? { rotate: 360 } : undefined}
        transition={animateScene ? { duration: 34, repeat: Infinity, ease: 'linear' } : undefined}
      >
        <span className="absolute left-[12%] top-[8%] h-3 w-3 rounded-full border border-gold bg-canvas" />
        <span className="absolute bottom-[14%] right-[5%] h-2.5 w-2.5 rounded-full bg-bronze" />
      </motion.div>
      <motion.div
        className="absolute inset-[14%] rounded-full border border-bronze/25"
        animate={animateScene ? { rotate: -360 } : undefined}
        transition={animateScene ? { duration: 42, repeat: Infinity, ease: 'linear' } : undefined}
      >
        <span className="absolute -left-1 top-1/2 h-2 w-2 rounded-full bg-gold" />
        <span className="absolute right-[16%] top-[3%] h-2 w-2 rounded-full border border-bronze bg-paper" />
      </motion.div>
      <motion.div
        className="glass-gold absolute inset-[20%] grid place-items-center overflow-hidden rounded-full"
        animate={animateScene ? { y: [0, -5, 0] } : undefined}
        transition={animateScene ? { duration: 6.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        <BrandSymbol className="h-[84%] w-[84%]" animated={animateScene} />
      </motion.div>
      <motion.span
        className="absolute left-[2%] top-[28%] border border-line bg-paper/90 px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted shadow-card"
        animate={animateScene ? { y: [0, -5, 0] } : undefined}
        transition={animateScene ? { duration: 5.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        observar
      </motion.span>
      <motion.span
        className="absolute bottom-[18%] right-0 border border-line bg-paper/90 px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted shadow-card"
        animate={animateScene ? { y: [0, 5, 0] } : undefined}
        transition={animateScene ? { duration: 5.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        escolher
      </motion.span>
    </motion.div>
  );
});

const MotionRibbon = memo(function MotionRibbon() {
  const { reducedMotion } = useMotionPreference();
  const ribbonRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ribbonRef, { margin: '120px' });
  const content = [...motionWords, ...motionWords];

  return (
    <div ref={ribbonRef} className="overflow-hidden border-y border-gold/20 bg-night py-4 text-gold-pale" aria-hidden="true">
      <motion.div
        className="flex w-max items-center"
        animate={!reducedMotion && inView ? { x: ['0%', '-50%'] } : undefined}
        transition={!reducedMotion && inView ? { duration: 27, repeat: Infinity, ease: 'linear' } : undefined}
      >
        {content.map((word, index) => (
          <span key={`${word}-${index}`} className="flex items-center gap-8 pr-8 text-[0.66rem] font-semibold uppercase tracking-[0.25em]">
            {word}
            <span className="h-1.5 w-1.5 rotate-45 border border-gold" />
          </span>
        ))}
      </motion.div>
    </div>
  );
});

export function LandingPage({ themes, busy, error, onSubmit }: LandingPageProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const stagesRef = useRef<HTMLElement>(null);
  const { reducedMotion } = useMotionPreference();
  const { activeSection, setActiveSection } = useActiveSection(observedSectionIds);
  const { scrollYProgress: stagesProgress } = useScroll({
    target: stagesRef,
    offset: ['start 72%', 'end 42%']
  });
  const stagesTrailScale = useSpring(stagesProgress, {
    stiffness: 110,
    damping: 28,
    mass: 0.35
  });

  function navigateToSection(sectionId: string, event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start'
    });

    if (sectionId === 'iniciar') {
      window.requestAnimationFrame(() => nameInputRef.current?.focus({ preventScroll: true }));
    }
  }

  function focusStart(event: MouseEvent<HTMLAnchorElement>) {
    navigateToSection('iniciar', event);
  }

  return (
    <main className="site-texture min-h-[100dvh] overflow-x-clip bg-canvas text-ink">
      <ScrollProgress />
      <a
        href="#inicio"
        className="fixed left-4 top-3 z-[60] -translate-y-20 rounded-lg bg-night px-4 py-3 text-sm font-semibold text-gold-pale transition-transform focus:translate-y-0"
      >
        Ir para o conteúdo
      </a>

      <header className="sticky top-0 z-50 border-b border-bronze/15 bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto grid min-h-[7.5rem] max-w-[90rem] grid-cols-[auto_1fr_auto] items-center gap-x-4 px-4 sm:px-8 md:h-[4.75rem] md:min-h-0 lg:px-12">
          <a
            href="#inicio"
            onClick={(event) => navigateToSection('inicio', event)}
            aria-label="Método DHA — ir para o início"
          >
            <BrandLogo compact className="transition-transform duration-300 hover:scale-[1.015]" />
          </a>
          <ActiveNavigation
            items={landingNavigation}
            activeSection={activeSection}
            onNavigate={(sectionId, event) => navigateToSection(sectionId, event)}
            className="order-3 col-span-3 flex h-11 items-center gap-6 overflow-x-auto border-t border-bronze/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:order-none md:col-span-1 md:h-auto md:justify-center md:gap-8 md:overflow-visible md:border-0"
          />
          <div className="col-start-3 flex items-center gap-2 justify-self-end">
            <a
              href="#iniciar"
              onClick={focusStart}
              className="group inline-flex min-h-11 items-center gap-2 rounded-xl bg-night px-4 text-sm font-semibold text-gold-pale shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-gold active:scale-[0.98] sm:px-5"
            >
              <span className="sm:hidden">Iniciar</span>
              <span className="hidden sm:inline">Iniciar a jornada</span>
              <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-1" size={16} weight="bold" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <section
        id="inicio"
        className="brand-grid relative scroll-mt-32 border-b border-line md:scroll-mt-24"
      >
        <div className="mx-auto grid min-h-[calc(100dvh-7.5rem)] max-w-[90rem] items-center gap-12 px-4 py-14 sm:px-8 md:min-h-[calc(100dvh-4.75rem)] md:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:px-12">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.085 } }
            }}
            className="relative z-10 max-w-3xl"
          >
            <motion.p
              variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
              transition={{ type: 'spring', stiffness: 90, damping: 20 }}
              className="mb-7 flex items-center gap-3 text-[0.66rem] font-semibold uppercase tracking-[0.25em] text-bronze"
            >
              <span className="h-px w-10 bg-gold" aria-hidden="true" />
              Jornada reflexiva guiada
            </motion.p>
            <motion.h1
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              transition={{ type: 'spring', stiffness: 84, damping: 19 }}
              className="text-balance font-display text-[clamp(3rem,6.2vw,6.9rem)] font-light leading-[0.92] tracking-[-0.055em]"
            >
              Um ciclo para
              <span className="mt-2 block font-semibold text-bronze">observar com mais</span>
              <span className="mt-2 block">consciência.</span>
            </motion.h1>
            <motion.p
              variants={{ hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0 } }}
              transition={{ type: 'spring', stiffness: 86, damping: 20 }}
              className="mt-8 max-w-2xl text-base leading-8 text-muted md:text-lg"
            >
              O Método DHA conduz você por cinco movimentos com palavras, imagens e perguntas abertas.
              O sentido não vem pronto: ele se forma a partir do que você percebe.
            </motion.p>
            <motion.p
              variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
              transition={{ type: 'spring', stiffness: 88, damping: 20 }}
              className="mt-5 flex min-h-8 flex-wrap items-baseline gap-x-2 text-base text-muted md:text-lg"
            >
              <span>Um percurso para</span>
              <TypewriterText
                phrases={typewriterPhrases}
                className="font-serif text-xl italic text-bronze md:text-2xl"
              />
            </motion.p>
            <motion.div
              variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
              transition={{ type: 'spring', stiffness: 90, damping: 20 }}
              className="mt-9 flex flex-col items-start gap-5 sm:flex-row sm:items-center"
            >
              <a href="#iniciar" onClick={focusStart} className="button group min-h-14 px-7">
                Iniciar a jornada
                <ArrowDownRightIcon className="transition-transform duration-300 group-hover:translate-x-1 group-hover:translate-y-1" size={19} weight="bold" aria-hidden="true" />
              </a>
              <a
                href="#etapas"
                onClick={(event) => navigateToSection('etapas', event)}
                className="group inline-flex min-h-11 items-center gap-2 border-b border-bronze/40 text-sm font-semibold text-ink transition-colors hover:border-bronze hover:text-bronze"
              >
                Conhecer o percurso
                <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-1" size={16} aria-hidden="true" />
              </a>
            </motion.div>
            <motion.p
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              className="mt-7 flex max-w-xl items-start gap-2 text-xs leading-5 text-muted"
            >
              <FingerprintSimpleIcon className="mt-0.5 shrink-0 text-bronze" size={16} aria-hidden="true" />
              Sem criar conta ou senha. Retome neste navegador enquanto sua sessão estiver válida.
            </motion.p>
          </motion.div>

          <div className="relative z-10">
            <HeroBrandScene />
            <div className="mx-auto -mt-4 max-w-sm text-center">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.28em] text-bronze">O ciclo do despertar</p>
              <p className="mt-2 font-serif text-lg italic text-muted">sua consciência em expansão</p>
            </div>
          </div>
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.65 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.1 } }
          }}
          className="mx-auto grid max-w-[90rem] border-t border-line bg-paper/72 sm:grid-cols-3 lg:px-8"
        >
          {[
            ['01', 'Sem conta ou senha'],
            ['05', 'Movimentos de observação'],
            ['→', 'Retomada no mesmo navegador']
          ].map(([number, label]) => (
            <motion.div
              key={label}
              variants={{
                hidden: reducedMotion ? {} : { opacity: 0, y: 24 },
                visible: { opacity: 1, y: 0 }
              }}
              transition={{ type: 'spring', stiffness: 86, damping: 19 }}
              className="flex items-center gap-4 border-b border-line px-5 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <span className="font-serif text-2xl italic text-bronze">{number}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <MotionRibbon />

      <section id="metodo" className="brand-grid brand-grid-dark scroll-mt-32 overflow-hidden bg-night text-paper md:scroll-mt-24">
        <div className="mx-auto grid max-w-[90rem] gap-16 px-4 py-24 sm:px-8 md:py-32 lg:grid-cols-[0.72fr_1.28fr] lg:px-12">
          <Reveal direction="left">
            <div className="sticky top-28">
              <BrandSymbol className="h-20 w-20 opacity-80" />
              <p className="mt-8 text-[0.66rem] font-semibold uppercase tracking-[0.25em] text-gold-pale/65">O método</p>
            </div>
          </Reveal>
          <Reveal direction="right">
            <h2 className="max-w-4xl text-balance font-display text-5xl font-light leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              As combinações não dizem quem você é.
            </h2>
            <div className="mt-12 grid gap-8 border-t border-gold-pale/20 pt-9 text-base leading-8 text-paper/68 md:grid-cols-2 md:text-lg">
              <p>Palavras e imagens funcionam como estímulos para observar uma situação por outros ângulos. Elas não possuem significados fixos.</p>
              <p>Você decide o que encontra relação, o que não encontra e o que prefere deixar em aberto.</p>
            </div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.7 }}
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.11 } }
              }}
              className="mt-14 grid gap-4 border-t border-gold-pale/20 pt-7 text-[0.66rem] font-semibold uppercase tracking-[0.17em] text-gold-pale/70 sm:grid-cols-3"
            >
              {['Não é diagnóstico', 'Não é previsão', 'Não define sua personalidade'].map((label) => (
                <motion.span
                  key={label}
                  variants={{
                    hidden: reducedMotion ? {} : { opacity: 0, y: 18 },
                    visible: { opacity: 1, y: 0 }
                  }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  {label}
                </motion.span>
              ))}
            </motion.div>
          </Reveal>
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-[90rem] scroll-mt-32 px-4 py-24 sm:px-8 md:scroll-mt-24 md:py-32 lg:px-12">
        <Reveal className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="eyebrow">Como funciona</p>
            <h2 className="mt-5 max-w-xl text-balance font-display text-4xl font-light leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Um percurso guiado. O sentido continua sendo seu.
            </h2>
          </div>
          <p className="max-w-xl self-end text-lg leading-8 text-muted lg:justify-self-end">
            O processo organiza o caminho sem determinar a chegada. Em cada passo, você continua no centro da observação.
          </p>
        </Reveal>

        <div className="relative mt-16 border-t border-line">
          <span className="absolute bottom-0 left-4 top-0 hidden w-px bg-line md:block" aria-hidden="true" />
          {journeySteps.map(({ number, title, description, Icon }) => (
            <Reveal key={number}>
              <article className="group grid gap-5 border-b border-line py-8 md:grid-cols-[3.25rem_4rem_0.72fr_1.28fr] md:items-center md:gap-8 md:py-10">
                <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full border border-bronze/30 bg-canvas font-serif text-xs italic text-bronze">{number}</span>
                <span className="grid h-12 w-12 place-items-center border border-line bg-paper text-bronze shadow-card transition-[transform,border-color] duration-300 group-hover:-translate-y-1 group-hover:rotate-3 group-hover:border-gold">
                  <Icon size={21} weight="regular" aria-hidden="true" />
                </span>
                <h3 className="font-display text-2xl font-medium tracking-[-0.025em] sm:text-3xl">{title}</h3>
                <p className="max-w-xl leading-7 text-muted md:justify-self-end">{description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section
        id="etapas"
        ref={stagesRef}
        className="brand-grid scroll-mt-32 border-y border-line bg-paper md:scroll-mt-24"
      >
        <div className="mx-auto max-w-[90rem] px-4 py-24 sm:px-8 md:py-32 lg:px-12">
          <Reveal className="grid gap-10 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="eyebrow">O ciclo DHA</p>
              <h2 className="mt-5 max-w-2xl text-balance font-display text-5xl font-light leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">Cinco movimentos de observação.</h2>
            </div>
            <p className="max-w-xl self-end text-lg leading-8 text-muted lg:justify-self-end">Cada conjunto ocupa uma função diferente. As etapas não oferecem conclusões; ajudam a organizar o olhar.</p>
          </Reveal>

          <ol className="relative mt-20 border-t border-line">
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-[1.125rem] top-0 w-px bg-line"
            />
            <motion.span
              aria-hidden="true"
              className="absolute bottom-0 left-[1.125rem] top-0 w-px origin-top bg-gold"
              style={{ scaleY: reducedMotion ? 1 : stagesTrailScale }}
            />
            {methodStages.map((stage, index) => (
              <motion.li
                key={stage.number}
                initial={reducedMotion ? false : 'hidden'}
                whileInView={reducedMotion ? undefined : 'visible'}
                viewport={{ once: true, amount: 0.42 }}
                variants={{
                  hidden: { opacity: 0, y: 36, x: index % 2 === 0 ? -12 : 12 },
                  visible: { opacity: 1, y: 0, x: 0 }
                }}
                transition={{ type: 'spring', stiffness: 82, damping: 19, mass: 0.72 }}
                className="group relative grid gap-4 border-b border-line py-8 pl-14 md:grid-cols-[0.9fr_1.1fr] md:items-baseline md:gap-8 md:py-10 md:pl-20"
              >
                <motion.span
                  variants={{ hidden: { scale: 0.82 }, visible: { scale: 1 } }}
                  transition={{ type: 'spring', stiffness: 210, damping: 18 }}
                  className="absolute left-0 top-7 z-10 grid h-9 w-9 place-items-center rounded-full border border-bronze/40 bg-paper font-serif text-xs italic text-bronze shadow-card md:top-9"
                >
                  {stage.number}
                </motion.span>
                <h3 className="font-display text-2xl font-medium tracking-[-0.025em] sm:text-3xl">{stage.title}</h3>
                <p className="max-w-xl leading-7 text-muted md:justify-self-end">{stage.description}</p>
              </motion.li>
            ))}
          </ol>

          <Reveal className="mt-12 flex justify-start lg:justify-end">
            <a href="#iniciar" onClick={focusStart} className="button group min-h-14 px-7">
              Quero iniciar minha jornada
              <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-1" size={18} weight="bold" aria-hidden="true" />
            </a>
          </Reveal>
        </div>
      </section>

      <section id="tecnologia" className="mx-auto grid max-w-[90rem] scroll-mt-32 gap-6 px-4 py-24 sm:px-8 md:scroll-mt-24 md:py-32 lg:grid-cols-[1.18fr_0.82fr] lg:px-12">
        <Reveal direction="left" className="brand-grid brand-grid-dark relative overflow-hidden bg-night p-8 text-paper sm:p-12 lg:p-16">
          <SparkleIcon className="text-gold" size={29} weight="regular" aria-hidden="true" />
          <p className="mt-14 text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-gold-pale/60">Tecnologia com limites</p>
          <h2 className="mt-5 max-w-3xl text-balance font-display text-4xl font-light leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">A IA formula perguntas. O sentido continua sendo seu.</h2>
          <p className="mt-9 max-w-2xl text-base leading-8 text-paper/68 md:text-lg">Ao final, a tecnologia considera o tema, o relato, as palavras, as descrições objetivas das imagens e a sequência completa para organizar perguntas abertas.</p>
          <p className="mt-5 max-w-2xl text-base leading-8 text-paper/68 md:text-lg">Ela é orientada a não diagnosticar, prever, definir sua personalidade ou prescrever decisões.</p>
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full border border-gold-pale/15" aria-hidden="true" />
        </Reveal>

        <Reveal direction="right" className="flex flex-col justify-between border border-line bg-paper p-8 shadow-card sm:p-12">
          <div>
            <p className="eyebrow">O que esperar</p>
            <h2 className="mt-5 text-balance font-display text-4xl font-light leading-[1.02] tracking-[-0.04em] sm:text-5xl">Não é preciso fazer tudo se encaixar.</h2>
            <p className="mt-7 leading-7 text-muted">Algumas combinações podem parecer próximas da situação. Outras podem não produzir uma associação imediata. Ambas fazem parte do percurso.</p>
          </div>
          <motion.ul
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.6 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.09 } }
            }}
            className="mt-12 space-y-4 border-t border-line pt-7"
          >
            {expectations.map((expectation) => (
              <motion.li
                key={expectation}
                variants={{
                  hidden: reducedMotion ? {} : { opacity: 0, x: 20 },
                  visible: { opacity: 1, x: 0 }
                }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-3 text-sm leading-6 text-muted"
              >
                <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rotate-45 border border-bronze/40 bg-canvas text-bronze">
                  <ArrowRightIcon className="-rotate-45" size={11} weight="bold" aria-hidden="true" />
                </span>
                {expectation}
              </motion.li>
            ))}
          </motion.ul>
        </Reveal>
      </section>

      <section id="privacidade" className="scroll-mt-32 border-y border-line bg-sand/55 md:scroll-mt-24">
        <div className="mx-auto grid max-w-[90rem] gap-12 px-4 py-24 sm:px-8 md:py-32 lg:grid-cols-[0.72fr_1.28fr] lg:px-12">
          <Reveal direction="left">
            <div className="grid h-16 w-16 place-items-center rounded-full border border-bronze/25 bg-paper text-bronze shadow-card">
              <LockKeyOpenIcon size={27} weight="regular" aria-hidden="true" />
            </div>
            <p className="mt-8 eyebrow">Privacidade</p>
          </Reveal>
          <Reveal direction="right">
            <h2 className="max-w-4xl text-balance font-display text-5xl font-light leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">Sem conta. Com clareza sobre o que é necessário.</h2>
            <div className="mt-12 grid gap-8 border-t border-line pt-9 text-base leading-8 text-muted md:grid-cols-2 md:text-lg">
              <p>Para iniciar, você informa nome, e-mail, tema e um breve relato. O formulário apresenta os consentimentos antes do envio.</p>
              <p>A sessão fica vinculada ao navegador atual. A geração das perguntas utiliza um serviço de IA e o contexto necessário da jornada.</p>
            </div>
            <div className="mt-10 flex items-start gap-4 border-t border-line pt-7 text-sm leading-6 text-muted">
              <ShieldCheckIcon className="mt-0.5 shrink-0 text-bronze" size={23} weight="regular" aria-hidden="true" />
              <p>Você pode responder em texto, indicar que não vê relação, dizer que não sabe ou preferir não responder.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="iniciar" className="brand-grid brand-grid-dark scroll-mt-32 bg-night text-paper md:scroll-mt-24">
        <div className="mx-auto grid max-w-[90rem] gap-12 px-4 py-24 sm:px-8 md:py-32 lg:grid-cols-[0.72fr_1.28fr] lg:px-12">
          <Reveal direction="left" className="lg:sticky lg:top-28 lg:self-start">
            <BrandLogo inverse />
            <p className="mt-12 text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-gold-pale/65">Comece aqui</p>
            <h2 className="mt-5 max-w-xl text-balance font-display text-5xl font-light leading-[0.98] tracking-[-0.045em] sm:text-6xl">O que você gostaria de observar hoje?</h2>
            <p className="mt-7 max-w-md text-lg leading-8 text-paper/65">Escolha um tema e descreva a situação do seu jeito. Você não precisa organizar tudo antes de começar.</p>
          </Reveal>

          <Reveal direction="right">
            <motion.form
              onSubmit={onSubmit}
              aria-busy={busy}
              aria-describedby={error ? 'landing-form-error' : undefined}
              initial={reducedMotion ? false : 'hidden'}
              whileInView={reducedMotion ? undefined : 'visible'}
              viewport={{ once: true, amount: 0.15 }}
              variants={{
                hidden: {},
                visible: { transition: { delayChildren: 0.08, staggerChildren: 0.07 } }
              }}
              className="glass-gold p-6 text-ink sm:p-9 lg:p-12"
            >
              {error && (
                <motion.div variants={formItemVariants} id="landing-form-error" role="alert" className="mb-8 border-l-2 border-bronze bg-[#f8ede0] px-5 py-4 text-sm leading-6 text-ink">{error}</motion.div>
              )}

              <motion.div variants={formItemVariants} className="grid gap-6 md:grid-cols-2">
                <label className="block text-sm font-semibold">
                  <span className="mb-2.5 block">Nome</span>
                  <input ref={nameInputRef} name="name" required minLength={2} maxLength={120} autoComplete="name" />
                </label>
                <label className="block text-sm font-semibold">
                  <span className="mb-2.5 block">E-mail para contato</span>
                  <input name="email" type="email" required maxLength={254} autoComplete="email" />
                </label>
              </motion.div>

              <motion.label variants={formItemVariants} className="mt-6 block text-sm font-semibold">
                <span className="mb-2.5 block">Tema</span>
                <select name="themeKey" required defaultValue="">
                  <option value="" disabled>Escolha um tema</option>
                  {themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
                </select>
              </motion.label>

              <motion.label variants={formItemVariants} className="mt-6 block text-sm font-semibold">
                <span className="mb-2.5 block">O que está acontecendo neste momento?</span>
                <textarea name="circumstanceText" required minLength={10} maxLength={5000} rows={6} placeholder="Escreva com suas palavras…" className="resize-y" />
              </motion.label>

              <motion.label variants={formItemVariants} className="mt-7 flex cursor-pointer items-start gap-3 text-sm leading-6 text-muted">
                <input className="mt-1 h-4 w-4 shrink-0" type="checkbox" required />
                <span>Li e aceito o consentimento informado, a política de privacidade e o tratamento dos dados sensíveis para esta jornada.</span>
              </motion.label>

              <motion.div variants={formItemVariants} className="mt-9 flex flex-col items-start gap-5 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
                <button disabled={busy} type="submit" className="button group min-h-14 w-full px-7 sm:w-auto">
                  {busy ? 'Criando jornada…' : 'Iniciar a jornada'}
                  {!busy && <ArrowRightIcon className="transition-transform duration-300 group-hover:translate-x-1" size={18} weight="bold" aria-hidden="true" />}
                </button>
                <p className="max-w-xs text-xs leading-5 text-muted">Siga no seu ritmo e retome neste navegador enquanto sua sessão estiver válida.</p>
              </motion.div>
            </motion.form>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-gold-pale/15 bg-night text-paper">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-8 px-4 py-10 sm:px-8 md:flex-row md:items-start md:justify-between lg:px-12">
          <BrandLogo inverse />
          <p className="max-w-2xl text-xs leading-5 text-paper/55 md:text-right">O Método DHA oferece uma experiência reflexiva. Não é diagnóstico, previsão, psicoterapia ou substituto de cuidado profissional. Em situação de risco ou urgência, procure um serviço de emergência ou um profissional qualificado.</p>
        </div>
      </footer>
    </main>
  );
}
