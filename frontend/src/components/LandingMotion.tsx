import { motion, useInView, useScroll, useSpring } from 'framer-motion';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import { useMotionPreference } from './MotionPreference';

interface NavigationItem {
  id: string;
  label: string;
  href?: string;
}

interface ActiveNavigationProps {
  items: readonly NavigationItem[];
  activeSection: string;
  onNavigate?: (sectionId: string, event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}

interface TypewriterTextProps {
  phrases: readonly string[];
  className?: string;
}

interface ActiveSectionState {
  activeSection: string;
  setActiveSection: Dispatch<SetStateAction<string>>;
}

const navigationSpring = {
  type: 'spring',
  stiffness: 380,
  damping: 34,
  mass: 0.72
} as const;

// eslint-disable-next-line react-refresh/only-export-components
export function useActiveSection(ids: readonly string[]): ActiveSectionState {
  const idsKey = ids.join('\u0000');
  const initialSection = ids[0] ?? '';
  const [activeSection, setActiveSection] = useState(initialSection);

  useEffect(() => {
    if (!ids.length || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const sectionIds = idsKey.split('\u0000').filter(Boolean);
    const sectionIdSet = new Set(sectionIds);
    const entriesById = new Map<string, IntersectionObserverEntry>();
    let observer: IntersectionObserver | null = null;
    let resizeFrame = 0;

    const observeSections = () => {
      observer?.disconnect();
      entriesById.clear();

      const viewportHeight = Math.max(window.innerHeight, 1);
      const anchorFromTop = Math.round(viewportHeight * 0.28);
      const anchorFromBottom = Math.max(viewportHeight - anchorFromTop - 2, 0);

      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          entriesById.set(entry.target.id, entry);
        }

        const viewportAnchor = window.innerHeight * 0.28;
        const intersecting = [...entriesById.values()]
          .filter((entry) => entry.isIntersecting && sectionIdSet.has(entry.target.id))
          .sort(
            (first, second) =>
              Math.abs(first.boundingClientRect.top - viewportAnchor) -
              Math.abs(second.boundingClientRect.top - viewportAnchor)
          );

        const nextSection = intersecting[0]?.target.id;
        if (nextSection) {
          setActiveSection((currentSection) =>
            currentSection === nextSection ? currentSection : nextSection
          );
        }
      }, {
        rootMargin: `-${anchorFromTop}px 0px -${anchorFromBottom}px 0px`,
        threshold: 0
      });

      for (const sectionId of sectionIds) {
        const section = document.getElementById(sectionId);
        if (section) {
          observer.observe(section);
        }
      }
    };

    const handleResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(observeSections);
    };

    observeSections();
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      entriesById.clear();
    };
  }, [ids.length, idsKey]);

  const stableActiveSection = ids.includes(activeSection) ? activeSection : initialSection;

  return { activeSection: stableActiveSection, setActiveSection };
}

export const ScrollProgress = memo(function ScrollProgress() {
  const { reducedMotion } = useMotionPreference();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 34,
    mass: 0.24,
    restDelta: 0.001
  });

  return reducedMotion ? null : (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5 origin-left bg-gold"
      style={{ scaleX }}
    />
  );
});

export const TypewriterText = memo(function TypewriterText({
  phrases,
  className = ''
}: TypewriterTextProps) {
  const { reducedMotion } = useMotionPreference();
  const typewriterRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(typewriterRef, { margin: '120px' });
  const phrasesKey = phrases.join('\u0000');
  const stablePhrases = useMemo(
    () => phrasesKey.split('\u0000').filter(Boolean),
    [phrasesKey]
  );
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const currentPhrase = stablePhrases[phraseIndex % Math.max(stablePhrases.length, 1)] ?? '';
  const accessiblePhrase = stablePhrases[0] ?? '';
  const longestPhrase = useMemo(
    () => stablePhrases.reduce((longest, phrase) =>
      phrase.length > longest.length ? phrase : longest, ''),
    [stablePhrases]
  );

  useEffect(() => {
    if (reducedMotion || !inView || !stablePhrases.length) {
      return undefined;
    }

    let delay = isDeleting ? 30 : 58;
    let nextAction: () => void;

    if (!isDeleting && characterCount < currentPhrase.length) {
      nextAction = () => setCharacterCount((count) => count + 1);
    } else if (!isDeleting) {
      delay = 1_450;
      nextAction = () => setIsDeleting(true);
    } else if (characterCount > 0) {
      nextAction = () => setCharacterCount((count) => Math.max(0, count - 1));
    } else {
      delay = 320;
      nextAction = () => {
        setPhraseIndex((index) => (index + 1) % stablePhrases.length);
        setIsDeleting(false);
      };
    }

    const timer = window.setTimeout(nextAction, delay);
    return () => window.clearTimeout(timer);
  }, [characterCount, currentPhrase, inView, isDeleting, reducedMotion, stablePhrases.length]);

  const visiblePhrase = reducedMotion ? accessiblePhrase : currentPhrase.slice(0, characterCount);

  return (
    <span ref={typewriterRef} className={`inline-grid ${className}`}>
      <span className="sr-only">{accessiblePhrase}</span>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {longestPhrase}
      </span>
      <span aria-hidden="true" className="col-start-1 row-start-1">
        {visiblePhrase}
        {!reducedMotion && inView && stablePhrases.length > 0 ? (
          <motion.span
            className="ml-[0.08em] inline-block h-[0.82em] w-[0.06em] translate-y-[0.06em] bg-current"
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.45, 0.5, 1] }}
          />
        ) : null}
      </span>
    </span>
  );
});

export const ActiveNavigation = memo(function ActiveNavigation({
  items,
  activeSection,
  onNavigate,
  className = ''
}: ActiveNavigationProps) {
  const { reducedMotion } = useMotionPreference();
  const navigationRef = useRef<HTMLElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());

  useEffect(() => {
    const navigation = navigationRef.current;
    const activeLink = linkRefs.current.get(activeSection);
    if (!navigation || !activeLink || navigation.scrollWidth <= navigation.clientWidth) {
      return;
    }

    navigation.scrollTo({
      left: activeLink.offsetLeft - (navigation.clientWidth - activeLink.offsetWidth) / 2,
      behavior: reducedMotion ? 'auto' : 'smooth'
    });
  }, [activeSection, reducedMotion]);

  return (
    <nav ref={navigationRef} className={className} aria-label="Navegação principal">
      {items.map((item) => {
        const isActive = activeSection === item.id;

        return (
          <a
            key={item.id}
            ref={(node) => {
              if (node) {
                linkRefs.current.set(item.id, node);
              } else {
                linkRefs.current.delete(item.id);
              }
            }}
            href={item.href ?? `#${item.id}`}
            onClick={(event) => onNavigate?.(item.id, event)}
            aria-current={isActive ? 'location' : undefined}
            className={`group relative shrink-0 whitespace-nowrap py-2 text-sm font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:text-bronze ${
              isActive ? 'text-bronze' : 'text-muted hover:text-ink'
            }`}
          >
            <span>{item.label}</span>
            {isActive ? (
              <motion.span
                layoutId="landing-active-navigation-indicator"
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-px h-px origin-center bg-gold"
                transition={reducedMotion ? { duration: 0 } : navigationSpring}
              />
            ) : null}
          </a>
        );
      })}
    </nav>
  );
});
