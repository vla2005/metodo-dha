import { memo } from 'react';
import { motion } from 'framer-motion';
import { useMotionPreference } from './MotionPreference';

interface BrandSymbolProps {
  className?: string;
  animated?: boolean;
  labelled?: boolean;
}

export const BrandSymbol = memo(function BrandSymbol({
  className = '',
  animated = false,
  labelled = false
}: BrandSymbolProps) {
  const { reducedMotion } = useMotionPreference();
  const shouldAnimate = animated && !reducedMotion;

  return (
    <motion.img
      src="/logo.webp"
      className={`object-contain ${className}`}
      alt={labelled ? 'Símbolo do Método DHA' : ''}
      aria-hidden={labelled ? undefined : true}
      draggable={false}
      initial={shouldAnimate ? { opacity: 0, scale: 0.92 } : false}
      animate={shouldAnimate ? { opacity: 1, scale: 1 } : undefined}
      transition={{ type: 'spring', stiffness: 90, damping: 18 }}
    />
  );
});

interface BrandLogoProps {
  className?: string;
  compact?: boolean;
  animated?: boolean;
  inverse?: boolean;
}

export function BrandLogo({
  className = '',
  compact = false,
  animated = false,
  inverse = false
}: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center ${compact ? 'gap-2.5' : 'gap-4'} ${className}`}>
      <BrandSymbol className={compact ? 'h-11 w-11' : 'h-16 w-16'} animated={animated} />
      <span className="min-w-0 leading-none">
        <span className={`block text-[0.58rem] font-medium uppercase tracking-[0.26em] ${inverse ? 'text-gold-pale/75' : 'text-bronze'}`}>
          Método
        </span>
        <strong className={`mt-1 block text-xl font-semibold tracking-[0.15em] ${inverse ? 'text-gold-pale' : 'text-ink'}`}>
          DHA
        </strong>
        {!compact && (
          <>
            <span className={`mt-1.5 block text-[0.56rem] uppercase tracking-[0.13em] ${inverse ? 'text-paper/55' : 'text-muted'}`}>
              O ciclo do despertar
            </span>
            <span className={`mt-1 block font-serif text-[0.68rem] italic ${inverse ? 'text-gold-pale/65' : 'text-muted'}`}>
              sua consciência em expansão
            </span>
          </>
        )}
      </span>
    </span>
  );
}
